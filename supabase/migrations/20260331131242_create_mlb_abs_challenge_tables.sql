/*
  # MLB ABS Challenge Leaderboard Schema

  ## Overview
  Creates tables to track MLB Automated Ball-Strike (ABS) challenge outcomes for the regular season.
  Tracks umpires, teams, and individual challenge results (overturned vs. stands).

  ## New Tables
  
  ### `umpires`
  Stores umpire information
  - `id` (uuid, primary key) - Unique identifier
  - `name` (text) - Full name of the umpire
  - `age` (integer) - Current age
  - `years_of_experience` (integer) - Years of MLB umpiring experience
  - `created_at` (timestamptz) - Record creation timestamp

  ### `teams`
  Stores MLB team information
  - `id` (uuid, primary key) - Unique identifier
  - `name` (text) - Full team name
  - `abbreviation` (text) - Team abbreviation (e.g., NYY, BOS)
  - `created_at` (timestamptz) - Record creation timestamp

  ### `challenges`
  Stores individual ABS challenge results
  - `id` (uuid, primary key) - Unique identifier
  - `umpire_id` (uuid, foreign key) - References umpires table
  - `team_id` (uuid, foreign key) - References teams table
  - `challenge_date` (date) - Date of the challenge
  - `outcome` (text) - Result: 'overturned' or 'stands'
  - `season_year` (integer) - Season year (e.g., 2026)
  - `created_at` (timestamptz) - Record creation timestamp

  ## Security
  - Enable RLS on all tables
  - Allow public read access (this is public leaderboard data)
  - Restrict write operations to authenticated users only

  ## Indexes
  - Index on umpire_id for efficient lookups
  - Index on team_id for efficient filtering
  - Index on outcome for efficient aggregation
*/

-- Create umpires table
CREATE TABLE IF NOT EXISTS umpires (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  age integer NOT NULL,
  years_of_experience integer NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Create teams table
CREATE TABLE IF NOT EXISTS teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  abbreviation text NOT NULL UNIQUE,
  created_at timestamptz DEFAULT now()
);

-- Create challenges table
CREATE TABLE IF NOT EXISTS challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  umpire_id uuid NOT NULL REFERENCES umpires(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  challenge_date date NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('overturned', 'stands')),
  season_year integer NOT NULL DEFAULT 2026,
  created_at timestamptz DEFAULT now()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_challenges_umpire_id ON challenges(umpire_id);
CREATE INDEX IF NOT EXISTS idx_challenges_team_id ON challenges(team_id);
CREATE INDEX IF NOT EXISTS idx_challenges_outcome ON challenges(outcome);
CREATE INDEX IF NOT EXISTS idx_challenges_season_year ON challenges(season_year);

-- Enable Row Level Security
ALTER TABLE umpires ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE challenges ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Allow public read access for leaderboard data
CREATE POLICY "Allow public read access to umpires"
  ON umpires FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Allow public read access to teams"
  ON teams FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Allow public read access to challenges"
  ON challenges FOR SELECT
  TO anon
  USING (true);

-- RLS Policies: Allow authenticated users to insert data
CREATE POLICY "Allow authenticated users to insert umpires"
  ON umpires FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow authenticated users to insert teams"
  ON teams FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow authenticated users to insert challenges"
  ON challenges FOR INSERT
  TO authenticated
  WITH CHECK (true);