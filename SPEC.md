# Letters for Strangers ("Laiškelis") — Spec

> This file previously held the spec of the micro-learning app this repo
> was repurposed from; that content is gone along with the product.

The product is an anonymous-ish letter-sharing app for a Lithuanian
audience, with two letter kinds:

1. **Pool letters** — written to no one in particular, dealt at random to
   strangers, traveling further when liked, dying after 7 days into a
   public, pre-moderated "Obituary" leaderboard.
2. **Map letters** — pinned to a chosen spot on a Lithuania-only map,
   addressed to someone the author encountered there, living 30 days.
   Hotspot clusters when zoomed out, floating letter squares when zoomed
   in.

Both kinds share the request-to-talk → private nickname chat flow, the
send-time keyword moderation gate, and a single founder-reviewed report
queue.

The authoritative documents are:

- `product-flow.md` — full product flow, screen by screen, plus explicit
  v1 non-goals.
- `CLAUDE.md` — target schema, core business rules (distribution
  mechanics, moderation, notifications, privacy rails), and engineering
  conventions.
- `ux-plan.md` — UX craft plan and the reasoning behind the emotional
  design choices.
- `remaining-steps.md` — current status snapshot and the list of
  remaining work, phase by phase.

## Tech stack

- **Frontend:** React Native with Expo (TypeScript), Expo Router
- **Backend:** Supabase (auth, Postgres with RLS + SQL functions,
  realtime for chat), Expo push notifications via an Edge Function
- **Map:** MapLibre GL JS in a WebView (`lib/map-html.ts`), vector tiles
  from OpenFreeMap — no native map SDK, no API keys, works in Expo Go and
  EAS builds alike
