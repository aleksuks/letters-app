-- Wording fix: the Obituary-placement push notification body opened its
-- quote with the correct Lithuanian „ but closed with a straight ASCII "
-- instead of the matching “ (a copy-paste slip carried through 015, 018,
-- 019, and 030). Re-issued here rather than editing those already-applied
-- migrations.

CREATE OR REPLACE FUNCTION notify_letter_lifecycle()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_token   TEXT;
  v_enabled BOOLEAN;
BEGIN
  SELECT push_token, activity_notifications_enabled INTO v_token, v_enabled
  FROM user_profiles WHERE id = NEW.author_id;

  IF v_token IS NULL OR NOT v_enabled THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'expired' AND OLD.status IS DISTINCT FROM 'expired' THEN
    INSERT INTO notification_outbox (user_id, type, title, body, data, push_token)
    VALUES (
      NEW.author_id,
      'letter_died',
      'Tavo laiškelis baigė kelionę',
      '✉ ' || NEW.travel_count || '   ·   ❤ ' || (NEW.like_count + NEW.after_like_count),
      jsonb_build_object('type', 'letter_died', 'letter_id', NEW.id),
      v_token
    );
  END IF;

  IF NEW.approved_for_obituary AND NOT OLD.approved_for_obituary THEN
    INSERT INTO notification_outbox (user_id, type, title, body, data, push_token)
    VALUES (
      NEW.author_id,
      'letter_obituary',
      'Tavo laiškelis kapinėse',
      'Praėjo peržiūrą ir dabar matomas viešai, „Kapinių“ skiltyje.',
      jsonb_build_object('type', 'letter_obituary', 'letter_id', NEW.id),
      v_token
    );
  END IF;

  RETURN NEW;
END;
$$;
