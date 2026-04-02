/*
  # Fix Security Issues and Remove Unused Indexes

  ## Overview
  Addresses security warnings and performance issues by:
  1. Dropping unused database indexes to reduce overhead
  2. Removing overly permissive RLS policies that allow unrestricted authenticated access
  
  ## Changes

  ### Dropped Indexes
  Removes indexes that are not being used by current queries:
  - Challenge indexes: idx_challenges_outcome, idx_challenges_umpire_date
  - Game indexes: idx_games_umpire_id, idx_games_date, idx_games_season_year, 
    idx_games_away_team_id, idx_games_home_team_id
  - Ejection indexes: idx_ejections_umpire_id, idx_ejections_date, idx_ejections_game_id, 
    idx_ejections_team_id
  - Sync log indexes: idx_sync_logs_data_source_id, idx_sync_logs_status
  - Data conflict indexes: idx_data_conflicts_umpire_id, idx_data_conflicts_resolved
  - Umpire indexes: idx_umpires_data_source, idx_umpires_last_synced

  ### RLS Policy Updates
  Removes overly permissive authenticated user policies that bypass security:
  - Data sources: Removed unrestricted insert/update policies
  - Sync logs: Removed unrestricted insert/update policies
  - Data conflicts: Removed unrestricted insert/update policies
  
  Note: Edge functions use service role key which bypasses RLS, so these removals
  do not affect functionality. Public read access remains for transparency.

  ## Security Impact
  - Reduces attack surface by removing overly permissive policies
  - Edge functions continue to work via service role key
  - Public users retain read-only access for transparency
  - Authenticated users no longer have write access to system tables
*/

-- Drop unused indexes on challenges table
DROP INDEX IF EXISTS idx_challenges_outcome;
DROP INDEX IF EXISTS idx_challenges_umpire_date;

-- Drop unused indexes on games table
DROP INDEX IF EXISTS idx_games_umpire_id;
DROP INDEX IF EXISTS idx_games_date;
DROP INDEX IF EXISTS idx_games_season_year;
DROP INDEX IF EXISTS idx_games_away_team_id;
DROP INDEX IF EXISTS idx_games_home_team_id;

-- Drop unused indexes on ejections table
DROP INDEX IF EXISTS idx_ejections_umpire_id;
DROP INDEX IF EXISTS idx_ejections_date;
DROP INDEX IF EXISTS idx_ejections_game_id;
DROP INDEX IF EXISTS idx_ejections_team_id;

-- Drop unused indexes on sync_logs table
DROP INDEX IF EXISTS idx_sync_logs_data_source_id;
DROP INDEX IF EXISTS idx_sync_logs_status;
DROP INDEX IF EXISTS idx_sync_logs_started_at;

-- Drop unused indexes on data_conflicts table
DROP INDEX IF EXISTS idx_data_conflicts_umpire_id;
DROP INDEX IF EXISTS idx_data_conflicts_resolved;

-- Drop unused indexes on umpires table
DROP INDEX IF EXISTS idx_umpires_data_source;
DROP INDEX IF EXISTS idx_umpires_last_synced;

-- Drop unused index on challenges table
DROP INDEX IF EXISTS idx_challenges_data_source;

-- Remove overly permissive RLS policies for data_sources
DROP POLICY IF EXISTS "Allow authenticated users to insert data sources" ON data_sources;
DROP POLICY IF EXISTS "Allow authenticated users to update data sources" ON data_sources;

-- Remove overly permissive RLS policies for sync_logs
DROP POLICY IF EXISTS "Allow authenticated users to insert sync logs" ON sync_logs;
DROP POLICY IF EXISTS "Allow authenticated users to update sync logs" ON sync_logs;

-- Remove overly permissive RLS policies for data_conflicts
DROP POLICY IF EXISTS "Allow authenticated users to insert data conflicts" ON data_conflicts;
DROP POLICY IF EXISTS "Allow authenticated users to update data conflicts" ON data_conflicts;
