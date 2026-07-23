# CLAUDE.md — Letters for Strangers

## Project context
This repo is being repurposed from a prior micro-learning app project. The
React + Supabase foundation (auth, hosting, basic CRUD patterns) carries
over; the domain model, screens, and business logic are being replaced.
Treat this as a fresh product built on a familiar stack, not an extension
of the old one — remove or archive micro-learning-specific code, schema,
and copy as you go rather than leaving it dormant.

## Stack
- React (frontend)
- Supabase (auth, Postgres, realtime where useful for chat)
- Existing deployment/hosting setup from the prior project, reused as-is
  unless it conflicts with new requirements.

## Product summary
An anonymous-ish letter-sharing app for a local (Lithuania) audience.
Users with a nickname-based account write short letters that are
distributed at random to other users. Likes cause a letter to travel to
a new random recipient. Letters expire after 7 days. Expired letters that
clear manual moderation appear on a public leaderboard ("Obituary").
Recipients can request a private conversation with a letter's author;
if accepted, a nickname-based in-app chat opens with basic safety controls.

A second letter kind exists alongside the random pool: **map letters** —
letters pinned to a chosen spot on a Lithuania-only map, addressed to
someone the author saw or encountered there but never got to thank or
apologize to. They are publicly browsable by any signed-in user (hotspot
clusters zoomed out, individual letter squares zoomed in), live 30 days,
and support the same request-to-talk flow so the addressee can answer.

Full flow detail lives in `product-flow.md` in this repo — read it before
implementing any screen or table.

## Data model (target schema — adapt as needed, but keep these entities)

- `users`: id, nickname (unique), age_confirmed (bool), created_at.
  No real name, email optional only if needed for auth recovery, no phone
  number collection.
- `letters`: id, author_id, body (text), created_at, expires_at
  (created_at + 7 days), status (active | expired | removed_reported),
  like_count (int), dislike_count (int), travel_count (int, counts actual
  deliveries), recipient_cap (int, ceil(users/16) frozen at send time),
  last_delivered_at (timestamptz, powers the one-delivery-per-hour pacing).
- `letter_recipients`: id, letter_id, user_id, seen_at, opened_at
  (timestamptz, set when the app confirms the letter was actually shown),
  released_at (timestamptz, set when an unopened claim is returned to the
  pool), liked (bool), disliked (bool).
  Tracks who has already seen a given letter so it's never resent to the
  same person twice, and powers the "don't show me my own letter" rule.
  A released row does not count as "seen" — the claim was abandoned before
  reading, so the same user may receive that letter again.
