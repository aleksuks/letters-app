-- Two fixes to the reporting/blocking review flow from migration 008:
--
-- 1. resolve_report()'s CASE expression resolved its two string literals
--    as `text` (no enum context inside a CASE), so the UPDATE against the
--    `report_status` enum column failed with a type mismatch. Explicit
--    casts fix it.
-- 2. The moderator queue only ever showed nicknames + the reporter's
--    reason for a reported conversation — no way to actually judge the
--    report without reading what was said. Give the moderator read access
--    to messages in conversations that are currently reported.

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
  SET status = CASE WHEN p_restore
                 THEN 'reviewed_ok'::report_status
                 ELSE 'reviewed_removed'::report_status
               END
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

CREATE POLICY "messages_moderator_select"
  ON messages FOR SELECT
  USING (
    is_moderator()
    AND EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = conversation_id AND c.reported_at IS NOT NULL
    )
  );
