-- Two users could end up with more than one conversation running at once:
-- nothing stopped a requester from opening a connection request against a
-- second letter from the same author (or a second request on a different
-- letter after the first was already accepted), and accept_connection_request
-- never checked for an existing conversation between the same pair. The
-- client (app/receive.tsx) already special-cases an error message
-- containing "conversation_exists" with a friendly, non-deanonymizing
-- alert, but nothing ever raised it — this wires up the actual checks.

-- Blocks a new request the moment an active conversation between the two
-- parties already exists, regardless of which letter it's attached to.
CREATE OR REPLACE FUNCTION check_connection_request_not_duplicate()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM conversations
    WHERE status = 'active'
      AND ((user_a_id = NEW.requester_id AND user_b_id = NEW.author_id)
        OR (user_a_id = NEW.author_id AND user_b_id = NEW.requester_id))
  ) THEN
    RAISE EXCEPTION 'conversation_exists';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_connection_requests_duplicate_check
  BEFORE INSERT ON connection_requests
  FOR EACH ROW EXECUTE FUNCTION check_connection_request_not_duplicate();

-- Belt-and-suspenders on accept: two pending requests between the same pair
-- (from two different letters) could both still exist from before this
-- trigger, or slip in between an insert and its accept. Refuse to mint a
-- second conversation for a pair that already has one running.
CREATE OR REPLACE FUNCTION accept_connection_request(p_request_id UUID)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_req   connection_requests%ROWTYPE;
  v_conv_id UUID;
BEGIN
  SELECT * INTO v_req FROM connection_requests WHERE id = p_request_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_found';
  END IF;

  IF v_req.author_id != auth.uid() THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  IF v_req.status != 'pending' THEN
    RAISE EXCEPTION 'not_pending';
  END IF;

  IF EXISTS (
    SELECT 1 FROM conversations
    WHERE status = 'active'
      AND ((user_a_id = v_req.requester_id AND user_b_id = v_req.author_id)
        OR (user_a_id = v_req.author_id AND user_b_id = v_req.requester_id))
  ) THEN
    RAISE EXCEPTION 'conversation_exists';
  END IF;

  UPDATE connection_requests SET status = 'accepted' WHERE id = p_request_id;

  INSERT INTO conversations (connection_request_id, user_a_id, user_b_id)
  VALUES (p_request_id, v_req.author_id, v_req.requester_id)
  RETURNING id INTO v_conv_id;

  RETURN v_conv_id;
END;
$$;
