-- Fix a column-shadowing bug in letters_receive_eligible.
--
-- The correlated subquery referenced the bare column "id" intending to mean
-- the outer letters.id, but letter_recipients also has its own "id" column
-- (its primary key). Postgres resolves unqualified columns to the innermost
-- scope first, so "id" was silently resolving to letter_recipients.id
-- instead of letters.id — meaning "lr.letter_id = id" compared a
-- recipient row's letter_id to its own primary key, which is never true.
-- As a result the "already seen this letter" exclusion never actually
-- excluded anything.

DROP POLICY IF EXISTS "letters_receive_eligible" ON letters;

CREATE POLICY "letters_receive_eligible"
  ON letters FOR SELECT USING (
    status = 'active'
    AND expires_at > NOW()
    AND author_id != auth.uid()
    AND travel_count < max_travels
    AND NOT EXISTS (
      SELECT 1 FROM letter_recipients lr
      WHERE lr.letter_id = letters.id AND lr.user_id = auth.uid()
    )
  );
