# load_games.R
# Script to load and analyze Games.csv from the Kaggle NBA Dataset

library(readr)
library(dplyr)
library(lubridate)
library(stringr)

# Define file path
csv_path <- "Games.csv"

if (!file.exists(csv_path)) {
  stop(paste("Error: File not found at", csv_path))
}

message("Loading Games.csv...")
# Read dataset
games <- read_csv(csv_path, show_col_types = FALSE)

# Basic dataset info
num_rows <- nrow(games)
num_cols <- ncol(games)

cat("\n==================================================\n")
cat("NBA Dataset Load Summary\n")
cat("==================================================\n")
cat("Dimensions: ", num_rows, " rows by ", num_cols, " columns\n\n")

# Show column names and classes
cat("Columns in the dataset:\n")
cols_info <- tibble(
  Column = names(games),
  Type = sapply(games, function(x) class(x)[1])
)
print(cols_info, n = Inf)

# Data cleaning and enrichment
message("\nProcessing and analyzing data...")
games_clean <- games %>%
  mutate(
    gameDate = as.Date(gameDate),
    homeScore = as.numeric(homeScore),
    awayScore = as.numeric(awayScore),
    winner = as.character(winner),
    hometeamId = as.character(hometeamId),
    awayteamId = as.character(awayteamId)
  ) %>%
  filter(!is.na(homeScore) & !is.na(awayScore))

# Calculate home court win rate
games_clean <- games_clean %>%
  mutate(
    home_win = ifelse(winner == hometeamId, 1, 0),
    total_score = homeScore + awayScore,
    score_diff = homeScore - awayScore
  )

avg_home_score <- mean(games_clean$homeScore, na.rm = TRUE)
avg_away_score <- mean(games_clean$awayScore, na.rm = TRUE)
home_win_rate <- mean(games_clean$home_win, na.rm = TRUE) * 100

cat("\n==================================================\n")
cat("Historical Statistics Summary (Cleaned Data)\n")
cat("==================================================\n")
cat("Total Games Analyzed:      ", nrow(games_clean), "\n")
cat("Average Home Team Score:   ", round(avg_home_score, 2), "\n")
cat("Average Away Team Score:   ", round(avg_away_score, 2), "\n")
cat("Home Court Win Percentage: ", round(home_win_rate, 2), "%\n")
cat("Average Score Difference:  ", round(mean(games_clean$score_diff, na.rm = TRUE), 2), "\n")
cat("Average Total Combined Pts:", round(mean(games_clean$total_score, na.rm = TRUE), 2), "\n")

# Team list with city and name (finding unique team info)
teams <- games_clean %>%
  select(hometeamId, hometeamCity, hometeamName) %>%
  distinct(hometeamId, .keep_all = TRUE) %>%
  rename(teamId = hometeamId, teamCity = hometeamCity, teamName = hometeamName)

cat("\nUnique Teams in Dataset:  ", nrow(teams), "\n")

# Top 5 high scoring games
cat("\n==================================================\n")
cat("Top 5 Highest Scoring Games (Combined)\n")
cat("==================================================\n")
top_scoring <- games_clean %>%
  arrange(desc(total_score)) %>%
  slice(1:5) %>%
  select(gameDate, hometeamCity, hometeamName, homeScore, awayteamCity, awayteamName, awayScore, total_score)

print(top_scoring)

# Game types
cat("\n==================================================\n")
cat("Breakdown by Game Type\n")
cat("==================================================\n")
game_types_summary <- games_clean %>%
  group_by(gameType) %>%
  summarise(
    Count = n(),
    Avg_Home = round(mean(homeScore), 2),
    Avg_Away = round(mean(awayScore), 2),
    Home_Win_Pct = round(mean(home_win) * 100, 2)
  )
print(game_types_summary)

# Let's save a summary table to a CSV file for any future processing
write_csv(game_types_summary, "game_types_summary.csv")
message("\nSaved game_types_summary.csv")
