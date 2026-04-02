/*
  # Add Photo URLs to Umpires

  1. Changes
    - Add `photo_url` column to `umpires` table to store umpire headshot URLs
    - This will allow displaying actual umpire photos in the UI
  
  2. Notes
    - Column is nullable to allow gradual addition of photos
    - Photos will be stored in the public directory and referenced by URL
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'umpires' AND column_name = 'photo_url'
  ) THEN
    ALTER TABLE umpires ADD COLUMN photo_url text;
  END IF;
END $$;