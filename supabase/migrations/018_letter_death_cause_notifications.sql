-- Split the flat "letter died" notification into two distinct messages
-- depending on why status flipped to 'expired': voted out early by
-- readers (dislike_letter()'s graveyard rule — dislikes >= 3 and greater
-- than likes) vs simply reaching the end of its 7-day lifespan
-- (expire_due_letters()). Both paths only ever set status = 'expired', so
-- the trigger infers the cause from the same dislike/like condition
-- dislike_letter() itself checks before flipping status.
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
      v_body  := 'Jį pamatė ' || NEW.travel_count || ', o palaikino ' || NEW.like_count
        || CASE WHEN NEW.like_count = 1 THEN ' žmogus.' ELSE ' žmonės.' END;
    ELSE
      v_title := 'Tavo laiškelis baigė kelionę';
      v_body  := 'Praėjo savaitė, atėjo metas nusileisti.';
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
      'Praėjo peržiūrą ir dabar matomas viešai, „Kapinių" skiltyje.',
      jsonb_build_object('type', 'letter_obituary', 'letter_id', NEW.id),
      v_token
    );
  END IF;

  RETURN NEW;
END;
$$;
