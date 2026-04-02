/*
  # Fix Security and Performance Issues

  ## Performance Improvements
  
  1. **Add Missing Foreign Key Indexes**
     - Add index on `ejections.game_id` for foreign key lookup performance
     - Add index on `ejections.team_id` for foreign key lookup performance
     - Add index on `games.away_team_id` for foreign key lookup performance
     - Add index on `games.home_team_id` for foreign key lookup performance

  ## Security Fixes
  
  2. **Fix Overly Permissive RLS Policies**
     - Remove INSERT/UPDATE policies that use `true` (allows unrestricted access)
     - These policies effectively bypass RLS security
     - Data modifications should be done via service role or admin-only access
     - Keep SELECT policies for authenticated users (read-only access)
  
  ## Important Notes
  
  - The "unused indexes" warnings are expected for a new database
  - Indexes on umpire_id, game_id, week_number, etc. will be used by application queries
  - Auth DB connection strategy is a configuration setting, not a migration issue
*/

-- Add missing foreign key indexes for performance
CREATE INDEX IF NOT EXISTS idx_ejections_game_id ON ejections(game_id);
CREATE INDEX IF NOT EXISTS idx_ejections_team_id ON ejections(team_id);
CREATE INDEX IF NOT EXISTS idx_games_away_team_id ON games(away_team_id);
CREATE INDEX IF NOT EXISTS idx_games_home_team_id ON games(home_team_id);

-- Fix RLS Policies: Remove overly permissive INSERT/UPDATE policies
-- These policies use USING (true) or WITH CHECK (true) which bypasses security

-- Drop permissive policies on challenges table
DROP POLICY IF EXISTS "Allow authenticated users to insert challenges" ON challenges;

-- Drop permissive policies on ejections table
DROP POLICY IF EXISTS "Allow authenticated users to insert ejections" ON ejections;

-- Drop permissive policies on games table
DROP POLICY IF EXISTS "Allow authenticated users to insert games" ON games;
DROP POLICY IF EXISTS "Allow authenticated users to update games" ON games;

-- Drop permissive policies on teams table
DROP POLICY IF EXISTS "Allow authenticated users to insert teams" ON teams;

-- Drop permissive policies on umpires table
DROP POLICY IF EXISTS "Allow authenticated users to insert umpires" ON umpires;
DROP POLICY IF EXISTS "Allow authenticated users to update umpires" ON umpires;

-- The tables now have:
-- - SELECT policies for authenticated users (read access)
-- - No INSERT/UPDATE policies for regular users (write operations require service role)
-- This is the correct security posture for a data administration application