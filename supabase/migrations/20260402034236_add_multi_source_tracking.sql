/*
  # Add Multi-Source Data Tracking System

  ## Overview
  Extends the MLB ABS challenge tracking system to support multiple data sources
  (ESPN, Baseball Reference, Baseball Savant) with reconciliation, deduplication,
  and sync monitoring capabilities.

  ## New Tables

  ### `data_sources`
  Tracks available data sources and their configuration
  - `id` (uuid, primary key) - Unique identifier
  - `name` (text, unique) - Source name (e.g., 'ESPN', 'Baseball Reference')
  - `base_url` (text) - Base URL for the data source
  - `is_active` (boolean) - Whether this source is currently enabled
  - `priority` (integer) - Priority level (lower = higher priority)
  - `last_successful_sync` (timestamptz) - Last successful data sync
  - `consecutive_failures` (integer) - Count of consecutive failures for circuit breaker
  - `created_at` (timestamptz) - Record creation timestamp

  ### `sync_logs`
  Monitors scraping runs and tracks success/failure
  - `id` (uuid, primary key) - Unique identifier
  - `data_source_id` (uuid, foreign key) - References data_sources table
  - `sync_started_at` (timestamptz) - When sync started
  - `sync_completed_at` (timestamptz, nullable) - When sync completed
  - `status` (text) - 'running', 'success', 'failed', 'partial'
  - `records_added` (integer) - Number of new records inserted
  - `records_updated` (integer) - Number of existing records updated
  - `records_skipped` (integer) - Number of duplicate records skipped
  - `error_message` (text, nullable) - Error details if failed
  - `metadata` (jsonb, nullable) - Additional sync details
  - `created_at` (timestamptz) - Record creation timestamp

  ### `data_conflicts`
  Tracks discrepancies between data sources
  - `id` (uuid, primary key) - Unique identifier
  - `umpire_id` (uuid, foreign key) - References umpires table
  - `conflict_type` (text) - Type of conflict (e.g., 'challenge_count_mismatch')
  - `source_1_name` (text) - First data source
  - `source_1_value` (jsonb) - Value from first source
  - `source_2_name` (text) - Second data source
  - `source_2_value` (jsonb) - Value from second source
  - `resolved` (boolean) - Whether conflict has been resolved
  - `resolution` (text, nullable) - How conflict was resolved
  - `created_at` (timestamptz) - When conflict was detected

  ## Table Updates

  ### `umpires` - New Fields
  - `data_source` (text) - Primary source for biographical data
  - `last_synced_at` (timestamptz) - Last time this record was synced
  - `pitches_called` (integer) - Total pitches called (from ESPN)
  - `external_source_id` (text) - ID from external source for mapping
  - `baseball_reference_url` (text) - URL to Baseball Reference page

  ### `challenges` - New Fields
  - `data_source` (text) - Which source provided this challenge data
  - `last_synced_at` (timestamptz) - Last time this record was synced

  ## Security
  - Enable RLS on all new tables
  - Allow public read access for transparency
  - Restrict write operations to authenticated users only

  ## Indexes
  - Add indexes for sync queries and conflict detection
*/

-- Create data_sources table
CREATE TABLE IF NOT EXISTS data_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  base_url text NOT NULL,
  is_active boolean DEFAULT true,
  priority integer DEFAULT 100,
  last_successful_sync timestamptz,
  consecutive_failures integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Create sync_logs table
CREATE TABLE IF NOT EXISTS sync_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data_source_id uuid REFERENCES data_sources(id) ON DELETE CASCADE,
  sync_started_at timestamptz NOT NULL,
  sync_completed_at timestamptz,
  status text NOT NULL CHECK (status IN ('running', 'success', 'failed', 'partial')),
  records_added integer DEFAULT 0,
  records_updated integer DEFAULT 0,
  records_skipped integer DEFAULT 0,
  error_message text,
  metadata jsonb,
  created_at timestamptz DEFAULT now()
);

