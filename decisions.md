# Decisions — Laiškelis (Letters for Strangers)

A running log of deliberate decisions, each with the reasoning and the
alternative that was rejected. Entries below the "Backfilled" marker were
written from memory on 2026-07-27, while the reasoning was still fresh;
everything after is logged as it happens.

The point of this file is that a finished app shows *what* was built. Only
this shows *why*, and what was considered and thrown away — which is the part
that is impossible to reconstruct later.

---

## Origins

### The product is two borrowed ideas, deliberately combined

**Decision:** Build one app around two mechanics — anonymous letters to random
strangers, and letters pinned to a place on a map — neither of which is
original.

**Why:** Both ideas had been seen elsewhere, executed separately, and neither
gained traction in the form encountered. The bet is not on novelty of concept
but on combination and execution: the two mechanics feed each other (the map is
the public, browsable surface; the pool is the private, intimate one), drawings
add a register text can't reach, and the whole thing is wrapped in an interface
that is warm rather than minimal.

**Rejected:** Chasing an unseen idea. A novel mechanic nobody has tried is
usually untried for a reason, and originality is not what made the earlier
attempts fail — presentation and feel did.

### Bone-on-brick, not minimalism

**Decision:** Warm paper texture, typewriter type, envelope ceremony — a
tactile, slightly nostalgic aesthetic.

**Why:** Minimalism has become the default and nobody actually wants more of
it. Bone on brick is calming and reminiscent of real letter writing, which is
the feeling the whole product is trading on. The aesthetic is not chrome on top
of the mechanic; it *is* the mechanic's argument.

### Lithuania-only, Lithuanian-only

**Decision:** Ship to one country, in one language, with a hard geographic
bound on the map.

**Why:** Three reasons at once, all real. Market: it's where I am and where the
first users are. Safety: a single-language, single-country audience is small
enough for one founder to moderate by hand, which the whole safety model
assumes. Demand: the friends and family who tested it wanted to use it *here,
in our own language* — that was genuine, not politeness.

**Rejected:** Launching internationally. Not on principle — it's a lot of work
for an unmonetized passion project that would then need funds to stay alive.
Possible one day; not a v1 problem.

### Supabase + Expo

**Decision:** Keep the stack inherited from the previous project.

**Why:** Not inertia — I'd pick both again. Supabase is reliable, fair to work
with, and leaves the door open for AI integration later. Expo saves roughly
half the work on any app that isn't gargantuan, and this one isn't.

---

## The distribution mechanic

### Pull-based delivery: the reader asks for a letter

**Decision:** Letters are claimed by readers who press "receive," never pushed
into an inbox.

**Why:** Nothing broke with a push model and nothing was feared — it's simply
that nobody wants letters arriving in their mailbox unbidden in 2026. Nobody
wanted that ten years ago either. Unsolicited arrival is the thing that turned
every inbox into a chore; asking for a letter is what makes receiving one feel
like a gift. (Gmail should be pull-based too.)

**Rejected:** System-assigned delivery into a per-user inbox — the obvious
design, and the reason an inbox, a badge, and an unread count never had to be
built either. One decision removed three features.

### One delivery per hour, per letter

**Decision:** A letter can be claimed by at most one new reader per hour, gated
on `last_delivered_at` so quiet periods never stack into burst-claimable slots.

**Why:** Without pacing, two friends on the same couch drain a letter between
themselves and the third friend never sees it. Pacing keeps letters unique,
limited, and worth waiting for. This is scarcity used for texture rather than
extraction — it slows the pool down, it doesn't pressure anyone.

**Rejected:** Countdown-driven urgency — "open this in 14:59 or it dies." Not
doing that. This is not Ryanair.

### Reach: unlimited, with pacing as the only limiter

**Decision:** A letter's total reach is not capped. Hourly pacing is the sole
constraint on how far it travels; a like extends reach by exactly +1 reader.

**Why:** Pacing already does the work the cap was meant to do — it keeps
letters scarce in *time*, which is the dimension that matters. A hard ceiling on
distinct readers additionally caps how far a genuinely good letter can go,
which is the opposite of the goal.

