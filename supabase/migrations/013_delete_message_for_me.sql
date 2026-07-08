-- "Delete for me" on individual chat messages (product-flow.md section 7).
--
-- deleted_for_sender has existed on messages since the initial schema but
-- nothing ever set it. This is a per-sender visibility flag, not a real
-- delete: the other participant's view of the conversation is untouched,
-- and moderator review of a reported conversation must still see the full
-- transcript, so the row is never removed or blanked out — only flagged.
--
-- An RPC rather than a raw client-side UPDATE, because "messages_participants"
-- is a FOR ALL policy scoped to conversation membership, not per-column —
-- either participant could otherwise update any field on any message in
-- their shared conversation. The RPC pins the check to "your own message
-- only" explicitly, the same pattern as like_letter/dislike_letter.

CREATE OR REPLACE FUNCTION delete_message_for_me(p_message_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  UPDATE messages
  SET deleted_for_sender = TRUE
  WHERE id = p_message_id
    AND sender_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_your_message';
  END IF;
END;
$$;
