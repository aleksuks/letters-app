-- Reporting + blocking (CLAUDE.md rules 6 & 7). Both were schema-ready
-- (letter_status already has 'removed_reported', reports table already
-- exists) but nothing ever wrote to them and there was no way to block a
-- user at all. This wires up: report a letter or conversation (soft
-- removal, pending founder review, never a delete), block a user (stops
-- future connection requests and messages between the pair, both
-- directions), and the founder-side review step that resolves an open
-- report either way.

-- ============================================================
-- SCHEMA
-- ============================================================

CREATE TABLE blocked_users (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  blocked_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (blocker_id, blocked_id),
  CHECK (blocker_id != blocked_id)
);

CREATE INDEX idx_blocked_users_blocker ON blocked_users(blocker_id);
CREATE INDEX idx_blocked_users_blocked ON blocked_users(blocked_id);

ALTER TABLE conversations ADD COLUMN reported_at TIMESTAMPTZ;

ALTER TABLE blocked_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "blocked_users_own"
  ON blocked_users FOR ALL
  USING (auth.uid() = blocker_id)
  WITH CHECK (auth.uid() = blocker_id);

-- ============================================================
-- BLOCKING
-- ============================================================

CREATE OR REPLACE FUNCTION is_blocked_pair(p_a UUID, p_b UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM blocked_users
    WHERE (blocker_id = p_a AND blocked_id = p_b)
       OR (blocker_id = p_b AND blocked_id = p_a)
  );
$$;

-- Records the block and, if the pair currently shares an active
-- conversation, ends it for both by reusing the existing 'blocked' status.
CREATE OR REPLACE FUNCTION block_user(p_user_id UUID)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'cannot_block_self';
  END IF;

  INSERT INTO blocked_users (blocker_id, blocked_id)
  VALUES (auth.uid(), p_user_id)
  ON CONFLICT (blocker_id, blocked_id) DO NOTHING;

  UPDATE conversations
  SET status = 'blocked'
  WHERE status = 'active'
    AND ((user_a_id = auth.uid() AND user_b_id = p_user_id)
      OR (user_a_id = p_user_id AND user_b_id = auth.uid()));
END;
$$;

-- Blocked pairs can never open a new connection request in either
-- direction, regardless of the target's global accepts_requests setting.
CREATE OR REPLACE FUNCTION check_connection_request_not_blocked()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF is_blocked_pair(NEW.requester_id, NEW.author_id) THEN
    RAISE EXCEPTION 'blocked_pair';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_connection_requests_block_check
  BEFORE INSERT ON connection_requests
  FOR EACH ROW EXECUTE FUNCTION check_connection_request_not_blocked();

-- Belt-and-suspenders on messages: blocks the conversation-ending case
-- above, plus any conversation flagged by a report.
CREATE OR REPLACE FUNCTION check_message_sendable()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_conv conversations%ROWTYPE;
BEGIN
  SELECT * INTO v_conv FROM conversations WHERE id = NEW.conversation_id;

  IF v_conv.status != 'active' THEN
    RAISE EXCEPTION 'conversation_not_active';
  END IF;

  IF v_conv.reported_at IS NOT NULL THEN
    RAISE EXCEPTION 'conversation_reported';
  END IF;

  IF is_blocked_pair(v_conv.user_a_id, v_conv.user_b_id) THEN
    RAISE EXCEPTION 'blocked_pair';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_messages_sendable_check
  BEFORE INSERT ON messages
  FOR EACH ROW EXECUTE FUNCTION check_message_sendable();

-- ============================================================
-- REPORTING
-- ============================================================

-- Soft-removes the letter immediately (same status a graveyard vote would
-- produce) so it stops circulating, without touching the Obituary path.
CREATE OR REPLACE FUNCTION report_letter(p_letter_id UUID, p_reason TEXT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  INSERT INTO reports (target_type, target_id, reporter_id, reason)
  VALUES ('letter', p_letter_id, auth.uid(), p_reason);

  UPDATE letters
  SET status = 'removed_reported'
  WHERE id = p_letter_id
    AND status = 'active';
END;
$$;

-- Gates future messages pending review; history stays intact for both
-- participants and the moderator (soft removal, not delete).
CREATE OR REPLACE FUNCTION report_conversation(p_conversation_id UUID, p_reason TEXT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM conversations
    WHERE id = p_conversation_id
      AND (user_a_id = auth.uid() OR user_b_id = auth.uid())
  ) THEN
    RAISE EXCEPTION 'not_a_participant';
  END IF;

  INSERT INTO reports (target_type, target_id, reporter_id, reason)
  VALUES ('conversation', p_conversation_id, auth.uid(), p_reason);

  UPDATE conversations
  SET reported_at = NOW()
  WHERE id = p_conversation_id
    AND reported_at IS NULL;
END;
$$;

-- ============================================================
-- MODERATOR REVIEW
-- ============================================================

CREATE POLICY "reports_moderator_select"
  ON reports FOR SELECT USING (is_moderator());

CREATE POLICY "letters_moderator_select_reported"
  ON letters FOR SELECT
  USING (is_moderator() AND status = 'removed_reported');

CREATE POLICY "conversations_moderator_select"
  ON conversations FOR SELECT
  USING (is_moderator() AND reported_at IS NOT NULL);

-- Resolves a single open report. p_restore = TRUE means the report didn't
-- hold up: reinstates the letter/conversation. p_restore = FALSE confirms
-- the removal and just closes out the report — the target stays hidden.
CREATE OR REPLACE FUNCTION resolve_report(p_report_id UUID, p_restore BOOLEAN)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_report reports%ROWTYPE;
BEGIN
  IF NOT is_moderator() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT * INTO v_report FROM reports WHERE id = p_report_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found';
  END IF;
  IF v_report.status != 'open' THEN
    RAISE EXCEPTION 'already_resolved';
  END IF;

  UPDATE reports
  SET status = CASE WHEN p_restore THEN 'reviewed_ok' ELSE 'reviewed_removed' END
  WHERE id = p_report_id;

  IF p_restore THEN
    IF v_report.target_type = 'letter' THEN
      UPDATE letters
      SET status = CASE WHEN expires_at > NOW() THEN 'active' ELSE 'expired' END
      WHERE id = v_report.target_id
        AND status = 'removed_reported';
    ELSIF v_report.target_type = 'conversation' THEN
      UPDATE conversations
      SET reported_at = NULL
      WHERE id = v_report.target_id;
    END IF;
  END IF;
END;
$$;
