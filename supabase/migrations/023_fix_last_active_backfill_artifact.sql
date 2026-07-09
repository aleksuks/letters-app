-- Migration 015's `ADD COLUMN last_active_at ... DEFAULT NOW()` backfilled
-- every pre-existing user_profiles row with the migration's own execution
-- timestamp, not each user's real last activity — inflating "active
-- users" stats since a batch of long-dormant test accounts all appeared
-- to have opened the app at the exact same instant.
--
-- Any last_active_at value shared by more than one row is that backfill
-- artifact (real activity never lands on the same millisecond across
-- distinct users) — reset those rows to created_at, the best available
-- proxy for historical activity, same reasoning as the died_at backfill
-- in migration 014. Rows with a unique timestamp (real touches recorded
-- since 015 shipped) are left untouched.
UPDATE user_profiles
SET last_active_at = created_at
WHERE last_active_at IN (
  SELECT last_active_at FROM user_profiles GROUP BY last_active_at HAVING COUNT(*) > 1
);