- `map_letters`: id, author_id, body, lat, lng (double precision, CHECK
  constrained to Lithuania's bounding box), created_at, expires_at
  (created_at + 30 days — longer than pool letters, since the person a map
  letter is aimed at may not open the app for weeks), status (reuses
  `letter_status`), like_count, last_notified_like_milestone. Likes exist
  (`map_letter_likes`: one per reader, never on your own letter, no
  unlike — a nod for something funny or honest) but carry no distribution
  mechanics: no reach, no lifespan extension, no ranking. They do notify
  the author via the same milestone ladder as pool letters (rule 10).
  No dislike/travel machinery and no Obituary —
  the map itself is the public surface, and letters simply vanish on
  expiry. Placement is always a deliberate map tap; device GPS is never
  read, so no location tracking exists to leak.
- `connection_requests`: id, letter_id (nullable), map_letter_id
  (nullable — exactly one of the two is set, CHECK-enforced), requester_id,
  author_id, greeting (text), status (pending | accepted | declined),
  created_at. A single table for both letter kinds so the accepts_requests
  policy, block trigger, duplicate-conversation trigger, and accept flow
  apply identically.
- `conversations`: id, connection_request_id, user_a_id, user_b_id,
  status (active | left_by_a | left_by_b | blocked), created_at.
- `messages`: id, conversation_id, sender_id, body, created_at,
  deleted_for_sender (bool) — supports "delete for me" without affecting
  the other participant's view.
- `reports`: id, target_type (letter | conversation | message), target_id,
  reporter_id, reason, status (open | reviewed_ok | reviewed_removed),
  created_at. All reports route to a single manual review queue.
- `moderation_keywords`: id, term (as entered), term_normalized (unique,
  filled by trigger), points (severity weight), is_prefix (bool, default
  true — prefix matching covers Lithuanian case endings), created_at.
  Founder-managed via the Supabase dashboard only; RLS with no policies
  keeps the list unreadable from the app so it can't be mined.
- `notification_outbox`: id, user_id, type (like_milestone | letter_died |
  letter_obituary | reminder | map_like_milestone), title, body, data
  (jsonb), push_token
  (captured at enqueue time), created_at, sent_at, error. Write-only from
  triggers/cron (SECURITY DEFINER); RLS enabled with no policies, same
  founder-only-visibility pattern as `moderation_keywords` — clients never
  read their own notification history, since there is no in-app inbox.

## Core business rules to implement
1. A letter is never shown to its own author, and never shown twice to
   the same recipient (`letter_recipients` enforces this).
2. Distribution is pull-based and first-come-first-served: a letter can be
   claimed by `recipient_cap` distinct readers, paced at most one delivery
   per hour (gated on `last_delivered_at`, not creation time, so quiet
   periods never stack up burst-claimable slots). A like increments
   `like_count`, which extends total reach by exactly +1 reader — there is
   no travel ceiling. A dislike is a graveyard vote: the letter dies early
   only when dislikes >= 3 AND dislikes > likes. This logic lives in the
   `receive_letter()` / `like_letter()` / `dislike_letter()` SQL functions
   (migrations 006 + 012). A claim is provisional until the app confirms
   the letter was actually shown (`open_letter()`, migration 012); claims
   abandoned before reading are released — explicitly via
   `release_letter()` on exit, or by the `release_stale_claims()` reaper
   for dead clients — returning the delivery slot and pacing stamp to the
   pool so no letter's reach is burned by unopened deliveries.
3. Letters past `expires_at` are excluded from the receive pool
   automatically — this should be enforced at the query level, not just
   client-side. The status flip itself is `expire_due_letters()`
   (migration 012), run lazily on receive, on moderation-queue load, and
   via pg_cron where available — expiry must never depend on a letter
   being touched again.
4. Only letters with `status = expired` AND that have passed manual
   moderation review are eligible for the public Obituary feed. Build an
   explicit moderation flag/step here — don't make expiry alone sufficient
   for public display.
5. Connection requests: only the letter's original author can
   accept/decline a request tied to their letter. Accepting creates a
   `conversations` row scoped to those two users only.
6. Reported content (letter, conversation, or message) is immediately
   excluded from further normal distribution/visibility pending review —
   implement this as a status flip, not a delete, so review remains
   possible.
7. Blocking a user must prevent all future connection requests and
   messages between the two users in both directions.
8. Never collect, store, or request phone numbers, emails beyond auth
   necessity, or social handles anywhere in the schema or UI copy.
9. Keyword auto-moderation gates letters at send time (migration 007):
   `moderation_score()` sums points over every keyword occurrence in a
   normalized copy of the body (lowercased, unaccented, leet-mapped,
   repeat-collapsed, with a separator-stripped second pass for
   high-severity terms). A `BEFORE INSERT` trigger on `letters` rejects
   the letter when the total crosses `REJECT_THRESHOLD`, raising
   `letter_rejected_moderation`, which the write screen turns into a
   friendly warning. Points-based by design: a genuine letter with a few
   rough words passes; slur-spam does not. Thresholds and weights are
   tuning knobs in the migration; the keyword list itself is data, not
   code.
10. Push notifications exist only for a small, deliberate set of events, and
    stay gentle by design — no badges, no daily digests, no streaks:
    - **Like milestones**: an author is notified when their letter's
      `total_like_count` crosses one of a fixed set of thresholds (1, 2, 3,
      5, 10, 15, 20, 25, 30, 40, 50, 75, 100, 150, 200, 300, 500, 750,
      1000 — a tuning knob, `letters.last_notified_like_milestone` tracks
      the high-water mark so a milestone never fires twice). Map letters
      mirror this with their own type (`map_like_milestone`, migration
      033): same ladder, same high-water column on `map_letters`, same
      `activity_notifications_enabled` gate, but a tap deep-links to the
      map letter itself. It is the only notification map letters ever
      produce — their expiry stays silent.
    - **Letter death**: an author is notified once when their letter's
      `status` flips to `expired` (any path — timed expiry or graveyard
      vote), independent of the Obituary decision.
    - **Obituary placement**: a second, separate notification fires only
      when a moderator later flips `approved_for_obituary` to true — never
      bundled with the death notification, since moderation is a distinct,
      asynchronous step (rule 4) and most expired letters never clear it.
    - **Gentle reminder**: at most one low-frequency nudge to check for new
      letters, sent only to accounts that have been inactive for a while
      *and* only when at least one letter is actually receivable by that
      user right now — never sent into an empty pool. Rate-limited per user
      (`user_profiles.last_reminder_sent_at`) and can be turned off
      independently of the other notification types (`reminders_enabled`)
      since it's the one re-engagement-flavored nudge rather than a status
      update about the user's own letter.
    Delivery is push-only (Expo push service) — there is no in-app
    notification center to read these in later; a missed push is just
    missed. Enqueueing (DB triggers/cron) is decoupled from sending (an
    Edge Function draining `notification_outbox`) so a delivery failure
    never blocks the business-logic transaction that generated it.

11. Map letters (migration 031) follow the same safety rails as pool
    letters wherever they overlap: the send-time keyword gate (rule 9)
    runs via the same trigger function; reporting is a status flip into
    the same single review queue (`report_map_letter()`, target_type
    `map_letter`, resolved through `resolve_report()`); connection
    requests reuse the shared table and all its triggers (rules 5–7).
    Where they differ is deliberate: any signed-in user may read any
    active map letter (RLS `map_letters_read_active`), coordinates are
    hard-bounded to Lithuania (DB CHECK + map UI bounds), expiry is 30
    days via `expire_due_map_letters()` (lazy in `get_map_letters()` +
    the shared pg_cron sweep), there are no reach caps or pacing, and
    likes (`like_map_letter()`, migration 032) carry no distribution
    mechanics — their only effects are the author's milestone push (rule
    10) and a subtle visual on the map. The map UI is a WebView MapLibre
    GL map (`lib/map-html.ts`, vector tiles from OpenFreeMap, no API key;
    the Lithuania-only crop mask is `lib/lt-border.ts`) — hotspot
    clusters when zoomed out, readable
    mini-letters (paper card, typewriter font, body + signature) when
    zoomed in. Short letters (≤180 chars, tuning knob) show in full and
    are not openable — double-tapping one pops a big heart at the tap
    point and likes it; long letters show clamped and a tap opens the
    detail screen, which carries the same double-tap-to-like (shared
    `components/double-tap-like.tsx`, also used for Obituary afterlikes).
    Own letters are always openable (delete lives there), never likeable.
    A well-loved letter (10+ likes, tuning knob) glows softly.

