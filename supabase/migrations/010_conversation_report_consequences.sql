-- Conversation reports were modeled like letter reports (soft-pause, then
-- moderator restores or confirms removal) — wrong shape for this case. A
-- reported conversation must end immediately for both parties, full stop;
-- the moderator's call isn't whether to reopen it (a report is a signal
-- about a person, not a pause button on a chat) but what happens to the
-- reported user: ignore the report, mute them 48h, or ban them outright.
--
-- Letter reports keep their existing restore/confirm-removal review — a
-- bad-faith report on a letter should be able to reinstate it, so that
-- part of migration 008/009 is untouched here.

-- ============================================================
-- SCHEMA: mute / ban
-- ============================================================

ALTER TABLE user_profiles ADD COLUMN muted_until TIMESTAMPTZ;
ALTER TABLE user_profiles ADD COLUMN banned_at   TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION is_restricted(p_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_profiles
    WHERE id = p_user_id
      AND (banned_at IS NOT NULL OR (muted_until IS NOT NULL AND muted_until > NOW()))
  );
$$;

-- Muted/banned users lose the three ways of "speaking" in this app:
-- writing letters, sending messages, and sending connection requests.
-- Reading/browsing stays open — this is a speech restriction, not an
-- account lockout (a real ban-from-login would need auth-level changes
-- outside RLS's reach).
CREATE OR REPLACE FUNCTION check_author_not_restricted()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF is_restricted(NEW.author_id) THEN
    RAISE EXCEPTION 'user_restricted';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_letters_restriction_check
  BEFORE INSERT ON letters
  FOR EACH ROW EXECUTE FUNCTION check_author_not_restricted();

CREATE OR REPLACE FUNCTION check_sender_not_restricted()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF is_restricted(NEW.sender_id) THEN
    RAISE EXCEPTION 'user_restricted';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_messages_restriction_check
  BEFORE INSERT ON messages
  FOR EACH ROW EXECUTE FUNCTION check_sender_not_restricted();

CREATE OR REPLACE FUNCTION check_requester_not_restricted()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF is_restricted(NEW.requester_id) THEN
    RAISE EXCEPTION 'user_restricted';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_connection_requests_restriction_check
  BEFORE INSERT ON connection_requests
  FOR EACH ROW EXECUTE FUNCTION check_requester_not_restricted();

-- ============================================================
-- REPORTING A CONVERSATION now ends it immediately, for good.
-- ============================================================

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

  -- Reuses 'blocked' rather than a new enum value: ALTER TYPE ... ADD
  -- VALUE can't be used in the same transaction that adds it, and
  -- 'blocked' already means "ended, not resuming" everywhere it's used.
  UPDATE conversations
  SET status = 'blocked', reported_at = COALESCE(reported_at, NOW())
  WHERE id = p_conversation_id
    AND status = 'active';
END;
$$;

-- ============================================================
-- MODERATOR RESOLUTION
-- ============================================================

-- Letters only now — restores a wrongly-reported letter, or confirms the
-- removal stays.
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
  IF v_report.target_type != 'letter' THEN
    RAISE EXCEPTION 'wrong_resolver';
  END IF;

  UPDATE reports
  SET status = CASE WHEN p_restore
                 THEN 'reviewed_ok'::report_status
                 ELSE 'reviewed_removed'::report_status
               END
  WHERE id = p_report_id;

  IF p_restore THEN
    UPDATE letters
    SET status = CASE WHEN expires_at > NOW() THEN 'active' ELSE 'expired' END
    WHERE id = v_report.target_id
      AND status = 'removed_reported';
  END IF;
END;
$$;

-- Conversations: the conversation is already ended (see report_conversation
-- above) regardless of outcome here. p_action picks the consequence for
-- whichever participant isn't the reporter: 'ignore' closes the report
-- with none, 'mute' restricts them 48h, 'ban' restricts them indefinitely.
CREATE OR REPLACE FUNCTION resolve_conversation_report(p_report_id UUID, p_action TEXT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_report reports%ROWTYPE;
  v_conv   conversations%ROWTYPE;
  v_target UUID;
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
  IF v_report.target_type != 'conversation' THEN
    RAISE EXCEPTION 'wrong_resolver';
  END IF;

  SELECT * INTO v_conv FROM conversations WHERE id = v_report.target_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'conversation_not_found';
  END IF;

  v_target := CASE WHEN v_conv.user_a_id = v_report.reporter_id
                THEN v_conv.user_b_id ELSE v_conv.user_a_id END;

  UPDATE reports
  SET status = CASE WHEN p_action = 'ignore'
                 THEN 'reviewed_ok'::report_status
                 ELSE 'reviewed_removed'::report_status
               END
  WHERE id = p_report_id;

  IF p_action = 'mute' THEN
    UPDATE user_profiles SET muted_until = NOW() + INTERVAL '2 days' WHERE id = v_target;
  ELSIF p_action = 'ban' THEN
    UPDATE user_profiles SET banned_at = NOW() WHERE id = v_target;
  END IF;
END;
$$;
