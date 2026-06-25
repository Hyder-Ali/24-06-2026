// NBA Scorigami Dashboard JavaScript Application

document.addEventListener("DOMContentLoaded", () => {
    // 1. Application State
    const state = {
        theme: "dark",
        games: [],        // Raw processed games array
        teams: {},        // Team ID mapping
        stats: {},        // Scorigami stats history
        filters: {
            team: "all",
            type: "all",
            mode: "home-visitor", // or "win-loss"
            maxYear: 2026
        },
        selectedScore: null, // {x: score1, y: score2}
        hoveredCell: null,   // {x, y, count, ...}
        animation: {
            isPlaying: false,
            currentYear: 1946,
            intervalId: null,
            speed: 120 // ms per year
        },
        grid: {
            minScore: 15,
            maxScore: 190,
            range: 175,
            padding: { left: 45, right: 15, top: 15, bottom: 45 }
        }
    };

    // 2. DOM Elements
    const elements = {
        themeToggle: document.getElementById("theme-toggle"),
        filterTeam: document.getElementById("filter-team"),
        filterType: document.getElementById("filter-type"),
        modeHomeVisitor: document.getElementById("mode-home-visitor"),
        modeWinLoss: document.getElementById("mode-win-loss"),
        btnAnimPlay: document.getElementById("btn-anim-play"),
        animYearSlider: document.getElementById("anim-year-slider"),
        animYearVal: document.getElementById("anim-year-val"),
        
        statUniqueCount: document.getElementById("stat-unique-count"),
        statScorigamiPct: document.getElementById("stat-scorigami-pct"),
        statTotalGames: document.getElementById("stat-total-games"),
        
        canvasMain: document.getElementById("scorigami-canvas"),
        canvasContainer: document.getElementById("canvas-container"),
        gridTooltip: document.getElementById("grid-tooltip"),
        gridModeTitle: document.getElementById("grid-mode-title"),
        
        detailsPanel: document.getElementById("details-panel"),
        detailsEmptyState: document.getElementById("details-empty-state"),
        detailsContent: document.getElementById("details-content"),
        detailsScoreLabel: document.getElementById("details-score-label"),
        btnCloseDetails: document.getElementById("btn-close-details"),
        detailCount: document.getElementById("detail-count"),
        detailFirstDate: document.getElementById("detail-first-date"),
        detailFirstHome: document.getElementById("detail-first-home"),
        detailFirstAway: document.getElementById("detail-first-away"),
        detailFirstScore: document.getElementById("detail-first-score"),
        detailFirstMetaDate: document.getElementById("detail-first-meta-date"),
        detailFirstMetaType: document.getElementById("detail-first-meta-type"),
        detailsGamesList: document.getElementById("details-games-list"),
        recentScorigamisList: document.getElementById("recent-scorigamis-list")
    };

    // 3. Init Application
    async function init() {
        showLoadingState();
        try {
            // Load setup metadata
            const teamsResponse = await fetch("teams.json");
            state.teams = await teamsResponse.json();
            
            const statsResponse = await fetch("scorigami_stats.json");
            state.stats = await statsResponse.json();
            
            // Load cleaned games CSV
            const gamesResponse = await fetch("games_clean.csv");
            const gamesCSV = await gamesResponse.text();
            parseGamesData(gamesCSV);
            
            // Populate Filters
            populateTeamDropdown();
            
            // Setup Event Listeners
            setupEventListeners();
            
            // Initial Render
            render();
            renderMiniCharts();
            renderRecentScorigamis();
            
        } catch (error) {
            console.error("Initialization error:", error);
            alert("Error loading Scorigami dataset. Please ensure files are placed in the directory.");
        }
    }

    // 4. Parse CSV Helper
    function parseGamesData(csvText) {
        const lines = csvText.trim().split("\n");
        const games = [];
        for (let i = 1; i < lines.length; i++) {
            const row = lines[i].split(",");
            if (row.length < 6) continue;
            games.push({
                d: row[0],                 // YYYY-MM-DD
                year: parseInt(row[0].substring(0, 4)),
                h: parseInt(row[1]),       // Home Team ID
                a: parseInt(row[2]),       // Away Team ID
                hs: parseInt(row[3]),      // Home Score
                as: parseInt(row[4]),      // Away Score
                t: row[5]                  // Code: R, P, I, C, S, A, O
            });
        }
        state.games = games;
    }

    // 5. Populate Filters
    function populateTeamDropdown() {
        const teamsArray = Object.entries(state.teams).map(([id, t]) => ({
            id: parseInt(id),
            text: `${t.city} ${t.name}`
        })).sort((a, b) => a.text.localeCompare(b.text));
        
        teamsArray.forEach(team => {
            const opt = document.createElement("option");
            opt.value = team.id;
            opt.textContent = team.text;
            elements.filterTeam.appendChild(opt);
        });
    }

    function showLoadingState() {
        elements.statUniqueCount.textContent = "...";
        elements.statTotalGames.textContent = "...";
    }

    // 6. Color scales mapping
    function getCellColor(count) {
        const theme = document.documentElement.getAttribute("data-theme") || "dark";
        if (theme === "dark") {
            if (count === 0) return "var(--grid-zero)";
            if (count === 1) return "#2c1f5a"; // Deep Indigo/purple
            if (count <= 3) return "#581c87";  // Violet
            if (count <= 7) return "#86198f";  // Purple
            if (count <= 15) return "#be185d"; // Pink
            if (count <= 30) return "#e11d48"; // Rose
            if (count <= 60) return "#f97316"; // Orange
            return "#fbbf24"; // Yellow
        } else {
            if (count === 0) return "var(--grid-zero)";
            if (count === 1) return "#c7d2fe"; // Indigo-200
            if (count <= 3) return "#818cf8";  // Indigo-400
            if (count <= 7) return "#4f46e5";  // Indigo-600
            if (count <= 15) return "#a855f7"; // Purple-500
            if (count <= 30) return "#ec4899"; // Pink-500
            if (count <= 60) return "#ea580c"; // Orange-600
            return "#dc2626"; // Red-600
        }
    }

    // 7. Core Grid Computation
    function computeGridData() {
        const grid = Array.from({ length: state.grid.range + 1 }, () => 
            Array.from({ length: state.grid.range + 1 }, () => ({
                count: 0,
                gamesList: []
            }))
        );
        
        let filteredGamesCount = 0;
        
        // Filter and compile
        for (let i = 0; i < state.games.length; i++) {
            const g = state.games[i];
            
            // Filter by max year (Animation constraint)
            if (g.year > state.filters.maxYear) continue;
            
            // Filter by game type
            if (state.filters.type !== "all" && g.t !== state.filters.type) continue;
            
            // Filter by team
            if (state.filters.team !== "all") {
                const teamId = parseInt(state.filters.team);
                if (g.h !== teamId && g.a !== teamId) continue;
            }
            
            filteredGamesCount++;
            
            // Coordinates mapping
            let xIdx, yIdx;
            if (state.filters.mode === "home-visitor") {
                xIdx = g.hs - state.grid.minScore;
                yIdx = g.as - state.grid.minScore;
            } else {
                // Win-Loss Mode
                const w = Math.max(g.hs, g.as);
                const l = Math.min(g.hs, g.as);
                xIdx = w - state.grid.minScore;
                yIdx = l - state.grid.minScore;
            }
            
            // Bounds check
            if (xIdx >= 0 && xIdx <= state.grid.range && yIdx >= 0 && yIdx <= state.grid.range) {
                grid[xIdx][yIdx].count++;
                grid[xIdx][yIdx].gamesList.push(g);
            }
        }
        
        // Count filled/unique cells
        let uniqueScoresCount = 0;
        for (let x = 0; x <= state.grid.range; x++) {
            for (let y = 0; y <= state.grid.range; y++) {
                if (grid[x][y].count > 0) {
                    uniqueScoresCount++;
                }
            }
        }
        
        return { grid, uniqueScoresCount, filteredGamesCount };
    }

    // 8. Grid Renderer
    let activeGridData = null;
    
    function render() {
        const { grid, uniqueScoresCount, filteredGamesCount } = computeGridData();
        activeGridData = grid;
        
        // Update Stats
        elements.statUniqueCount.textContent = uniqueScoresCount.toLocaleString();
        elements.statTotalGames.textContent = filteredGamesCount.toLocaleString();
        
        // Calculate Scorigami Rate / Percentage
        // Possible scores space is technically infinite, but relative to a maximum of 190x190 box:
        // In win-loss mode, loser <= winner, so half the grid is used.
        const totalPossible = state.filters.mode === "home-visitor" 
            ? (state.grid.range * state.grid.range) 
            : ((state.grid.range * (state.grid.range + 1)) / 2);
        const pct = (uniqueScoresCount / totalPossible) * 100;
        elements.statScorigamiPct.textContent = pct.toFixed(1);
        
        // Update Title
        if (state.filters.mode === "home-visitor") {
            elements.gridModeTitle.textContent = "Home PTS (X) vs. Visitor PTS (Y)";
        } else {
            elements.gridModeTitle.textContent = "Winning PTS (X) vs. Losing PTS (Y)";
        }

        // Draw Canvas Grid
        drawGridCanvas(grid);
        
        // Update selection details if active
        if (state.selectedScore) {
            updateDetailsPanel(state.selectedScore.x, state.selectedScore.y);
        }
    }

    function drawGridCanvas(grid) {
        const canvas = elements.canvasMain;
        const ctx = canvas.getContext("2d");
        const container = elements.canvasContainer;
        
        // Size elements properly
        const size = Math.min(container.clientWidth - 10, 720);
        canvas.style.width = `${size}px`;
        canvas.style.height = `${size}px`;
        
        // Set high DPI buffer
        const dpr = window.devicePixelRatio || 1;
        canvas.width = size * dpr;
        canvas.height = size * dpr;
        ctx.scale(dpr, dpr);
        
        const p = state.grid.padding;
        const plotW = size - p.left - p.right;
        const plotH = size - p.top - p.bottom;
        const cellSize = plotW / (state.grid.range + 1);
        
        // Clear background
        ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--grid-bg').trim();
        ctx.fillRect(0, 0, size, size);
        
        // Draw grid squares
        for (let x = 0; x <= state.grid.range; x++) {
            const scoreX = x + state.grid.minScore;
            for (let y = 0; y <= state.grid.range; y++) {
                const scoreY = y + state.grid.minScore;
                
                // If win-loss mode, loser must be <= winner
                if (state.filters.mode === "win-loss" && scoreY > scoreX) {
                    continue;
                }
                
                const cell = grid[x][y];
                const cx = p.left + x * cellSize;
                // Canvas Y coordinates go top-to-bottom, but we want score to go bottom-to-top
                const cy = p.top + (state.grid.range - y) * cellSize;
                
                // Fill cell
                ctx.fillStyle = getCellColor(cell.count);
                ctx.fillRect(cx, cy, cellSize - 0.5, cellSize - 0.5);
            }
        }
        
        // Draw Diagonal Reference Line (Ties are impossible in NBA)
        ctx.save();
        ctx.beginPath();
        ctx.strokeStyle = "rgba(239, 68, 68, 0.4)"; // Faint red dashed line
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 2]);
        ctx.moveTo(p.left, p.top + plotH);
        ctx.lineTo(p.left + plotW, p.top);
        ctx.stroke();
        ctx.restore();
        
        // Draw Guidelines / Crosshairs for hover
        if (state.hoveredCell) {
            const hx = state.hoveredCell.x - state.grid.minScore;
            const hy = state.hoveredCell.y - state.grid.minScore;
            
            ctx.save();
            ctx.strokeStyle = state.theme === "dark" ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.15)";
            ctx.lineWidth = 1;
            ctx.setLineDash([2, 4]);
            
            // X guidance line
            const cx = p.left + hx * cellSize + (cellSize / 2);
            ctx.beginPath();
            ctx.moveTo(cx, p.top);
            ctx.lineTo(cx, p.top + plotH);
            ctx.stroke();
            
            // Y guidance line
            const cy = p.top + (state.grid.range - hy) * cellSize + (cellSize / 2);
            ctx.beginPath();
            ctx.moveTo(p.left, cy);
            ctx.lineTo(p.left + plotW, cy);
            ctx.stroke();
            
            // Outline hovered cell
            ctx.strokeStyle = state.theme === "dark" ? "#ffffff" : "#000000";
            ctx.lineWidth = 1.5;
            ctx.setLineDash([]);
            ctx.strokeRect(p.left + hx * cellSize - 0.5, p.top + (state.grid.range - hy) * cellSize - 0.5, cellSize + 0.5, cellSize + 0.5);
            ctx.restore();
        }
        
        // Draw locked selection outline
        if (state.selectedScore) {
            const sx = state.selectedScore.x - state.grid.minScore;
            const sy = state.selectedScore.y - state.grid.minScore;
            
            ctx.save();
            ctx.strokeStyle = "var(--brand-success)";
            ctx.lineWidth = 2;
            ctx.strokeRect(p.left + sx * cellSize - 1, p.top + (state.grid.range - sy) * cellSize - 1, cellSize + 1.5, cellSize + 1.5);
            ctx.restore();
        }
        
        // Draw Axes Labels and Ticks
        ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--text-secondary').trim();
        ctx.font = `500 9px var(--font-body)`;
        ctx.textAlign = "center";
        
        // X-axis ticks (ticks every 10 points)
        for (let score = 20; score <= 190; score += 10) {
            const idx = score - state.grid.minScore;
            if (idx < 0 || idx > state.grid.range) continue;
            
            const cx = p.left + idx * cellSize + (cellSize / 2);
            // Draw small tick line
            ctx.beginPath();
            ctx.strokeStyle = "var(--border-color)";
            ctx.moveTo(cx, p.top + plotH);
            ctx.lineTo(cx, p.top + plotH + 3);
            ctx.stroke();
            
            // Draw number
            ctx.fillText(score, cx, p.top + plotH + 12);
        }
        
        // Y-axis ticks
        ctx.textAlign = "right";
        ctx.textBaseline = "middle";
        for (let score = 20; score <= 190; score += 10) {
            const idx = score - state.grid.minScore;
            if (idx < 0 || idx > state.grid.range) continue;
            
            const cy = p.top + (state.grid.range - idx) * cellSize + (cellSize / 2);
            // Draw tick line
            ctx.beginPath();
            ctx.strokeStyle = "var(--border-color)";
            ctx.moveTo(p.left - 3, cy);
            ctx.lineTo(p.left, cy);
            ctx.stroke();
            
            // Draw number
            ctx.fillText(score, p.left - 6, cy);
        }
        
        // Axis Title text
        ctx.save();
        ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--text-primary').trim();
        ctx.font = `600 11px var(--font-heading)`;
        
        // X Axis Title
        ctx.textAlign = "center";
        const xTitle = state.filters.mode === "home-visitor" ? "HOME POINTS" : "WINNING POINTS";
        ctx.fillText(xTitle, p.left + plotW / 2, size - 12);
        
        // Y Axis Title
        ctx.translate(14, p.top + plotH / 2);
        ctx.rotate(-Math.PI / 2);
        const yTitle = state.filters.mode === "home-visitor" ? "VISITOR POINTS" : "LOSING POINTS";
        ctx.fillText(yTitle, 0, 0);
        ctx.restore();
    }

    // 9. Interactive Canvas Hover detection
    function handleCanvasHover(e) {
        if (!activeGridData) return;
        
        const canvas = elements.canvasMain;
        const rect = canvas.getBoundingClientRect();
        
        // Compute relative click coordinate
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        
        const size = rect.width;
        const p = state.grid.padding;
        const plotW = size - p.left - p.right;
        const plotH = size - p.top - p.bottom;
        const cellSize = plotW / (state.grid.range + 1);
        
        // Check bounds
        const insideX = mouseX >= p.left && mouseX <= p.left + plotW;
        const insideY = mouseY >= p.top && mouseY <= p.top + plotH;
        
        if (insideX && insideY) {
            const xIdx = Math.floor((mouseX - p.left) / cellSize);
            // Invert Y coordinate
            const yIdx = Math.floor((plotH - (mouseY - p.top)) / cellSize);
            
            const scoreX = xIdx + state.grid.minScore;
            const scoreY = yIdx + state.grid.minScore;
            
            // Check win-loss limit
            if (state.filters.mode === "win-loss" && scoreY > scoreX) {
                hideTooltip();
                state.hoveredCell = null;
                drawGridCanvas(activeGridData);
                return;
            }
            
            const cell = activeGridData[xIdx][yIdx];
            state.hoveredCell = { x: scoreX, y: scoreY, count: cell.count };
            
            showTooltip(e, scoreX, scoreY, cell.count, cell.gamesList);
            drawGridCanvas(activeGridData);
        } else {
            hideTooltip();
            if (state.hoveredCell) {
                state.hoveredCell = null;
                drawGridCanvas(activeGridData);
            }
        }
    }

    function showTooltip(e, x, y, count, gamesList) {
        const tooltip = elements.gridTooltip;
        
        let contentHtml = `
            <div class="tooltip-score">
                <span>${x} - ${y}</span>
                <span class="badge">${count} game${count === 1 ? '' : 's'}</span>
            </div>
        `;
        
        if (count > 0) {
            const firstGame = gamesList[0];
            const homeTeam = state.teams[firstGame.h] || { city: "", name: "Unknown" };
            const awayTeam = state.teams[firstGame.a] || { city: "", name: "Unknown" };
            
            contentHtml += `
                <div class="tooltip-meta tooltip-matchup">
                    ${homeTeam.name} ${firstGame.hs} vs ${firstGame.as} ${awayTeam.name}
                </div>
                <div class="tooltip-meta">First occurrence: ${firstGame.d}</div>
            `;
        } else {
            contentHtml += `
                <div class="tooltip-meta">Never occurred!</div>
                <div class="tooltip-meta" style="color: var(--brand-success);">★ Scorigami Opportunity</div>
            `;
        }
        
        tooltip.innerHTML = contentHtml;
        tooltip.classList.remove("hidden");
        
        // Position tooltip relative to container
        const containerRect = elements.canvasContainer.getBoundingClientRect();
        const tooltipW = 220;
        const tooltipH = 100;
        
        let tx = e.clientX - containerRect.left + 15;
        let ty = e.clientY - containerRect.top + 15;
        
        // Collision checks
        if (tx + tooltipW > containerRect.width) {
            tx = e.clientX - containerRect.left - tooltipW - 15;
        }
        if (ty + tooltipH > containerRect.height) {
            ty = e.clientY - containerRect.top - tooltipH - 15;
        }
        
        tooltip.style.left = `${tx}px`;
        tooltip.style.top = `${ty}px`;
    }

    function hideTooltip() {
        elements.gridTooltip.classList.add("hidden");
    }

    // 10. Click Score Selector / Match Details Panel
    function handleCanvasClick(e) {
        if (!activeGridData) return;
        
        const canvas = elements.canvasMain;
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        
        const size = rect.width;
        const p = state.grid.padding;
        const plotW = size - p.left - p.right;
        const plotH = size - p.top - p.bottom;
        const cellSize = plotW / (state.grid.range + 1);
        
        const insideX = mouseX >= p.left && mouseX <= p.left + plotW;
        const insideY = mouseY >= p.top && mouseY <= p.top + plotH;
        
        if (insideX && insideY) {
            const xIdx = Math.floor((mouseX - p.left) / cellSize);
            const yIdx = Math.floor((plotH - (mouseY - p.top)) / cellSize);
            
            const scoreX = xIdx + state.grid.minScore;
            const scoreY = yIdx + state.grid.minScore;
            
            if (state.filters.mode === "win-loss" && scoreY > scoreX) return;
            
            const cell = activeGridData[xIdx][yIdx];
            if (cell.count > 0) {
                state.selectedScore = { x: scoreX, y: scoreY };
                updateDetailsPanel(scoreX, scoreY);
            } else {
                state.selectedScore = null;
                resetDetailsPanel();
            }
            drawGridCanvas(activeGridData);
        }
    }

    function getGameTypeLabel(code) {
        switch (code) {
            case "R": return "Regular Season";
            case "P": return "Playoffs";
            case "I": return "Play-in Tournament";
            case "C": return "NBA Cup";
            case "S": return "Preseason";
            case "A": return "All-Star Game";
            default: return "Other Game";
        }
    }

    function updateDetailsPanel(scoreX, scoreY) {
        const cell = activeGridData[scoreX - state.grid.minScore][scoreY - state.grid.minScore];
        if (!cell || cell.count === 0) {
            resetDetailsPanel();
            return;
        }
        
        elements.detailsEmptyState.classList.add("hidden");
        elements.detailsContent.classList.remove("hidden");
        
        // Set header
        elements.detailsScoreLabel.textContent = `${scoreX} - ${scoreY}`;
        elements.detailCount.textContent = cell.count;
        
        // Find games matching this score
        const games = cell.gamesList.sort((a, b) => b.d.localeCompare(a.d)); // Most recent first
        const firstGame = games[games.length - 1];
        
        // Update first game box
        elements.detailFirstDate.textContent = firstGame.d;
        
        const homeTeam = state.teams[firstGame.h] || { city: "", name: "Unknown" };
        const awayTeam = state.teams[firstGame.a] || { city: "", name: "Unknown" };
        
        elements.detailFirstHome.textContent = `${homeTeam.city} ${homeTeam.name}`;
        elements.detailFirstAway.textContent = `${awayTeam.city} ${awayTeam.name}`;
        elements.detailFirstScore.textContent = `${firstGame.hs} - ${firstGame.as}`;
        elements.detailFirstMetaDate.textContent = firstGame.d;
        elements.detailFirstMetaType.textContent = getGameTypeLabel(firstGame.t);
        
        // Update game list scroll
        elements.detailsGamesList.innerHTML = "";
        games.forEach(game => {
            const hTeam = state.teams[game.h] || { name: "Unknown" };
            const aTeam = state.teams[game.a] || { name: "Unknown" };
            
            const gameDiv = document.createElement("div");
            gameDiv.className = "game-item";
            if (game.t === "P") gameDiv.classList.add("playoff");
            if (game.t === "C") gameDiv.classList.add("cup");
            
            gameDiv.innerHTML = `
                <div class="gi-type">${getGameTypeLabel(game.t)}</div>
                <div class="gi-date">${game.d}</div>
                <div class="gi-matchup">${hTeam.name} vs ${aTeam.name}</div>
                <div class="gi-score">${game.hs} - ${game.as}</div>
            `;
            elements.detailsGamesList.appendChild(gameDiv);
        });
    }

    function resetDetailsPanel() {
        state.selectedScore = null;
        elements.detailsEmptyState.classList.remove("hidden");
        elements.detailsContent.classList.add("hidden");
    }

    // 11. Mini Chart Drawing Function
    function renderMiniCharts() {
        if (!state.stats.years) return;
        
        drawNewScoresChart();
        drawCumulativeChart();
    }

    function drawNewScoresChart() {
        const canvas = document.getElementById("chart-new-scores");
        const ctx = canvas.getContext("2d");
        const w = canvas.width;
        const h = canvas.height;
        
        ctx.clearRect(0, 0, w, h);
        
        // Find max value for scaling
        const maxVal = Math.max(...state.stats.new_scores) * 1.1;
        const yearsCount = state.stats.years.length;
        const padding = { left: 25, right: 10, top: 10, bottom: 20 };
        const chartW = w - padding.left - padding.right;
        const chartH = h - padding.top - padding.bottom;
        
        // Draw grid lines
        ctx.strokeStyle = "rgba(148, 163, 184, 0.1)";
        ctx.lineWidth = 1;
        
        // Y-axis levels
        ctx.beginPath();
        for (let i = 0; i <= 3; i++) {
            const cy = padding.top + (chartH / 3) * i;
            ctx.moveTo(padding.left, cy);
            ctx.lineTo(w - padding.right, cy);
        }
        ctx.stroke();
        
        // Draw scores line/bars
        ctx.save();
        ctx.fillStyle = "rgba(99, 102, 241, 0.5)"; // Indigo translucent
        ctx.strokeStyle = "var(--brand-primary-hover)";
        ctx.lineWidth = 1.5;
        
        ctx.beginPath();
        for (let i = 0; i < yearsCount; i++) {
            const x = padding.left + (chartW / (yearsCount - 1)) * i;
            const val = state.stats.new_scores[i];
            const y = padding.top + chartH - (chartH * (val / maxVal));
            
            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }
        ctx.stroke();
        
        // Draw Area underneath
        ctx.lineTo(padding.left + chartW, padding.top + chartH);
        ctx.lineTo(padding.left, padding.top + chartH);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        
        // Draw X-axis ticks (Year marks)
        ctx.fillStyle = "var(--text-secondary)";
        ctx.font = "8px var(--font-body)";
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        
        const yearLabels = [1950, 1970, 1990, 2010, 2026];
        yearLabels.forEach(year => {
            const idx = state.stats.years.indexOf(year);
            if (idx !== -1) {
                const x = padding.left + (chartW / (yearsCount - 1)) * idx;
                ctx.fillText(year, x, padding.top + chartH + 4);
            }
        });
        
        // Draw Y-axis ticks
        ctx.textAlign = "right";
        ctx.textBaseline = "middle";
        ctx.fillText("0", padding.left - 4, padding.top + chartH);
        ctx.fillText(Math.round(maxVal / 2), padding.left - 4, padding.top + chartH / 2);
        ctx.fillText(Math.round(maxVal * 0.9), padding.left - 4, padding.top + 5);
    }

    function drawCumulativeChart() {
        const canvas = document.getElementById("chart-cumulative");
        const ctx = canvas.getContext("2d");
        const w = canvas.width;
        const h = canvas.height;
        
        ctx.clearRect(0, 0, w, h);
        
        const maxVal = Math.max(...state.stats.cumulative) * 1.05;
        const yearsCount = state.stats.years.length;
        const padding = { left: 30, right: 10, top: 10, bottom: 20 };
        const chartW = w - padding.left - padding.right;
        const chartH = h - padding.top - padding.bottom;
        
        // Grid Lines
        ctx.strokeStyle = "rgba(148, 163, 184, 0.1)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let i = 0; i <= 3; i++) {
            const cy = padding.top + (chartH / 3) * i;
            ctx.moveTo(padding.left, cy);
            ctx.lineTo(w - padding.right, cy);
        }
        ctx.stroke();
        
        // Area Gradient fill
        const gradient = ctx.createLinearGradient(0, padding.top, 0, padding.top + chartH);
        gradient.addColorStop(0, "rgba(236, 72, 153, 0.5)"); // Pink translucent
        gradient.addColorStop(1, "rgba(236, 72, 153, 0.0)");
        
        ctx.save();
        ctx.fillStyle = gradient;
        ctx.strokeStyle = "#ec4899"; // Pink-500
        ctx.lineWidth = 2;
        
        ctx.beginPath();
        for (let i = 0; i < yearsCount; i++) {
            const x = padding.left + (chartW / (yearsCount - 1)) * i;
            const val = state.stats.cumulative[i];
            const y = padding.top + chartH - (chartH * (val / maxVal));
            
            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }
        ctx.stroke();
        
        // Fill Area
        ctx.lineTo(padding.left + chartW, padding.top + chartH);
        ctx.lineTo(padding.left, padding.top + chartH);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        
        // Years label
        ctx.fillStyle = "var(--text-secondary)";
        ctx.font = "8px var(--font-body)";
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        
        const yearLabels = [1950, 1970, 1990, 2010, 2026];
        yearLabels.forEach(year => {
            const idx = state.stats.years.indexOf(year);
            if (idx !== -1) {
                const x = padding.left + (chartW / (yearsCount - 1)) * idx;
                ctx.fillText(year, x, padding.top + chartH + 4);
            }
        });
        
        // Y tick counts
        ctx.textAlign = "right";
        ctx.textBaseline = "middle";
        ctx.fillText("0", padding.left - 4, padding.top + chartH);
        ctx.fillText(Math.round(maxVal / 2).toLocaleString(), padding.left - 4, padding.top + chartH / 2);
        ctx.fillText(Math.round(maxVal * 0.95).toLocaleString(), padding.left - 4, padding.top + 5);
    }

    // 12. Recent Scorigamis list populated dynamically
    function renderRecentScorigamis() {
        if (!state.games.length) return;
        
        // Filter unique winner-loser scores
        const winnerLoserMap = new Map();
        
        state.games.forEach(g => {
            const w = Math.max(g.hs, g.as);
            const l = Math.min(g.hs, g.as);
            const key = `${w}-${l}`;
            if (!winnerLoserMap.has(key)) {
                winnerLoserMap.set(key, g); // First occurrence due to chronological sorting
            }
        });
        
        // Sort first occurrences by date descending (most recently established scorigamis)
        const recentScorigamis = Array.from(winnerLoserMap.values())
            .sort((a, b) => b.d.localeCompare(a.d))
            .slice(0, 5); // Take top 5
            
        elements.recentScorigamisList.innerHTML = "";
        
        recentScorigamis.forEach(g => {
            const w = Math.max(g.hs, g.as);
            const l = Math.min(g.hs, g.as);
            
            const homeT = state.teams[g.h] || { name: "Unknown" };
            const awayT = state.teams[g.a] || { name: "Unknown" };
            
            const li = document.createElement("li");
            li.innerHTML = `
                <span class="score-tag">${w} - ${l}</span>
                <span>Established ${g.d} (${homeT.name} vs ${awayT.name})</span>
            `;
            
            li.addEventListener("click", () => {
                state.filters.mode = "win-loss";
                elements.modeHomeVisitor.classList.remove("active");
                elements.modeWinLoss.classList.add("active");
                state.selectedScore = { x: w, y: l };
                
                // Reset animation to display all
                resetAnimation();
                
                render();
            });
            elements.recentScorigamisList.appendChild(li);
        });
    }

    // 13. Year History Animation Playback
    function handlePlayAnimation() {
        if (state.animation.isPlaying) {
            pauseAnimation();
        } else {
            startAnimation();
        }
    }

    function startAnimation() {
        state.animation.isPlaying = true;
        elements.btnAnimPlay.innerHTML = `<span class="pause-icon">▮▮</span> Pause`;
        elements.btnAnimPlay.classList.add("playing");
        
        // If slider was already at max, reset to start year 1946
        if (state.animation.currentYear >= 2026) {
            state.animation.currentYear = 1946;
        }
        
        state.animation.intervalId = setInterval(() => {
            state.animation.currentYear++;
            if (state.animation.currentYear > 2026) {
                pauseAnimation();
                state.animation.currentYear = 2026;
            }
            
            // Sync UI
            elements.animYearSlider.value = state.animation.currentYear;
            elements.animYearVal.textContent = state.animation.currentYear;
            state.filters.maxYear = state.animation.currentYear;
            
            render();
        }, state.animation.speed);
    }

    function pauseAnimation() {
        state.animation.isPlaying = false;
        elements.btnAnimPlay.innerHTML = `<span class="play-icon">▶</span> Play`;
        elements.btnAnimPlay.classList.remove("playing");
        if (state.animation.intervalId) {
            clearInterval(state.animation.intervalId);
            state.animation.intervalId = null;
        }
    }

    function resetAnimation() {
        pauseAnimation();
        state.filters.maxYear = 2026;
        state.animation.currentYear = 2026;
        elements.animYearSlider.value = 2026;
        elements.animYearVal.textContent = "All";
    }

    // 14. Setting Event Listeners
    function setupEventListeners() {
        // Theme Toggle
        elements.themeToggle.addEventListener("click", () => {
            const currentTheme = document.documentElement.getAttribute("data-theme");
            const newTheme = currentTheme === "dark" ? "light" : "dark";
            document.documentElement.setAttribute("data-theme", newTheme);
            state.theme = newTheme;
            render();
            renderMiniCharts();
        });

        // Filter: Team
        elements.filterTeam.addEventListener("change", (e) => {
            state.filters.team = e.target.value;
            render();
        });

        // Filter: Game Type
        elements.filterType.addEventListener("change", (e) => {
            state.filters.type = e.target.value;
            render();
        });

        // Mode Toggles
        elements.modeHomeVisitor.addEventListener("click", () => {
            if (state.filters.mode === "home-visitor") return;
            state.filters.mode = "home-visitor";
            elements.modeHomeVisitor.classList.add("active");
            elements.modeWinLoss.classList.remove("active");
            
            // If selecting a win-loss score, selection might break, reset it
            state.selectedScore = null;
            resetDetailsPanel();
            
            render();
        });

        elements.modeWinLoss.addEventListener("click", () => {
            if (state.filters.mode === "win-loss") return;
            state.filters.mode = "win-loss";
            elements.modeWinLoss.classList.add("active");
            elements.modeHomeVisitor.classList.remove("active");
            
            state.selectedScore = null;
            resetDetailsPanel();
            
            render();
        });

        // Year Animation Slider
        elements.animYearSlider.addEventListener("input", (e) => {
            pauseAnimation();
            const year = parseInt(e.target.value);
            state.animation.currentYear = year;
            state.filters.maxYear = year;
            elements.animYearVal.textContent = year === 2026 ? "All" : year;
            render();
        });

        // Play Button Click
        elements.btnAnimPlay.addEventListener("click", handlePlayAnimation);

        // Canvas interactions
        elements.canvasMain.addEventListener("mousemove", handleCanvasHover);
        elements.canvasMain.addEventListener("mouseleave", () => {
            hideTooltip();
            if (state.hoveredCell) {
                state.hoveredCell = null;
                drawGridCanvas(activeGridData);
            }
        });
        elements.canvasMain.addEventListener("click", handleCanvasClick);
        
        // Close details panel
        elements.btnCloseDetails.addEventListener("click", () => {
            state.selectedScore = null;
            resetDetailsPanel();
            drawGridCanvas(activeGridData);
        });

        // Recalculate canvas display size on window resize
        window.addEventListener("resize", () => {
            if (activeGridData) {
                drawGridCanvas(activeGridData);
            }
        });
    }

    // Launch Application
    init();
});
