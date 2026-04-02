/*
  # Add Weekly Tracking, Games, and Ejections Tables
  
  ## Overview
  Extends the MLB challenge tracking system to support weekly leaderboards,
  game-level tracking, ejection tracking, and umpire photo/status management.
  
  ## Table Updates
  
  ### `umpires` - New Fields
  - `photo_url` (text, nullable) - URL to umpire photo
  - `is_retired` (boolean) - Whether the umpire is retired
  - `retirement_date` (date, nullable) - Date of retirement
  
  ### `challenges` - New Fields
  - `game_id` (uuid, nullable, foreign key) - References games table
  - `inning` (integer, nullable) - Inning when challenge occurred
  - `ejection_occurred` (boolean) - Whether an ejection happened as result
  - `game_type` (text) - 'regular' or 'postseason'
  - `week_number` (integer) - Week number of the season (1-27 for regular season)
  - `week_year` (integer) - Year for the week (handles cross-year weeks)
  
  ## New Tables
  
  ### `games`
  Tracks individual MLB games with umpire assignments
  - `id` (uuid, primary key) - Unique identifier
  - `game_date` (date) - Date of the game
  - `home_team_id` (uuid, foreign key) - References teams table
  - `away_team_id` (uuid, foreign key) - References teams table
  - `umpire_id` (uuid, foreign key) - Home plate umpire
  - `total_calls` (integer) - Total ball/strike calls in game
  - `total_challenges` (integer) - Total challenges in game
  - `game_type` (text) - 'regular' or 'postseason'
  - `season_year` (integer) - Season year
  - `created_at` (timestamptz) - Record creation timestamp
  
  ### `ejections`
  Tracks umpire ejections of players/coaches
  - `id` (uuid, primary key) - Unique identifier
  - `umpire_id` (uuid, foreign key) - References umpires table
  - `team_id` (uuid, foreign key) - References teams table
  - `game_id` (uuid, nullable, foreign key) - References games table
  - `player_name` (text) - Name of ejected player/coach
  - `ejection_date` (date) - Date of ejection
  - `reason` (text, nullable) - Reason for ejection
  - `season_year` (integer) - Season year
  - `created_at` (timestamptz) - Record creation timestamp
  
  ## Security
  - Enable RLS on all new tables
  - Allow public read access for leaderboard data
  - Restrict write operations to authenticated users only
  
  ## Indexes
  - Add indexes for weekly queries and game lookups
*/

-- Add new fields to umpires table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'umpires' AND column_name = 'photo_url'
  ) THEN
    ALTER TABLE umpires ADD COLUMN photo_url text;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'umpires' AND column_name = 'is_retired'
  ) THEN
    ALTER TABLE umpires ADD COLUMN is_retired boolean DEFAULT false;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'umpires' AND column_name = 'retirement_date'
  ) THEN
    ALTER TABLE umpires ADD COLUMN retirement_date date;
  END IF;
END $$;

-- Create games table
CREATE TABLE IF NOT EXISTS games (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_date date NOT NULL,
  home_team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  away_team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  umpire_id uuid NOT NULL REFERENCES umpires(id) ON DELETE CASCADE,
  total_calls integer DEFAULT 0,
  total_challenges integer DEFAULT 0,
  game_type text NOT NULL DEFAULT 'regular' CHECK (game_type IN ('regular', 'postseason')),
  season_year integer NOT NULL DEFAULT 2026,
  created_at timestamptz DEFAULT now()
);

-- Create ejections table
CREATE TABLE IF NOT EXISTS ejections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  umpire_id uuid NOT NULL REFERENCES umpires(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  game_id uuid REFERENCES games(id) ON DELETE SET NULL,
  player_name text NOT NULL,
  ejection_date date NOT NULL,
  reason text,
  season_year integer NOT NULL DEFAULT 2026,
  created_at timestamptz DEFAULT now()
);

-- Add new fields to challenges table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'challenges' AND column_name = 'game_id'
  ) THEN
    ALTER TABLE challenges ADD COLUMN game_id uuid REFERENCES games(id) ON DELETE SET NULL;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'challenges' AND column_name = 'inning'
  ) THEN
    ALTER TABLE challenges ADD COLUMN inning integer;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'challenges' AND column_name = 'ejection_occurred'
  ) THEN
    ALTER TABLE challenges ADD COLUMN ejection_occurred boolean DEFAULT false;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'challenges' AND column_name = 'game_type'
  ) THEN
    ALTER TABLE challenges ADD COLUMN game_type text DEFAULT 'regular' CHECK (game_type IN ('regular', 'postseason'));
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'challenges' AND column_name = 'week_number'
  ) THEN
    ALTER TABLE challenges ADD COLUMN week_number integer;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'challenges' AND column_name = 'week_year'
  ) THEN
    ALTER TABLE challenges ADD COLUMN week_year integer;
  END IF;
END $$;

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_games_umpire_id ON games(umpire_id);
CREATE INDEX IF NOT EXISTS idx_games_date ON games(game_date);
CREATE INDEX IF NOT EXISTS idx_games_season_year ON games(season_year);
CREATE INDEX IF NOT EXISTS idx_games_game_type ON games(game_type);

CREATE INDEX IF NOT EXISTS idx_ejections_umpire_id ON ejections(umpire_id);
CREATE INDEX IF NOT EXISTS idx_ejections_date ON ejections(ejection_date);
CREATE INDEX IF NOT EXISTS idx_ejections_season_year ON ejections(season_year);

CREATE INDEX IF NOT EXISTS idx_challenges_game_id ON challenges(game_id);
CREATE INDEX IF NOT EXISTS idx_challenges_week_number ON challenges(week_number);
CREATE INDEX IF NOT EXISTS idx_challenges_week_year ON challenges(week_year);
CREATE INDEX IF NOT EXISTS idx_challenges_game_type ON challenges(game_type);

-- Enable Row Level Security on new tables
ALTER TABLE games ENABLE ROW LEVEL SECURITY;
ALTER TABLE ejections ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Allow public read access
CREATE POLICY "Allow public read access to games"
  ON games FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Allow public read access to ejections"
  ON ejections FOR SELECT
  TO anon
  USING (true);

-- RLS Policies: Allow authenticated users to insert/update data
CREATE POLICY "Allow authenticated users to insert games"
  ON games FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow authenticated users to insert ejections"
  ON ejections FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow authenticated users to update games"
  ON games FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow authenticated users to update umpires"
  ON umpires FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);
