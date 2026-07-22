-- Wording change for the plain timed-expiry death notification (the
-- graveyard-vote branch keeps its own distinct wording from migration 019).
-- "Kapinės" is already the app's established term for a letter's end state
-- (the public Obituary tab, the receive-screen dislike action) — this
-- aligns the timed-expiry push with that same vocabulary instead of the
-- more clinical "baigė kelionę".
CREATE OR REPLACE FUNCTION notify_letter_lifecycle()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_token TEXT;
  v_title TEXT;
  v_body  TEXT;
BEGIN
  SELECT push_token INTO v_token FROM user_profiles WHERE id = NEW.author_id;
  IF v_token IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'expired' AND OLD.status IS DISTINCT FROM 'expired' THEN
    IF NEW.dislike_count >= 3 AND NEW.dislike_count > NEW.like_count THEN
      v_title := 'Tavo laiškelį išbalsavo...';
      v_body  := 'Jį pamatė ' || NEW.travel_count || ', ir palaikino ' || NEW.like_count
        || CASE WHEN NEW.like_count = 1 THEN ' žmogus.' ELSE ' žmonės.' END;
    ELSE
      v_title := 'Tavo laiškelis jau kapinėse.';
      v_body  := 'Laiškeliai ten patenka, kai praeina savaitė arba būna išbalsuoti.';
    END IF;

    INSERT INTO notification_outbox (user_id, type, title, body, data, push_token)
    VALUES (
      NEW.author_id,
      'letter_died',
      v_title,
      v_body,
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
      'Tavo laiškelis patvirtintas skai(s)tyklos ir ilsisi Kapinėse.',
      jsonb_build_object('type', 'letter_obituary', 'letter_id', NEW.id),
      v_token
    );
  END IF;

  RETURN NEW;
END;
$$;
