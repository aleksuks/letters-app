# Remaining Steps — Letters for Strangers

> Status snapshot taken 2026-07-24, after the 0.2.0 release (map letters);
> refreshed 2026-07-28 after 0.3.0 (drawings, flight tracker, graves) and the
> release-identity pass.
> Sources: `product-flow.md` (product scope), `CLAUDE.md` (rules/schema),
> `ux-plan.md` (UX phases 1–7). Update this file as items land.

## Where we are

The v1 core described in `product-flow.md` is built and shipped (migrations
001–038, app 0.3.0):

- **Pool letters** — full lifecycle: pull-based claimed distribution paced at
  one delivery per hour with no reach ceiling (migration 037 dropped
  `recipient_cap`), claim/release/reaper, likes as a pure counter,
  graveyard votes, 7-day expiry, Obituary with founder moderation and
  afterlikes.
- **Drawings** (migration 038) — crayon canvas on both letter kinds, stored
  as strokes and re-rendered client-side; a letter needs words, a picture,
  or both.
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

All five items from the 07-24 snapshot landed in 0.3.0 (map place search,
the "Atsiliepti" deep link, toggleable map likes, and the debug screen is
gone). What's uncommitted now:

1. **Per-letter heart breakdown** in `app/(tabs)/letters.tsx` — splits
   in-flight hearts from afterlikes, matching the Obituary card. Test, then
   commit.
2. **Migration `039_push_dispatch_timeout.sql`** — staged, not pushed.
   Raises the push-dispatch cron call's pg_net timeout from the 5s default
   to 20s so a cold-started Edge Function doesn't log a false failure.
   `npx supabase db push` when ready.

## Remaining product/UX work (from `ux-plan.md`)

### Phase 1 — Emotional peaks (done)
- [x] **Death ceremony** — shipped in 0.3.0 as `app/letter-grave.tsx`
  (headstone with lifespan, readers, hearts).

### Phase 3 — Calm engagement (the thesis chapter)
- [x] **Author feedback loop / journey visualization** — shipped in 0.3.0
  as `app/letter-flight.tsx` (the letter's route between strangers).
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

### Phase 7 — Portfolio packaging (started)
- [~] `decisions.md` — running log of deliberate decisions with rejected
  alternatives. Started 07-28 and ~420 lines in; keep backfilling the big
  ones (pull-based distribution, no GPS, no unlike→toggleable-like
  reversal, quiet notifications) while the reasoning is still fresh.
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
  account, seeded letters, and rotate the committed test password. A
  separate reviewer demo account is needed afterwards — see
  `docs/store-release.md` §5.
- [x] **Verify scheduled jobs in production** — checked 2026-07-28: all four
  pg_cron jobs (`letters-lifecycle-sweep`, `push-notifications-dispatch`,
  and the two reminder enqueues) are active with zero failed runs over 7
  days. The dispatch call's 5s pg_net timeout is addressed by staged
  migration 039.
- [x] **Release identity** — settled 07-28: scheme `laiskelis`, package and
  bundle id `lt.laiskelis.app`, `eas.json` production/submit profiles added.
  One follow-up outside the repo: add `laiskelis://auth/callback` to the
  Supabase Auth redirect allowlist before the next build.
- [ ] **Store release — both stores** (see `docs/store-release.md`). Android
  first only because Play's 14-day closed-test clock is the long pole; Apple
  work runs beside it, not after it. Play: account, first manual AAB upload,
  12 testers. Apple: Developer Program, App Store Connect record, then the
  three values that fill in the iOS submit block. `supportsTablet` is now
  false and export compliance is pre-answered, so no iPad screenshots and no
  per-build encryption question.
- [x] Fill in `README.md` — setup, env vars, migrations, edge functions,
  cron, layout.

## Suggested order (revised 2026-07-28)

The 14-day Play closed-test clock is the only thing here that cannot be
compressed, so it goes first and everything else runs beside it.

1. ~~Decide the package/bundle id~~ — done 07-28, `lt.laiskelis.app`.
2. **Start the Play clock**: developer account, first manual AAB upload,
   recruit 12 testers. Wipe test data and write the founder seed letters
   before those testers see the app.
3. Phase 4/5 audits — cheap, touch existing screens, and they fit in the two
   weeks the clock is running.
4. Measurement + packaging docs written as you go; keep backfilling
   `decisions.md` while the reasoning is fresh.
5. iOS in parallel, not after — Apple Developer Program and the App Store
   Connect record can be set up while the Play clock runs, and TestFlight has
   no minimum-tester gate of its own.
