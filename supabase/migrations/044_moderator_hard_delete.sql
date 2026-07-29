-- ============================================================
-- 044 — Moderator hard delete on letters and map letters
-- ============================================================
--
-- The founder-as-single-moderator wants to permanently delete any letter
-- or map letter they come across — whether that's in the moderation
-- dashboard's queues or just while using the app normally (browsing the
-- map, receiving a random pool letter, reading the Obituary) — without
-- going through the report -> review -> resolve pipeline first.
--
-- This is deliberately narrower than rule 6 (reported content is a status
-- flip, never a delete, so review remains possible): that rule governs the
-- *default*, user-facing report path, which still exists unchanged for
-- everyone including the moderator. This adds a second, moderator-only
-- capability on top — an escape hatch for the one person who is also the
-- product owner, not a replacement for the review trail regular users get.

-- ------------------------------------------------------------
-- letters — the existing RESTRICTIVE delete-scope policy (024) limits
-- DELETE to status = 'active' so an author can't destroy a
-- removed_reported or expired row out from under the review queue. A
-- moderator needs to delete regardless of status, so they're exempted
-- from that restriction; a new permissive policy then grants the delete
-- itself (a RESTRICTIVE policy only ever narrows permissive ones, it
-- never grants access on its own).
-- ------------------------------------------------------------

DROP POLICY IF EXISTS "letters_delete_active_only" ON letters;

CREATE POLICY "letters_delete_active_only"
  ON letters AS RESTRICTIVE FOR DELETE
  USING (status = 'active' OR is_moderator());

CREATE POLICY "letters_moderator_delete"
  ON letters FOR DELETE
  USING (is_moderator());

-- ------------------------------------------------------------
-- map_letters — no restrictive delete scope exists here (map_letters_own
-- already lets an author delete their own letter in any status), so the
-- permissive moderator policy is the only addition needed.
-- ------------------------------------------------------------

CREATE POLICY "map_letters_moderator_delete"
  ON map_letters FOR DELETE
  USING (is_moderator());
