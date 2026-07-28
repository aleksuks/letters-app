-- Per-message reporting. `report_target_type` has included 'message' since
-- migration 001 (CLAUDE.md's data model always named it), but no function
-- or UI control ever used it — only whole letters, map letters, and whole
-- conversations were reportable. The App Store / Play review notes in
-- docs/store-release.md §6 already promise "every letter, conversation, and
-- individual message has a report control," so this was a real gap between
-- the claim and the app, not just an unfinished nice-to-have.
--
-- Deliberately lighter than report_conversation(): reporting one message
-- does not end the conversation (a single bad message isn't a verdict on
-- the whole exchange the way migration 010 decided a reported conversation
-- is), and the message body stays visible to both participants — the
-- reporter already read it to report it, and silently redacting it from
-- the sender's own view would just tip off a bad actor mid-conversation.
-- reported_at exists purely to (a) gate moderator read access to that one
-- message via RLS, mirroring the conversation-transcript policy from
-- migration 009, and (b) give resolve_message_report() something to check.

ALTER TABLE messages ADD COLUMN reported_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION report_message(p_message_id UUID, p_reason TEXT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_message messages%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT * INTO v_message FROM messages WHERE id = p_message_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found';
  END IF;

  IF v_message.sender_id = auth.uid() THEN
    RAISE EXCEPTION 'cannot_report_own_message';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM conversations c
    WHERE c.id = v_message.conversation_id
      AND (c.user_a_id = auth.uid() OR c.user_b_id = auth.uid())
  ) THEN
    RAISE EXCEPTION 'not_a_participant';
  END IF;

  INSERT INTO reports (target_type, target_id, reporter_id, reason)
  VALUES ('message', p_message_id, auth.uid(), p_reason);

  UPDATE messages
  SET reported_at = COALESCE(reported_at, NOW())
  WHERE id = p_message_id;
END;
$$;

-- Same three-way outcome as resolve_conversation_report: ignore (unfounded,
-- un-hide from the moderator queue), mute the sender 48h, or ban them
-- outright. Unlike letters there's no "restore" concept beyond 'ignore' —
-- the message was never actually hidden from its two participants.
CREATE OR REPLACE FUNCTION resolve_message_report(p_report_id UUID, p_action TEXT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_report  reports%ROWTYPE;
  v_message messages%ROWTYPE;
BEGIN
  IF NOT is_moderator() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF p_action NOT IN ('ignore', 'mute', 'ban') THEN
    RAISE EXCEPTION 'invalid_action';
  END IF;

  SELECT * INTO v_report FROM reports WHERE id = p_report_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found';
  END IF;
  IF v_report.status != 'open' THEN
    RAISE EXCEPTION 'already_resolved';
  END IF;
  IF v_report.target_type != 'message' THEN
    RAISE EXCEPTION 'wrong_resolver';
  END IF;

  SELECT * INTO v_message FROM messages WHERE id = v_report.target_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'message_not_found';
  END IF;

  UPDATE reports
  SET status = CASE WHEN p_action = 'ignore'
                 THEN 'reviewed_ok'::report_status
                 ELSE 'reviewed_removed'::report_status
               END
  WHERE id = p_report_id;

  IF p_action = 'ignore' THEN
    UPDATE messages SET reported_at = NULL WHERE id = v_report.target_id;
  ELSIF p_action = 'mute' THEN
    UPDATE user_profiles SET muted_until = NOW() + INTERVAL '2 days' WHERE id = v_message.sender_id;
  ELSIF p_action = 'ban' THEN
    UPDATE user_profiles SET banned_at = NOW() WHERE id = v_message.sender_id;
  END IF;
END;
$$;

-- Broaden the moderator read policy from migration 009: previously a
-- moderator could only see messages inside a *reported conversation*. Now a
-- single reported message must be readable on its own too, even when the
-- conversation around it was never reported.
DROP POLICY IF EXISTS "messages_moderator_select" ON messages;
CREATE POLICY "messages_moderator_select"
  ON messages FOR SELECT
  USING (
    is_moderator()
    AND (
      reported_at IS NOT NULL
      OR EXISTS (
        SELECT 1 FROM conversations c
        WHERE c.id = conversation_id AND c.reported_at IS NOT NULL
      )
    )
  );
