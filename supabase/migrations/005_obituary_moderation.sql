-- Minimal single-founder moderation queue for the Obituary feed.
-- CLAUDE.md requires an explicit review step before an expired letter can
-- go public — expiry (or a dislike) alone must not be sufficient. Until now
-- nothing ever set approved_for_obituary, so the feed was permanently empty.

ALTER TABLE user_profiles
  ADD COLUMN is_moderator BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE letters
  ADD COLUMN obituary_reviewed BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX idx_letters_obituary_queue
  ON letters(status)
  WHERE status = 'expired' AND obituary_reviewed = FALSE;

CREATE OR REPLACE FUNCTION is_moderator()
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    (SELECT is_moderator FROM user_profiles WHERE id = auth.uid()),
    FALSE
  );
$$;

-- Moderators can see every expired letter (the review queue), regardless
-- of who authored it.
CREATE POLICY "letters_moderator_select"
  ON letters FOR SELECT
  USING (is_moderator() AND status = 'expired');

-- Moderators can only flip the two review columns, and only on already-
-- expired letters — everything else about a letter stays author-owned.
CREATE POLICY "letters_moderator_review"
  ON letters FOR UPDATE
  USING (is_moderator() AND status = 'expired')
  WITH CHECK (is_moderator() AND status = 'expired');

-- Bootstrap the founder account as the single v1 moderator.
UPDATE user_profiles SET is_moderator = TRUE WHERE nickname = 'aleksandras';
