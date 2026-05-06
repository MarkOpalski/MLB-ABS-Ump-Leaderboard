/*
  # Fix challenges unique constraint for MLB Stats API deduplication

  Replaces the partial unique index (which doesn't work with Supabase upsert)
  with a plain unique constraint on (game_pk, play_index) so ON CONFLICT works correctly.
*/

DROP INDEX IF EXISTS idx_challenges_game_pk_play_index;

ALTER TABLE challenges
  DROP CONSTRAINT IF EXISTS challenges_game_pk_play_index_key;

ALTER TABLE challenges
  ADD CONSTRAINT challenges_game_pk_play_index_key
  UNIQUE (game_pk, play_index);
