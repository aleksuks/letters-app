-- Letter withdrawal: scope author deletes to still-active letters.
--
-- The write screen's new "Atšaukti" (cancel send) button takes back a
-- just-sent letter by deleting its row while the envelope ceremony is
-- still on screen. That delete rides on the original "letters_own"
-- FOR ALL policy — which, unrestricted, would also let an author delete
-- a letter whose status is 'removed_reported', destroying the very row
-- the founder needs to review (CLAUDE.md rule 6: reported content is a
-- status flip, never a delete, so review remains possible).
--
-- A RESTRICTIVE policy ANDs with every permissive one, so this narrows
-- DELETE to active letters without widening or altering anything else:
--   * active letter, own author  -> delete allowed (withdrawal flow;
--     letter_recipients rows cascade, and any reader currently holding
--     a claim sees a friendly "letter withdrawn" notice when their next
--     RPC fails with not_a_recipient)
--   * removed_reported           -> delete blocked, review target survives
--   * expired                    -> delete blocked; the letter has already
--     died publicly and may be in the Obituary moderation queue
CREATE POLICY "letters_delete_active_only"
  ON letters AS RESTRICTIVE FOR DELETE
  USING (status = 'active');
