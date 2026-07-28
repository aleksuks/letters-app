# Obituary moderation checklist

> The internal checklist `product-flow.md` §8 asks for: what gets rejected
> from the public Obituary feed **even when it is well-liked**. Written
> 2026-07-28. Single reviewer (the founder) by design — this is a decision
> aid, not multi-moderator tooling.

## Where this sits

Three separate gates exist, and they do different jobs. Confusing them is the
main way a reviewer makes bad calls:

| Gate | When | What it protects |
| --- | --- | --- |
| Keyword score (migration 007) | at send | other *recipients* — blocks slur-spam before delivery |
| Report → status flip | any time | pulls content out of circulation pending review |
| **This checklist** | at expiry | the *public* feed — a permanent, searchable, un-consented surface |

The bar rises at each step, and this is the highest one. A letter that was
fine to send to one stranger is not automatically fine to publish forever.

**Expiry is never sufficient.** `status = expired` only makes a letter
*eligible*; `approved_for_obituary` is a separate, deliberate act (rule 4).
The default is no. A letter you are unsure about stays unapproved — nothing
breaks, the author is simply never sent the Obituary-placement push, and they
were already told the letter died.

## Reject, regardless of hearts

Popularity is not a signal here. A letter can be the most-liked of its week
and still fail every item below — in fact the ones that need rejecting most
are often well-liked, because raw distress and cruelty both travel well.

### 1. Identifying information

Anyone reading the Obituary should not be able to work out who the letter is
about. Reject if it contains, about the author or anyone else:

- Full names, or a first name plus anything narrowing (school, workplace,
  street, team, band, small town).
- Contact of any kind — phone, email, social handles, usernames. The app
  never collects these (rule 8); a letter containing one is the one place
  they can leak.
- A specific address, workplace, or a habitual location precise enough to
  wait at.
- Enough combined detail that a small circle would recognise the subject.
  Lithuania is 2.8M people — "the red-haired barista at the place by the
  bridge in Kėdainiai" is an identification, not a description.

Rule of thumb: could the person being written about recognise themselves *and*
could a third party? The first alone is fine and often the point. Both
together is a rejection.

### 2. Distress that needs a different response

Some letters should be answered, not published. Reject anything expressing
suicidal intent, self-harm, or acute crisis — **and treat the review as the
moment to check whether the author is reachable**, not just as a filing task.

Publishing these does three harmful things at once: it puts crisis content in
front of readers who did not opt into it, it can read as validation of the
act, and it turns a person's worst day into public content they never agreed
to make public. Vague expressions of despair, grief, or loneliness are the
substance of this app and are *not* in this category — the line is intent and
immediacy, not sadness.

If a letter suggests immediate danger, the response is a human one first
(reach out through the connection flow if any route exists) and a moderation
one second. Nothing in the schema makes this automatic; it is a judgment call
that belongs to a person.

### 3. Harassment and cruelty

- Any letter aimed *at* an identifiable person rather than *about* an
  experience.
- Slurs and hate content that scored under the keyword threshold. The gate is
  points-based and deliberately permissive so genuine letters with rough
  language get through (rule 9) — it is not the last word, and the Obituary
  bar is higher than the delivery bar.
- Threats, intimidation, or content that reads as a warning to a specific
  person.
- Sexual content involving minors, or any sexualisation of someone
  identifiable — immediate rejection *and* an account action, not just a
  withheld approval.

### 4. Spam and off-purpose content

- Advertising, promotion, link-dropping, referral or invite codes.
- Attempts to move the conversation to another platform. The whole safety
  model — blocking, reporting, no contact details — evaporates the moment a
  conversation leaves the app, so a letter engineering that exit is rejected
  even when it looks harmless.
- Tests, keyboard mashing, and letters that are only a nickname or a
  greeting. Not harmful, just not worth a permanent public slot.
- Content that is not a letter to anyone: copypasta, song lyrics, chain
  messages.

### 5. Drawings

The keyword gate is blind to drawings by explicit decision (rule 12), so the
Obituary review is the **only** gate a drawing-only letter ever passes
through. Look at the picture, not just the body text. Everything above applies
to what is drawn: an identifying likeness, a phone number in crayon, a slur
spelled out, or explicit content are all rejections on the same terms.

## Approve

Everything else. The default posture for a letter that has run its seven days
and breaks none of the above is **yes** — the Obituary is meant to feel
inhabited, and a feed curated to blandness defeats the point of the product.
Sadness, anger, regret, bad spelling, unresolved endings, and letters to
people who will never read them are all exactly what this feed is for.

## Operating notes

- **Act on reports within 24 hours.** This is a commitment made in the store
  review notes (`store-release.md` §6), so it is a promise to Apple and Google
  as well as to users.
- **Reject is not delete.** Withholding Obituary approval leaves the letter
  expired and private; a report flips status but keeps the row, so a bad-faith
  report is reversible (rule 6). Neither is destructive, which is why erring
  toward caution costs almost nothing.
- **Record the reason** when rejecting something borderline. There is one
  reviewer today, but a consistent line is only visible in hindsight if the
  calls were written down, and this doc is meant to be revised from real
  cases rather than stay theoretical.
- **The keyword list is data, not code** — founder-maintained through the
  Supabase dashboard, unreadable from the app so it cannot be mined for
  evasion. When a letter reaches this checklist that the gate should plausibly
  have caught, that is a signal to add a term, not to lower the Obituary bar.
