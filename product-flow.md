# Letters for Strangers (working title) — Product Flow & Description

## Concept
A Lithuania-local anonymous letter-sharing app. Users write letters that get
released to a random stranger. If the recipient likes it, the letter travels
on to another stranger. Letters "die" after one week, retiring to a public
leaderboard ("the obituary") of the most-liked and most-traveled letters.
Recipients can optionally request to connect with the original author; if
the author agrees, a private in-app conversation opens under their nicknames.

Core emotional premise: a safe, low-friction way to say something true to a
stranger, with an optional door to real connection if both sides want it.

## User flow

### 1. Onboarding
- Open app, no email required friction beyond minimal auth (see schema doc).
- Age checkbox: "I confirm I am 18 or older" — required to proceed.
- Choose a nickname (unique, editable later, no real-name requirement).
- Land on home screen.

### 2. Writing a letter
- Tap "Write a letter."
- Free-text composition, lightly prompted (optional starter prompts, not
  required) — e.g. "Something I've never told anyone," "A good day,"
  "Something I'm scared of." Prompts are a soft nudge, not a gate.
- Submit. The letter first passes a keyword scoring gate (see Moderation
  below): if its offensive-language score crosses the reject threshold,
  it never enters the pool and the author sees a warning explaining a few
  rough words are fine but this letter won't fly — rewrite and resend.
- Otherwise the letter enters the pool, anonymous, tagged with author's
  internal user ID (not shown to recipients) and nickname (shown to
  recipients).
- Author sees their own letter in "My Letters" with a live like count and
  travel count, no identity of likers/readers shown.

### 3. Receiving a letter
- Recipient opens "Receive a letter" — gets one random eligible letter
  (not previously seen by them, not their own, not expired, and with a free
  delivery slot — see lifecycle below).
- Reads it. Can:
  - Like it → like count increments and the letter's total reach extends by
    exactly one more reader.
  - Dislike it ("to the graveyard") → records a graveyard vote; the letter
    dies early only if at least 3 readers vote it out AND gravestone votes
    outnumber hearts. A single dislike never kills a letter.
  - Do nothing → letter just sits read, no action.
  - Request to talk → see flow below.
  - Report → flags letter for review, removes it from further circulation
    pending the author's manual check.

### 4. Letter lifecycle
- Distribution is pull-based, first-come-first-served: nothing is ever
  pushed to a specific user, so inactive accounts never strand a letter.
  "Your letter went to a stranger" stays true as presented copy — each
  delivery goes to whoever claims it next.
- A letter starts with a claim cap of ceil(total users / 16) distinct
  readers, frozen at send time. No minimum floor — scarcity is intentional.
- Pacing: at most one delivery per hour. The first claim is available
  immediately at send; each next slot unlocks 1 hour after the previous
  delivery, so bursts of simultaneous online users can't drain a letter's
  reach in minutes.
- Each like extends total reach by +1 reader (still hourly-paced). There is
  no travel ceiling — expiry and the dislike vote are the only stoppers.
- Each letter has a 7-day lifespan from creation.
- At 7 days (or on a successful graveyard vote), the letter "dies" — no
  longer distributed to new readers.
- Dead letters with likes above a threshold (or simply the top N by likes/
  travels) appear in the public "Obituary" feed on the main screen.
- Obituary entries are anonymous by nickname only, never reveal recipient
  identities, never reveal report/moderation history.

### 5. Main screen
- Tabs or sort toggle: "Recent" / "Most liked" — surfaces obituary (expired)
  letters only, all of which have passed manual moderation review (see
  below) before being eligible to display publicly.
- Active (still-alive) letters are never shown on the public main screen —
  only in the private write/receive flow. This keeps the public surface
  small and pre-moderated.

### 6. Connection requests
- From a received letter, recipient can tap "Request to talk," write a
  short greeting message, and send.
- Author receives the request (greeting + recipient's nickname) and can
  Accept or Decline.
- Decline: nothing happens, recipient is not notified of the decline
  beyond a generic "they're not ready to chat" or similar soft message —
  no confirmation that specifically discourages future requests.
- Accept: a private in-app conversation opens between the two nicknames.
- The app never collects or requests phone numbers, social handles, or
  other contact info — if users choose to exchange that themselves inside
  the chat, that's on them, but the product never asks for or stores it.

### 7. In-chat safety controls
- Every conversation has, at minimum: Delete (remove for me), Leave/Remove
  conversation (ends it for both), Block (prevents future requests/messages
  from that user), and Report (flags conversation for the founder to
  review).
- Reports route to a manual review queue (just the founder, for v1).

### 8. Moderation (v1: keyword gate at send + manual review)
- Automated layer: a points-based keyword gate runs server-side when a
  letter is sent (migration 007). Each keyword on a founder-maintained
  list carries a severity weight; every occurrence adds points. Matching
  is evasion-resistant (case, Lithuanian diacritics, leet speak like
  f4gg0t, stretched letters, dot/space-separated spelling) and
  prefix-based by default so one stem covers Lithuanian case endings.
  Only letters whose total crosses a threshold are refused — a genuine
  letter with some profanity travels as usual; a letter that is nothing
  but repeated slurs is scrapped with a warning to the author. The list
  lives in the database, invisible to clients, and weights/thresholds are
  explicit tuning knobs.
- All letters before becoming obituary-eligible (i.e. before they can ever
  appear on the public main screen) are reviewed by the founder.
- Reported letters/conversations are pulled from circulation immediately
  pending review (report = soft removal, not permanent deletion, in case
  it's a bad-faith report).
- No ML/NLP moderation in v1 — the keyword gate above is the only
  automated layer; everything subtler stays with manual review,
  intentional given expected early volume.
- Document a simple internal checklist for what gets rejected from the
  public obituary feed even if well-liked (identifying info, distress
  content that needs a different response, harassment, spam).

## What v1 deliberately excludes
- No push notifications (maybe later).
- No public profiles beyond nickname.
- No algorithmic recommendation/mood-matching (that's the bigger future
  idea, not this one).
- No in-app contact info collection.
- No moderation team — single founder review only, appropriate at
  expected v1 scale.

## Future direction (not v1)
- If this validates with real usage: explore folding in prompt-based
  structured entries, mood tracking, and curated "you are not alone"
  surfacing — the original bigger concept — but only after this smaller,
  lower-risk version has proven the core mechanic (strangers sharing
  something real) actually resonates.
