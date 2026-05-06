/*
  # Add MLB Stats API native IDs for deduplication

  ## Overview
  Adds MLB Stats API identifiers so the sync function can deduplicate
  umpires by their MLB ID and challenges by their game + play index.

  ## Changes

  ### `umpires`
  - `mlb_id` (integer) — umpire's MLB Stats API person ID (e.g. 577468 for Roberto Ortiz)

  ### `challenges`
  - `game_pk` (integer) — MLB Stats API game primary key
  - `play_index` (integer) — index of the play within the game's play-by-play array
  - `pitcher_name` (text) — pitcher name for context
  - `batter_name` (text) — batter name for context
  - `initial_call` (text) — the original call before challenge (e.g. 'Strike', 'Ball')
  - Unique constraint on (game_pk, play_index) to prevent duplicate imports

  ### `games`
  - `game_pk` (integer) — MLB Stats API game primary key, unique
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'umpires' AND column_name = 'mlb_id'
  ) THEN
    ALTER TABLE umpires ADD COLUMN mlb_id integer;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'challenges' AND column_name = 'game_pk'
  ) THEN
    ALTER TABLE challenges ADD COLUMN game_pk integer;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'challenges' AND column_name = 'play_index'
  ) THEN
    ALTER TABLE challenges ADD COLUMN play_index integer;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'challenges' AND column_name = 'pitcher_name'
  ) THEN
    ALTER TABLE challenges ADD COLUMN pitcher_name text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'challenges' AND column_name = 'batter_name'
  ) THEN
    ALTER TABLE challenges ADD COLUMN batter_name text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'challenges' AND column_name = 'initial_call'
  ) THEN
    ALTER TABLE challenges ADD COLUMN initial_call text;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'games' AND column_name = 'game_pk'
  ) THEN
    ALTER TABLE games ADD COLUMN game_pk integer;
  END IF;
END $$;

-- Unique index so we never double-insert the same play
CREATE UNIQUE INDEX IF NOT EXISTS idx_challenges_game_pk_play_index
  ON challenges(game_pk, play_index)
  WHERE game_pk IS NOT NULL AND play_index IS NOT NULL;

-- Index for umpire lookup by MLB ID
CREATE UNIQUE INDEX IF NOT EXISTS idx_umpires_mlb_id
  ON umpires(mlb_id)
  WHERE mlb_id IS NOT NULL;

-- Index for game lookup by game_pk
CREATE UNIQUE INDEX IF NOT EXISTS idx_games_game_pk
  ON games(game_pk)
  WHERE game_pk IS NOT NULL;
