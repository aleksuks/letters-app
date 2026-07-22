-- Unread message count for the Pokalbiai tab badge. Per-participant
-- last-read marker lives directly on conversations (only two participants
-- ever exist per row, so two columns beat a join table here).
ALTER TABLE conversations
  ADD COLUMN user_a_last_read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN user_b_last_read_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- "conversations_participants" is a FOR ALL policy scoped to conversation
-- membership, not per-column — either participant could otherwise update
-- the other's last-read marker directly. The RPC pins the write to the
-- caller's own column, same pattern as delete_message_for_me (013).
CREATE OR REPLACE FUNCTION mark_conversation_read(p_conversation_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  UPDATE conversations
  SET user_a_last_read_at = CASE WHEN user_a_id = auth.uid() THEN NOW() ELSE user_a_last_read_at END,
      user_b_last_read_at = CASE WHEN user_b_id = auth.uid() THEN NOW() ELSE user_b_last_read_at END
  WHERE id = p_conversation_id
    AND (user_a_id = auth.uid() OR user_b_id = auth.uid());
END;
$$;

-- Total unread across every active conversation the caller is in. A
-- message only counts if it was sent by the other participant after the
-- caller's own last-read marker.
CREATE OR REPLACE FUNCTION unread_message_count()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN 0;
  END IF;

  SELECT COUNT(*) INTO v_count
  FROM messages m
  JOIN conversations c ON c.id = m.conversation_id
  WHERE c.status = 'active'
    AND m.sender_id != auth.uid()
    AND (c.user_a_id = auth.uid() OR c.user_b_id = auth.uid())
    AND m.created_at > (
      CASE WHEN c.user_a_id = auth.uid() THEN c.user_a_last_read_at ELSE c.user_b_last_read_at END
    );

  RETURN v_count;
END;
$$;