-- Create data_conflicts table
CREATE TABLE IF NOT EXISTS data_conflicts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  umpire_id uuid REFERENCES umpires(id) ON DELETE CASCADE,
  conflict_type text NOT NULL,
  source_1_name text NOT NULL,
  source_1_value jsonb,
  source_2_name text NOT NULL,
  source_2_value jsonb,
  resolved boolean DEFAULT false,
  resolution text,
  created_at timestamptz DEFAULT now()
);

-- Add new fields to umpires table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'umpires' AND column_name = 'data_source'
  ) THEN
    ALTER TABLE umpires ADD COLUMN data_source text;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'umpires' AND column_name = 'last_synced_at'
  ) THEN
    ALTER TABLE umpires ADD COLUMN last_synced_at timestamptz;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'umpires' AND column_name = 'pitches_called'
  ) THEN
    ALTER TABLE umpires ADD COLUMN pitches_called integer DEFAULT 0;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'umpires' AND column_name = 'external_source_id'
  ) THEN
    ALTER TABLE umpires ADD COLUMN external_source_id text;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'umpires' AND column_name = 'baseball_reference_url'
  ) THEN
    ALTER TABLE umpires ADD COLUMN baseball_reference_url text;
  END IF;
END $$;

-- Add new fields to challenges table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'challenges' AND column_name = 'data_source'
  ) THEN
    ALTER TABLE challenges ADD COLUMN data_source text;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'challenges' AND column_name = 'last_synced_at'
  ) THEN
    ALTER TABLE challenges ADD COLUMN last_synced_at timestamptz;
  END IF;
END $$;

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_sync_logs_data_source_id ON sync_logs(data_source_id);
CREATE INDEX IF NOT EXISTS idx_sync_logs_status ON sync_logs(status);
CREATE INDEX IF NOT EXISTS idx_sync_logs_started_at ON sync_logs(sync_started_at);

CREATE INDEX IF NOT EXISTS idx_data_conflicts_umpire_id ON data_conflicts(umpire_id);
CREATE INDEX IF NOT EXISTS idx_data_conflicts_resolved ON data_conflicts(resolved);

CREATE INDEX IF NOT EXISTS idx_umpires_data_source ON umpires(data_source);
CREATE INDEX IF NOT EXISTS idx_umpires_last_synced ON umpires(last_synced_at);

CREATE INDEX IF NOT EXISTS idx_challenges_data_source ON challenges(data_source);
CREATE INDEX IF NOT EXISTS idx_challenges_umpire_date ON challenges(umpire_id, challenge_date);

-- Enable Row Level Security on new tables
ALTER TABLE data_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_conflicts ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Allow public read access
CREATE POLICY "Allow public read access to data sources"
  ON data_sources FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Allow public read access to sync logs"
  ON sync_logs FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Allow public read access to data conflicts"
  ON data_conflicts FOR SELECT
  TO anon
  USING (true);

-- RLS Policies: Allow authenticated users to write data
CREATE POLICY "Allow authenticated users to insert data sources"
  ON data_sources FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow authenticated users to update data sources"
  ON data_sources FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow authenticated users to insert sync logs"
  ON sync_logs FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow authenticated users to update sync logs"
  ON sync_logs FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow authenticated users to insert data conflicts"
  ON data_conflicts FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow authenticated users to update data conflicts"
  ON data_conflicts FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Insert initial data sources
INSERT INTO data_sources (name, base_url, is_active, priority)
VALUES 
  ('ESPN', 'https://www.espn.com/mlb/story/_/id/48305211/2026-mlb-abs-challenge-system-tracker-team-player-rankings', true, 1),
  ('Baseball Reference', 'https://www.baseball-reference.com/bullpen/', true, 2),
  ('Baseball Savant', 'https://baseballsavant.mlb.com/leaderboard/abs-challenges', true, 3)
ON CONFLICT (name) DO NOTHING;