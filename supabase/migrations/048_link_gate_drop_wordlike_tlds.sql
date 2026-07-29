-- The bare-domain branch of contains_link() (migration 042) fires on any
-- `word.tld` with no whitespace around the dot. That shape is also what a
-- missing space after a sentence-ending period produces — and several of
-- the two-letter ccTLDs on the list are themselves ordinary words:
--
--   "Gerai.to buvo seniai"   -> flagged as a link  (`to` is very common
--                               Lithuanian: "aš to nežinau")
--   "vakar.TV rodė"          -> flagged
--   "as.me", "eik.by", ...
--
-- A wrongly refused message is worse here than a missed link: the sender
-- has no idea what part of an ordinary sentence offended, and chat is
-- already the narrow, consent-gated surface (both sides opted in), not the
-- broadcast one. So drop the word-like ccTLDs from the BARE-domain branch:
--   to, me, by, de, co, tv, gg
--
-- They are not unblocked, only de-escalated — the first branch still
-- catches them the moment they are written as an actual link
-- (`http://x.to`, `www.x.to`), which is how a link gets shared in practice
-- when the sender wants it to be tappable.
--
-- Deliberately kept:
--   lt  — not a word, and the likeliest TLD in a genuine Lithuanian link
--   ly  — not a word standalone, and bit.ly is a real shortener
--   io, eu, ru, pl — not words in either UI language

CREATE OR REPLACE FUNCTION contains_link(p_text TEXT)
RETURNS BOOLEAN LANGUAGE sql IMMUTABLE AS $$
  SELECT coalesce(p_text, '') ~* '(https?://|www\.)\S+'
      OR coalesce(p_text, '') ~*
         '\m[a-z0-9][a-z0-9-]*\.(com|net|org|lt|io|info|app|ru|pl|eu|xyz|link|ly|biz|page|chat|click)\M';
$$;

REVOKE EXECUTE ON FUNCTION contains_link(TEXT) FROM PUBLIC, anon, authenticated;
