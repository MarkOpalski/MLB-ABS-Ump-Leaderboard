/*
  # Add notes column to data_sources

  Adds a freetext notes field to explain the current status of each source —
  useful for documenting why a source is inactive (404, JS-only, API disabled, etc.).
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'data_sources' AND column_name = 'notes'
  ) THEN
    ALTER TABLE data_sources ADD COLUMN notes text;
  END IF;
END $$;
