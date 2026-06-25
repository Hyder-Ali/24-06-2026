# process_scorigami_data.R
# Pre-processes the Games.csv file to generate highly optimized JSON and CSV files for the Scorigami Web App.

library(readr)
library(dplyr)
library(jsonlite)
library(lubridate)

csv_path <- "Games.csv"
if (!file.exists(csv_path)) {
  stop(paste("File not found:", csv_path))
}

message("Reading Games.csv...")
games <- read_csv(csv_path, show_col_types = FALSE)

# 1. Team Mapping (combining home and away teams for a complete list)
message("Generating team mapping...")
home_teams <- games %>% select(city = hometeamCity, name = hometeamName)
away_teams <- games %>% select(city = awayteamCity, name = awayteamName)

teams <- bind_rows(home_teams, away_teams) %>%
  distinct() %>%
  filter(!is.na(name)) %>%
  arrange(city, name) %>%
  mutate(team_id = row_number())

# Create lookup list for JSON export
teams_list <- list()
for (i in 1:nrow(teams)) {
  teams_list[[as.character(teams$team_id[i])]] <- list(
    city = teams$city[i],
    name = teams$name[i]
  )
}

# Save teams.json
write_json(teams_list, "teams.json", auto_unbox = TRUE, pretty = TRUE)
message("Saved teams.json")

# 2. Clean and Map Games Data
message("Mapping games data...")
games_clean <- games %>%
  filter(!is.na(homeScore) & !is.na(awayScore) & !is.na(gameDate) & homeScore > 0 & awayScore > 0) %>%
  left_join(teams, by = c("hometeamCity" = "city", "hometeamName" = "name")) %>%
  rename(home_id = team_id) %>%
  left_join(teams, by = c("awayteamCity" = "city", "awayteamName" = "name")) %>%
  rename(away_id = team_id) %>%
  mutate(
    # Handle any NA team IDs if any
    home_id = coalesce(home_id, 0L),
    away_id = coalesce(away_id, 0L),
    
    # Format date
    gameDateStr = format(as.Date(gameDate), "%Y-%m-%d"),
    
    # Map Game Type
    type_code = case_when(
      gameType == "Regular Season" ~ "R",
      gameType == "Playoffs" ~ "P",
      gameType %in% c("Play-in Tournament") ~ "I",
      gameType %in% c("Emirates NBA Cup", "NBA Cup", "NBA Emirates Cup", "In-Season Tournament") ~ "C", # Cup
      gameType == "Preseason" ~ "S",
      gameType == "All-Star Game" ~ "A",
      TRUE ~ "O"
    )
  )

# Select only necessary columns
games_export <- games_clean %>%
  select(
    d = gameDateStr,
    h = home_id,
    a = away_id,
    hs = homeScore,
    as = awayScore,
    t = type_code
  ) %>%
  arrange(d)

write_csv(games_export, "games_clean.csv")
message("Saved games_clean.csv")

# 3. Calculate Scorigami Statistics
message("Calculating Scorigami stats...")

# Find unique scores
games_with_scores <- games_clean %>%
  mutate(
    winner_score = pmax(homeScore, awayScore),
    loser_score = pmin(homeScore, awayScore),
    score_key = paste(winner_score, loser_score, sep = "-"),
    game_year = year(as.Date(gameDate))
  )

# First occurrence of each winner-loser score
score_first_occurrences <- games_with_scores %>%
  group_by(score_key) %>%
  summarise(
    first_date = min(as.Date(gameDate)),
    winner_score = first(winner_score),
    loser_score = first(loser_score),
    .groups = "drop"
  ) %>%
  mutate(first_year = year(first_date))

# Count new unique scores per year
new_scores_per_year <- score_first_occurrences %>%
  group_by(first_year) %>%
  summarise(new_scores_count = n(), .groups = "drop") %>%
  arrange(first_year)

# Create a complete range of years
all_years <- tibble(Year = 1946:2026)

stats_by_year <- all_years %>%
  left_join(new_scores_per_year, by = c("Year" = "first_year")) %>%
  mutate(new_scores_count = coalesce(new_scores_count, 0L)) %>%
  mutate(cumulative_scores = cumsum(new_scores_count))

# Format and write statistics to json
stats_list <- list(
  total_unique_winner_loser = nrow(score_first_occurrences),
  total_games = nrow(games_clean),
  years = stats_by_year$Year,
  new_scores = stats_by_year$new_scores_count,
  cumulative = stats_by_year$cumulative_scores
)

write_json(stats_list, "scorigami_stats.json", auto_unbox = TRUE, pretty = TRUE)
message("Saved scorigami_stats.json")

# Report counts
cat("\nTotal Unique Winner-Loser Scores: ", nrow(score_first_occurrences), "\n")
cat("Total Games Processed:            ", nrow(games_clean), "\n")