## Explicit v1 non-goals (do not build these yet)
- No in-app notification center/inbox — see rule 10; push is the only
  surface, and there's nothing to read inside the app itself.
- No algorithmic recommendation or mood-based matching.
- No public user profiles beyond nickname.
- No ML/NLP content moderation (classifiers, embeddings, third-party
  moderation APIs). The deterministic keyword scoring gate at send time
  (rule 9, migration 007) is in scope; human judgment beyond it stays
  manual-review only.
- No multi-moderator tooling — assume a single founder reviewer.
- No device GPS / location permission anywhere: map letters are placed
  and browsed by panning a map, never by reading the user's position. No
  "letters near me" notifications, no geofencing, no location history.
- No dislikes on map letters, and no map-letter leaderboard — likes are a
  quiet appreciation counter, never a ranking signal; map letters are
  one-to-one messages in spirit, not content competing for reach.

## Engineering conventions
- Prefer Supabase row-level security policies over client-side checks for
  anything privacy-sensitive (who can see a letter, who can see a
  conversation) — client-side checks alone are not sufficient here given
  the anonymity premise of the product.
- Keep moderation-relevant status fields (`status` on letters, reports)
  as the source of truth for visibility queries; don't infer visibility
  from multiple scattered conditions.
- Favor explicit, readable query logic for the random-recipient selection
  and travel-cap logic, since this is the mechanic most likely to need
  tuning after real usage (e.g. travel cap, prompt presence, expiry
  window) — isolate it so it's easy to adjust later.

## When in doubt
Re-read `product-flow.md`. If a requested feature isn't described there
or in this file, flag it rather than assuming — this product's safety
model depends on deliberate, not incidental, feature scope.

## Localization
   App UI copy is in Lithuanian for end users. Source code, comments, and
   CLAUDE.md/product-flow.md stay in English — only user-facing strings
    (JSX text, alerts, placeholders) need Lithuanian.