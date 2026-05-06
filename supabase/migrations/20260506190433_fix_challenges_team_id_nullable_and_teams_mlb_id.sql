/*
  # Make challenges.team_id nullable and add mlb_id to teams

  ## Changes

  ### `challenges`
  - Make `team_id` nullable — the challenging team is not always resolvable
    from the MLB Stats API (team ID may not match our DB), and it's not
    required for the umpire leaderboard.

  ### `teams`
  - Add `mlb_id` (integer) — the MLB Stats API numeric team ID for fast lookup
*/

ALTER TABLE challenges ALTER COLUMN team_id DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'teams' AND column_name = 'mlb_id'
  ) THEN
    ALTER TABLE teams ADD COLUMN mlb_id integer;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_teams_mlb_id ON teams(mlb_id) WHERE mlb_id IS NOT NULL;
