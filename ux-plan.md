# UX Excellence Plan — Letters for Strangers

> Goal: make this app a textbook example of UX/product craft, suitable as a
> portfolio piece for UX/product manager roles. Drafted 2026-07-03.

## The framing that makes this a portfolio piece

For a UX/PM role, a beautiful app proves craft; a **documented set of
deliberate decisions with reasoning and measurement** proves you're a product
thinker. Hiring managers can't tell polished-by-taste from polished-by-method
unless you show the method. So the plan below has two tracks: design choices
in the app, and the artifacts that prove they were choices.

This app also has a rare built-in angle: its whole premise (anonymity,
scarcity, no notifications, no streaks) is **anti-dark-pattern by design**.
"Engagement without manipulation" is a genuinely textbook-worthy thesis right
now — lean into it rather than bolting on standard growth mechanics that
would contradict it.

## Phase 1 — Emotional peaks (peak–end rule)

Design the three moments users will remember, since memory of an experience
is dominated by its peak and its ending:

1. **Sending = a ritual of letting go.** The folding-letter animation is the
   right instinct — extend it into a full send ceremony (fold, seal, release)
   with haptics. The user should feel they *gave something away*, not
   submitted a form.
2. **Receiving = unsealing, not loading.** Never show a spinner on the
   receive screen. Make retrieval an envelope-opening interaction (even a
   tap-to-break-the-seal gesture) so latency becomes anticipation. This is
   the app's variable-reward moment — it already has slot-machine psychology
   built in ethically (random letter, capped pace), so invest the most craft
   here.
3. **Death = ceremony.** When a user's letter expires and enters the
   Obituary, that's a peak: "Your letter lived 7 days, was read by 14
   strangers, and earned 9 hearts." A letter's death should feel like a small
   funeral with honors, not a status change.

## Phase 2 — First-run experience and the cold-start problem

- **Show the magic before asking for work.** A new user in an empty pool hits
  a dead product. Seed the pool with real founder-written letters so the very
  first "Receive" always delivers something moving within 30 seconds of
  signup. Solving cold-start is a classic PM interview topic — document it.
- **Progressive disclosure onboarding:** teach one mechanic per moment it's
  needed (explain "travel" the first time a letter is liked, explain the
  Obituary the first time one of theirs dies), not a slide deck upfront.
- **Empty states as narrative.** Every empty state should teach the mechanic
  and give one action in the product's voice: "The pool is quiet tonight.
  Someone out there is waiting to read *your* letter." Empty states are where
  UX judgment is most visible to reviewers.

## Phase 3 — Calm engagement (the thesis chapter)

- **Reframe the 1-hour pacing as a feature in the UI.** When no letter is
  available: "A new letter will be looking for a reader soon — come back this
  evening." Scarcity honestly presented builds ritual; document this as a
  deliberate alternative to infinite feeds.
- **A daily rhythm, not a streak.** No guilt mechanics, no streak counters.
  Instead, a gentle "today" surface: one prompt of the day on the write
  screen, rotating.
- **Author feedback loop.** "My Letters" should make the author feel the
  letter traveling: a small journey visualization (dots/stops per delivery),
  milestones ("your letter met its 10th stranger"). This is the retention
  loop — reward writing with evidence of being heard.
- **Microcopy as a first-class deliverable.** The decline message ("they're
  not ready to chat"), the moderation rejection, the report confirmation —
  write these with care in Lithuanian and keep an English rationale doc.
  Compassionate microcopy in rejection/safety moments is exactly what UX
  portfolios showcase.

## Phase 4 — Trust, safety, and anonymity legibility

- **Make anonymity legible:** a small "what they can see" note wherever
  identity matters (before sending a connection request: "They'll see your
  nickname and greeting — nothing else"). Users trusting the system because
  it *shows* its rules is strong UX writing material.
- **Closure on reports:** after reporting, tell the user what happens next
  ("a human reviews every report"). Safety features that feel abandoned erode
  trust.

## Phase 5 — Accessibility (non-negotiable for "textbook")

- Honor reduced-motion settings
  (`AccessibilityInfo.isReduceMotionEnabled` in React Native) — the app has
  heavy animation, so this is the first thing an expert reviewer will check.
- Dynamic type support, 44pt touch targets, contrast audit in both themes,
  screen-reader labels on every interactive element (VoiceOver pass on the
  receive/write flows at minimum).
- When sound is added later: always redundant with visuals, respect silent
  mode, off by default or first-launch choice.

## Phase 6 — Measurement (what makes you a PM, not just a designer)

- **Define a North Star metric** — candidates: *connections accepted per
  week* or *letters that travel ≥3 times*, since both mean "something true
  reached someone." Document why DAU was rejected.
- **HEART framework mapping** (Happiness, Engagement, Adoption, Retention,
  Task success) with 1–2 privacy-respecting instrumented events each.
  Anonymous product + analytics is an interesting tension — write down where
  the line was drawn.
- **Run 5 usability tests** (Nielsen's classic n=5) with Lithuanian speakers
  on the write→receive→connect path; record findings and one iteration made
  because of them. A single documented test-driven change is worth more in
  interviews than ten polished screens.

## Phase 7 — Portfolio packaging

- A case-study doc in the repo: problem → constraints (safety model, single
  moderator, no notifications) → key decisions with rejected alternatives →
  metrics → what to do next.
- A one-page **design principles** doc ("Calm over sticky," "Ceremony at
  peaks," "Anonymity you can see") — principles docs read as senior-level
  thinking.
- Annotated screenshots showing *why*, not what.

## Suggested order

Phase 2 (first-run + empty states) and Phase 5 (accessibility) first — cheap,
high-impact, and they touch every screen. Then Phase 1 ceremonies, Phase 3
feedback loops, Phase 6 instrumentation, and packaging last, written as you
go in a running `decisions.md`.

## Addendum (2026-07-22) — Map letters

The map tab ("Žemėlapis", added with migration 031) extends the same
design stance to a second surface:

- **The map is a place, not a feed.** Letters appear as floating paper
  squares at street level and warm hotspot circles from afar — browsing is
  spatial wandering, not scrolling. No sorting, no ranking, no counts
  beyond the cluster number.
- **Ceremony carries over.** Placing a letter reuses the fold-and-release
  send ritual; the wax-seal pin drop marks the spot before writing.
- **Calm carries over.** Likes exist (something funny or honest deserves
  a nod) but never rank anything — no leaderboard, no reach. A liked
  square wears a tiny heart and a well-loved one glows, and the author
  gets the same quiet milestone push as pool letters — but a map letter's
  death is silent, and nothing else about it ever pings anyone. The only
  "growth loop" is the human one (recognizing yourself in a letter and
  answering).
- **Privacy you can see.** The app never asks for location permission —
  placement is a deliberate tap. This is worth calling out explicitly in
  the case study: a map feature with zero GPS is a strong example of
  drawing the anonymity line deliberately.
