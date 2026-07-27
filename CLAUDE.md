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
- `letters`: id, author_id, body (text), drawing (jsonb, nullable — crayon
  strokes, see rule 12), created_at, expires_at
  (created_at + 7 days), status (active | expired | removed_reported),
  like_count (int), dislike_count (int), travel_count (int, counts actual
  deliveries),
  last_delivered_at (timestamptz, powers the one-delivery-per-hour pacing —
  the only limit on how far a letter travels; the old `recipient_cap`
  column was dropped in migration 037).
- `letter_recipients`: id, letter_id, user_id, seen_at, opened_at
  (timestamptz, set when the app confirms the letter was actually shown),
  released_at (timestamptz, set when an unopened claim is returned to the
  pool), liked (bool), disliked (bool).
  Tracks who has already seen a given letter so it's never resent to the
  same person twice, and powers the "don't show me my own letter" rule.
  A released row does not count as "seen" — the claim was abandoned before
  reading, so the same user may receive that letter again.
- `map_letters`: id, author_id, body, drawing (jsonb, nullable — same
  format and rules as on `letters`), lat, lng (double precision, CHECK
  constrained to Lithuania's bounding box), created_at, expires_at
  (created_at + 30 days — longer than pool letters, since the person a map
  letter is aimed at may not open the app for weeks), status (reuses
  `letter_status`), like_count, last_notified_like_milestone. Likes exist
  (`map_letter_likes`: one per reader, never on your own letter, toggleable
  — a second tap withdraws it, migration 035) but carry no distribution
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
2. Distribution is pull-based and first-come-first-served: a letter may be
   claimed by any number of distinct readers, paced at most one delivery
   per hour (gated on `last_delivered_at`, not creation time, so quiet
   periods never stack up burst-claimable slots). There is no reach
   ceiling — pacing plus the 7-day lifespan bound the total on their own
   (migration 037 dropped `recipient_cap`). Consequently a like carries no
   distribution power on pool letters either: `like_count` is a counter, a
   milestone-push trigger, and an Obituary sort key, exactly as on map
   letters. A dislike still is a graveyard vote: the letter dies early
   only when dislikes >= 3 AND dislikes > likes. This logic lives in the
   `receive_letter()` / `like_letter()` / `dislike_letter()` SQL functions
   (migrations 006 + 012, reach removed in 037). A claim is provisional until the app confirms
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

12. Drawings (migration 038): either letter kind may carry a crude crayon
    picture instead of, or alongside, its text. A CHECK enforces that a
    letter has words, a picture, or both — never neither.
    - **Stored as strokes, not pixels** (`drawing jsonb`): points, palette
      index, and nib width, re-rendered client-side with react-native-svg
      (`lib/drawing.ts` for the model and palette, `components/drawing-
      view.tsx` to render, `components/drawing-canvas.tsx` to draw, and
      `components/crayon-path.tsx` for the wax look — a stroke is stroked
      ONCE at the nib width and given its falloff by an SVG filter: a
      Gaussian blur, then a linear alpha remap (`a' = clamp(GAIN*a - CUT)`)
      whose negative offset erases the faint tail so the line stays narrow
      and whose gain restores a solid core. It is stroked twice: the spray
      above, then a much tighter `CORE_*` pass masked through the same tooth
      lifted toward white, because a single mask eats the same fraction of
      wax everywhere and raising alpha in the middle only darkens the specks
      rather than closing the holes. Both passes are Gaussians, so their sum
      stays smooth and no boundary shows where one gives way to the other;
      `CORE_FILL = 0` switches the second pass off and halves the cost. An
      earlier version approximated
      the same falloff by stacking four passes of descending width and
      opacity; four samples of a smooth curve are not a smooth curve, and the
      steps between passes were plainly visible as concentric bands. Blur is
      continuous by construction, so there is no banding to tune away.
      Note that react-native-svg implements only feBlend, feColorMatrix,
      feComposite, feDropShadow, feFlood, feGaussianBlur, feMerge and
      feOffset natively — feTurbulence and feComponentTransfer are TS stubs
      that silently render nothing, so procedural noise and gamma curves are
      not available. Paper tooth is therefore a single tiled mask, tiling in
      canvas space so the grain belongs to the paper and two lines crossing
      the same patch skip the same fibres. The texture
      (`assets/images/crayon-grain.png`) is *generated*, not
      downloaded: `scripts/generate-crayon-grain.mjs` builds it from
      tileable value noise, so it's seamless by construction and carries no
      third-party licence into a store build. Its octaves are deliberately
      coarse — the tile is drawn into ~128 of 320 canvas units, so a lattice
      finer than ~150 cells lands under a pixel per fleck and averages into
      flat grey. Strokes are batched into runs of consecutive same-colour,
      same-nib lines (one blur pass per run, and splitting on colour stops
      the blur bleeding a purple fringe where a red line crosses a blue one),
      and the in-progress stroke filters in its own pass so a touch sample
      never re-blurs the whole drawing. Filter AND mask regions are emitted
      next to the strokes that use them rather than shared from a separate
      component, because a region is a property of the referenced element: a
      shared one has to cover the worst case (the whole canvas), which made a
      short flick allocate the same offscreen buffer as a stroke crossing the
      page. Per-run regions are also why runs stop merging once the union
      bbox gets wasteful (`RUN_MERGE_SLACK`) — batching two far-apart strokes
      would hand them a region spanning both — and why mask regions snap
      outward to a grid (`REGION_QUANTUM`), so the growing live stroke doesn't
      rebuild the mask every touch sample. The grain pattern tiles in absolute
      canvas units, so shrinking a mask region never slides the fibres a
      stroke sits on. Note also that `INK` is folded into the mask rather than
      applied as a third filter primitive: multiplying the mask is exactly
      equivalent to multiplying alpha and costs nothing, where a primitive
      costs a full extra pass over every run. Finally, the EDITOR (and only
      the editor) folds finished strokes down to a bitmap every
      `SNAPSHOT_AFTER` lifts via `Svg.toDataURL()`, so a drag redraws at most
      that many blurred runs however full the picture is; the canvas re-bakes
      the previous bitmap plus the new strokes, making each bake O(1) rather
      than O(strokes). The bitmap is a display cache only — strokes stay
      vectors on the wire, so what gets sent is unaffected. Two traps here,
      both of which wipe the canvas rather than warn: (a) the size passed to
      `toDataURL` is in DIFFERENT UNITS per platform — Android rescales the
      viewBox to the bitmap so it wants device pixels, while iOS renders the
      view at its natural geometry into a `bounds.size` canvas measured in
      POINTS, so passing pixels there strands the drawing in the corner of a
      9MP PNG that fails to decode; (b) the baked strokes must keep being
      drawn as vectors until the bitmap reports `onLoad`, so a bake that
      silently fails costs frame rate instead of the picture. Do not split the
      live stroke into its own stacked `<Svg>` to save more: it would paint
      above all older wax and then drop behind it on release. No
      Storage bucket, no egress, no upload step to half-fail, nothing to
      sweep on expiry. Colours are stored by index, so the palette may be
      re-tinted but never reordered.
    - **The tool set is deliberately crude**: eight colours, three nib sizes,
      undo, clear. No fill, eraser, layers, or zoom — the picture is a
      scribble in the margin, and every added tool makes someone feel their
      drawing isn't good enough to send.
    - **Receiving**: a letter with both is pulled out of the envelope in two
      beats — the written sheet first, then the picture tucked behind it
      (`envelope-letter.tsx`, phases `peekingPicture`/`waitingToPullPicture`/
      `pullingPicture`). A drawing-only letter has no second beat: the
      picture *is* the sheet.
    - **On the map**: cards never render the drawing (it would dominate a
      120px paper square and turn the map into a gallery). They show a
      framed-picture badge with a `+`, and a letter carrying one is always
      openable — even a short letter whose text is fully readable in place.
    - **Moderation**: the keyword gate (rule 9) is blind to a drawing. By
      explicit decision, drawings are governed by the existing report flow
      only — same status flip, same single review queue. No automated
      visual gate, consistent with the no-ML non-goal below.

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