**Status:** Done — migration 037 drops the trigger, the gating predicate in
`receive_letter()`, the reminder-eligibility predicate, the RLS clause, and the
`recipient_cap` column itself.

**Knock-on effect, accepted:** reach was `recipient_cap + like_count`, so
removing the cap leaves likes with nothing to extend. On pool letters a like is
now a counter, a milestone push, and an Obituary sort key — the same role it
already had on map letters — and carries no distribution power. Distribution
quality control rests entirely on the graveyard vote (dislikes) and on expiry.

### A like buys exactly one more reader

**Decision:** `like_count` extends reach by +1 each, linearly.

**Why:** Simple, legible, and honest — one person liked it, so one more person
gets to see it. `siųsti kitam` means `siųsti kitam`; there's no reason to dress
that up as anything cleverer than it is.

**Rejected:** Multiplicative or compounding reach, where a well-liked letter
accelerates. It's a genuinely good idea that gives strong letters extra chances
— but it only works with a large and constantly active user base. On a small
pool it would create runaway winners and starve everything else. Revisit if the
user base ever justifies it.

### Dislikes are a graveyard vote, with a deliberately high bar

**Decision:** A letter dies early only when `dislikes >= 3 AND dislikes >
likes`.

**Why:** Genuinely thought-provoking content — and its opposite, funny and
post-ironic content — is far more hit-and-miss than universal content. That is
exactly the material this app exists to make thrive. A couple of dislikes for an
odd joke must not be able to kill a letter, so the threshold requires both
volume *and* a losing ratio against likes.

**Rejected:** Symmetric like/dislike weighting, and any form of softened or
fake-counted dislike. Likes stay organic and real; so do dislikes. Fooling the
user about what a button does is not on the table.

**Related:** Map letters have no dislikes at all — they are one-to-one messages
in spirit, not content competing for reach.

### Seven days

**Decision:** Pool letters live seven days. (Map letters live thirty; that
rationale is already in CLAUDE.md — the addressee may not open the app for
weeks.)

**Why:** Unregistered post in real life takes about five working days to
arrive. Seven days is the same order of magnitude, and it makes the app's sense
of time feel like the physical thing it's imitating rather than an arbitrary
product constant.

---

## Safety, moderation, and anonymity

### The Obituary is curated by hand, not filled by expiry

**Decision:** An expired letter reaches the public Obituary only after manual
approval. Expiry alone is never sufficient.

**Why:** An auto-filled feed becomes a rubbish bin — that is what happened to
Facebook, and it happened slowly enough that nobody chose it. The Obituary is
meant to be hand-picked and original, even when what's original is absurd.

**Guard against my own bias:** I am a person and therefore biased, so
highly-liked letters go to the Obituary regardless of my personal opinion of
them. Curation removes noise; it does not get to override the readers.

