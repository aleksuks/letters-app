# Remaining Steps — Letters for Strangers

> Status snapshot taken 2026-07-24, after the 0.2.0 release (map letters).
> Sources: `product-flow.md` (product scope), `CLAUDE.md` (rules/schema),
> `ux-plan.md` (UX phases 1–7). Update this file as items land.

## Where we are

The v1 core described in `product-flow.md` is built and shipped (migrations
001–035, app 0.2.0):

- **Pool letters** — full lifecycle: pull-based claimed distribution with
  hourly pacing and recipient caps, claim/release/reaper, likes (+1 reach),
  graveyard votes, 7-day expiry, Obituary with founder moderation and
  afterlikes.
- **Moderation & safety** — send-time keyword gate, nickname moderation,
  reports on letters/conversations/messages/map letters into one review
  queue (`app/moderation.tsx`), blocking + unblocking, account deletion,
  hosted privacy policy / terms.
- **Chat** — connection requests (both letter kinds), conversations,
  realtime messages, delete-for-me, unread badges, duplicate-conversation
  prevention, leave/block/report controls.
- **Notifications** — outbox + Edge Function (`send-push-notifications`),
  like milestones (pool + map), letter death, obituary placement, gentle
  reminder with per-type settings toggles.
- **Map letters** — Lithuania-bounded WebView map, hotspot clusters,
  readable mini-letters, double-tap likes with milestone pushes, 30-day
  expiry, placement without GPS.
- **UX craft already in place** (ux-plan phases 1, 2, 5 largely done) —
  envelope send/receive ceremonies with sounds and haptics, welcome
  letter, progressive tutorial tips, starter prompts on the write screen,
  empty states, accessibility screen (reduced-motion override, high
  contrast, large touch targets), light/dark themes.

## In flight (uncommitted work — finish first)

1. **Map place search** — `lib/lt-places.ts` + `lib/place-search.ts` +
   search UI in `app/(tabs)/map.tsx` (offline, diacritics-insensitive).
   Appears complete; test on device, then commit.
2. **"Atsiliepti" deep link** — `letterTap` now carries `openRequest` so
   the map mini-letter can jump straight into the request-to-talk sheet on
   `app/map-letter.tsx`. Test both paths.
3. **Toggleable map likes** — migration `035_toggleable_likes.sql`
   (second tap withdraws). Verify it's pushed to the linked Supabase
   project (`supabase migration list`), and that the map UI reflects
   un-liking.
4. **Remove `app/debug-chat-repro.tsx`** — debug screen; don't ship it.
5. Commit the above (CLAUDE.md rule-text change included) and bump to
   0.2.1 if releasing over the air.

## Remaining product/UX work (from `ux-plan.md`)

### Phase 1 — Emotional peaks (one item left)
- [ ] **Death ceremony**: when a letter expires, "My Letters" should show
  a small funeral with honors — "lived 7 days, read by N strangers,
  earned M hearts" — not just a status change. Today the death is only a
  push notification and a row state.

### Phase 3 — Calm engagement (the thesis chapter)
- [ ] **Author feedback loop / journey visualization**: `letters.tsx`
  shows raw counts; add the small journey feel (dots/stops per delivery,
  "your letter met its 10th stranger").
- [ ] **Prompt of the day**: write screen has rotating starter prompts —
  decide whether a distinct daily "today" surface is still wanted or mark
  this done.
- [ ] **Microcopy rationale doc**: the Lithuanian safety/rejection copy
  exists in the app; write the English rationale doc (portfolio artifact).

### Phase 4 — Trust & anonymity legibility
- [ ] Audit every identity-relevant moment for a "what they'll see" note
  (connection request has one; check report, chat entry, obituary).
- [ ] **Closure on reports**: confirm the post-report message says a human
  reviews every report; add if missing.

### Phase 5 — Accessibility (infrastructure done, audits remain)
- [ ] Contrast audit in both themes (incl. high-contrast mode).
- [ ] VoiceOver/TalkBack pass on write → receive → connect at minimum.
- [ ] Map WebView accessibility fallback — the MapLibre canvas is opaque
  to screen readers; provide a list alternative or at least labeled
  controls.

### Phase 6 — Measurement (not started)
- [ ] Define and document the North Star metric (candidates: connections
  accepted/week, letters traveling ≥3 times) and why DAU was rejected.
- [ ] HEART mapping with 1–2 privacy-respecting events each; document
  where the anonymity/analytics line is drawn before adding any
  instrumentation.
- [ ] Run 5 usability tests with Lithuanian speakers on
  write → receive → connect; record findings and ship one change because
  of them.

### Phase 7 — Portfolio packaging (not started)
- [ ] `decisions.md` — running log of deliberate decisions with rejected
  alternatives (start now, backfill the big ones: pull-based
  distribution, no GPS, no unlike→toggleable-like reversal, quiet
  notifications).
- [ ] Case-study doc: problem → constraints → decisions → metrics → next.
- [ ] One-page design principles doc ("Calm over sticky", "Ceremony at
  peaks", "Anonymity you can see").
- [ ] Annotated screenshots (why, not what).

## Remaining ops / launch checklist

- [ ] **Moderation checklist doc** (product-flow §8 explicitly asks for
  it): what gets rejected from the public Obituary even if well-liked —
  identifying info, distress content, harassment, spam.
- [ ] **Founder seed letters**: real launch content for the cold-start
  problem (ux-plan Phase 2) — the current seeds are test data.
- [ ] **Wipe test data before release** (per `TEST_ACCOUNT.md`): test
  account, seeded letters, `scripts_seed_test_tmp.mjs`, and rotate the
  committed test password.
- [ ] **Verify scheduled jobs in production**: pg_cron sweeps
  (`expire_due_letters`, `expire_due_map_letters`,
  `release_stale_claims`) and the outbox-draining Edge Function schedule.
- [ ] **Store release**: EAS production builds, store listings (LT
  screenshots/copy), age rating consistent with the 18+ gate, submit iOS
  + Android.
- [ ] Fill in `README.md` (currently one line) — setup, env vars, how to
  run, how migrations are pushed.

## Suggested order

1. Land the in-flight map work (it's 90% done).
2. Death ceremony + journey visualization — the biggest remaining felt
   gap, and they share the "My Letters" surface.
3. Phase 4/5 audits — cheap, touch existing screens.
4. Ops/launch checklist items as release approaches.
5. Measurement + packaging docs written as you go (start `decisions.md`
   immediately; it's cheapest while decisions are fresh).