**Rejected:** Publishing every expired letter (cheap, zero work, and fatal to
the feed's quality).

### Keyword scoring at send time, with the rejection shown to the author

**Decision:** A points-based keyword gate scores the letter on insert; over
threshold, the send is rejected and the author is told, in friendly copy, that
it was.

**Why, points not blocklist:** A few "bad" words sometimes *are* the art. They
can be necessary, and if an author feels that way I'm not the one to stop them.
A binary blocklist can't tell a rough sentence from slur-spam; a sum over
weighted occurrences can.

**Why visible rejection, not shadow-flagging:** Users deserve closure. Everyone
knows the feeling of a post removed without notice, a job application that
simply never answers, a report of something genuinely wrong that vanishes with
no explanation of why it apparently belongs on the platform. Silent moderation
is cheaper for the operator and worse for the person — so the author is told.

**Rejected:** Shadow-banning, silent filtering, and ML/classifier moderation
(explicit non-goal — deterministic scoring plus human review only).

### No GPS. Ever.

**Decision:** No location permission anywhere. Map letters are placed by
deliberately tapping a map, never by reading the device's position.

**Why:** This one has a real cost and is kept anyway — some users would
genuinely appreciate a button that jumps to where they're standing. But it isn't
*necessary*, and a permission you never request is a permission that can never
leak, be subpoenaed, or be repurposed. Don't give me your location; don't give
it to anyone who doesn't really need it. As a side benefit it saves a little
battery and bandwidth.

**Rejected:** "Letters near me," geofenced notifications, location history —
all of which the product would arguably be more engaging with.

### Anonymous to other users, not to the system

**Decision:** Accounts are email + password (Supabase auth, with confirmation).
The email is never shown to anyone, never used for messaging, and never
surfaced in the app; other users only ever see a nickname and a chosen emoji
avatar.

**Why:** Anonymity here is a promise made *between users*, not a claim that the
operator holds no record. An email is the minimum viable recovery channel — a
nickname-only or device-local account means one lost phone equals one destroyed
identity, with no way for the person to prove they were ever that nickname. That
trade was judged worse than the small signup friction and the single stored
address.

**Rejected:** Nickname-only accounts and anonymous device-bound sessions.

**Open gap:** there is no password-reset flow in the sign-in screen, so the
recovery channel this decision was made *for* is currently not reachable by
users. See "Open decisions" below.

### Avatars, added late, on purpose

**Decision:** Users pick an emoji avatar (migration 036).

**Why:** Anonymity should not mean facelessness. I've loved customization since
I was a kid — part of why I was an Android kid — and while the platform loyalty
changed, the taste didn't. You can stay completely anonymous and still be the
person with the little green frog. It makes people more interesting to each
other, and it's whimsical, which the rest of the app is too.

**Tension acknowledged:** this is the one feature that adds identity to a
product built on its absence. The line drawn: an avatar is *chosen and
disposable*, carries no real-world information, and can't be searched or
correlated. It's a costume, not a face.

---

## Calm over sticky

### Push-only, no inbox, no badges, no streaks — but push exists

**Decision:** A small, fixed set of push notifications (like milestones, letter
death, obituary placement, one gentle reminder). No in-app notification centre,
no badges, no digests, no streaks.

**Why:** Addictive app behaviour has moved on from "keep your streak" to sheer
volume — so many channels shouting at once that the user stops wanting the thing
at all. This app should be one a person remembers on their own and opens on
their own volition. An avoidant app, if you like. I genuinely believe in that.

**The strongest argument against, and why it lost:** some of the bombardment is
now *expected*. Users have been trained by it and have learned to sift signal
from clutter; an app that says nothing at all reads as broken rather than calm.
More than one test user explicitly asked for notifications. So they exist — but
only about the user's own letter, never as an invitation to come back and
scroll. The compromise is deliberate, and it's the decision I hold with the
least certainty of any in this file.

**Rejected:** Daily digests, engagement streaks, unread badges, and a
notification inbox (the last one made unnecessary by pull-based delivery
anyway).

### Ceremony is decoration, and decoration is load-bearing

**Decision:** Envelope open/close animations, sounds, and haptics at the
emotional peaks — sending, receiving, liking, dying.

**Why:** It is decoration, and it carries the load of involving the user in the
process. Apps right now are lifeless: the focus on content density and instant
gratification pushed animation, sound, and haptics out entirely, and what's left
is dull. Most people haven't consciously noticed this yet, but nobody actually
prefers it. Ceremony is how a letter feels different from a message.

**Constraint:** every ceremony has a reduced-motion path (accessibility
settings), so the feel is never mandatory.

---

## Drawings

### Strokes, not images

**Decision:** A drawing is stored as the strokes that made it — points,
palette index, nib width — in a `jsonb` column, and re-rendered on the client.

**Why:** A few kilobytes per picture, no Storage bucket and its RLS, no egress
against a free tier that has to stay free, no upload step that can half-fail
between the row insert and the file, nothing orphaned to sweep when a letter
expires, and a picture that stays sharp at any size it's shown. Colours are
stored as palette indices rather than hex, so the crayons can be re-tinted
later without repainting every existing drawing.

**Rejected:** Flattening to a PNG and uploading it. Truer crayon texture is
possible that way, and rendering would be trivial — but it buys texture with
infrastructure, running cost, and failure modes.

### Eight crayons and nothing else

**Decision:** Eight colours, three nib sizes, undo, clear. No eraser, fill,
layers, shapes, or zoom.

**Why:** The picture is meant to be a scribble in the margin of a letter, not
artwork. Every tool added is a tool that makes someone look at their drawing,
decide it isn't good enough, and not send it.

### Drawings are moderated by report only

**Decision:** The send-time keyword gate cannot see a drawing, and nothing
replaces it. A picture goes out — including onto the public map — governed
only by the existing report flow.

**Why:** The alternatives were pre-approving every map drawing by hand (a
review step on a screen that currently posts instantly, and a queue that grows
with the product) or shipping drawings on pool letters only, where one claimed
reader sees them at a time. Reports-only accepts a real exposure window in
exchange for the map staying instant and the moderation load staying flat. It
is also consistent with how map letter *text* already works once past the
keyword gate.

**Known cost, accepted:** an obscene drawing is publicly visible until someone
reports it and a human acts. This is the weakest point in the safety model and
should be the first thing revisited if it's ever abused.

**Rejected:** any automated visual moderation — an ML classifier or a
third-party moderation API. That's an explicit non-goal, and one blind spot
does not justify importing an entire category of tooling the product has
otherwise refused.

## Reversals

Decisions that were made, shipped, and then changed. A decisions log with no
reversals is fiction.

### Likes became toggleable (migration 035)

**Originally:** a like was permanent. The reasoning was that your first
impression is the honest one — if you liked a letter and later cooled on it,
the initial reaction was still real and should stand.

**What changed:** a test user asked for it, and the objection was one I hadn't
considered: people rush to like *before finishing* the letter, and then
something in the remaining text sets them off. That isn't a change of heart
being retracted — it's a reaction that was never fully formed. A second tap now
withdraws the like.

### Map letters weren't planned at all

**Originally:** not in the product. The app was the random pool, full stop.

**What changed:** built as an addition, and it has become the definitive
feature — the one that's actually beautiful to just sit and look at, and the one
with an obvious public surface to show people. Ironic, and worth remembering
the next time a "side" feature seems optional.

### Envelopes didn't look like envelopes

**Originally:** cards that folded through the middle. It resembled nothing,
looked ugly, and I let it slide for longer than I should have before admitting
it wasn't going to do.

**What changed:** rebuilt as an actual envelope ceremony. The lesson is
narrower than "polish matters": a metaphor that only half-lands is worse than no
metaphor, because the user spends the animation trying to work out what they're
looking at.

### Notifications, from none to a few

See "Push-only" above — shipped after test users asked, against the original
intent of total silence.

---

## What success actually means

**Not** downloads, DAU, or session length. Two things, in order:

1. **Strangers talking about it.** The moment discussion leaves the circle of
   people who tried it because they know me, the thing exists on its own.
2. **Two people connecting by accident**, even briefly. I will probably never
   be able to measure this — at most I'd overhear the story — and that's
   acceptable. It's the reason the app exists, not a KPI.

Below those, and honestly: a passion project actually *finished*, and good
enough to show an employer.

**Why DAU was rejected as a North Star:** it measures the exact behaviour the
product is designed not to produce. An app optimising for daily returns would
need the streaks, digests, and badges that were all explicitly refused. Picking
DAU would mean grading the app on how well it failed at its own thesis.

---

## Open decisions

Live questions, recorded so they don't quietly resolve themselves by default.

- **Do likes still earn anything on pool letters?** Since migration 037 they
  no longer affect reach (see "Reach" above). If likes should keep some
  distribution meaning, the lever would be a flat base reach per letter plus
  +1 per like, rather than the old user-count-derived cap.
- **Password reset flow** — email auth exists precisely for recovery, but no
  reset entry point exists in the UI. Currently a forgotten password is an
  unrecoverable account, which defeats the reason the email was collected.
- **International expansion** — deliberately deferred; needs funding before it
  needs engineering.
- **Compounding reach for well-liked letters** — rejected for now, revisit only
  at a much larger active user base.
