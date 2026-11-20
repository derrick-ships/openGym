# Spec: hosted share pages, brand-true AI buttons

Feedback from Derrick on PR #2:
1. "Share as page" downloads an HTML file. He wants a real public page on the web.
2. That page looks like generic AI output. It has no body map, no exercise GIFs, and no openGym branding or style.
3. The ChatGPT and Claude buttons read the same and have no real logos.

## Decisions
- D1. Public pages live at `https://<instance>/s/<id>`. They are served by the existing SPA: nginx already falls back `/s/*` to index.html. The page is rendered by a lazy `SharePage` view, chosen in `main.jsx` when `location.pathname` starts with `/s/`. The page is built with the app's own design system: index.css tokens, SF font stack, accent, `BodyMap` component, exercise images and GIFs from `/img` and `/gif`. A subdomain was rejected because it needs DNS, TLS and a proxy per deploy. A path on the same origin also works for every self-hoster.
- D2. Shares are immutable snapshots built on the client: `lib/share-snapshot.js`. The server stores them verbatim after validation. Private data is excluded by default: no body weight, no private custom-exercise images (`/api/assets/*`), no user id. The owner display name is opt-in.
- D3. API contract. Node, `api/server.js` plus the new module `api/shares.js`:
  - `POST /api/shares`: session required, CSRF via `csrfOk`. Body `{ kind: 'workout'|'routine', snapshot }`.
    - Returns `201 { id, url: '/s/<id>', createdAt }`.
    - Limits: snapshot JSON ≤ 256 KB, 200 shares per user (oldest is NOT auto-deleted; 409 `share_limit`), 30 creates per user per hour (429).
    - id: 12 chars from a crypto-random base62.
    - Stored at `DATA_DIR/shares/<id>.json` = `{ id, uid, kind, createdAt, snapshot }`, mode 0600, written with `durableAtomicWrite`.
  - `GET /api/shares/<id>`: public, no auth. Returns `{ id, kind, createdAt, snapshot }` and never `uid`.
    - Headers: `Cache-Control: public, max-age=300`, `X-Robots-Tag: noindex`.
    - Responds 404 `{error:'not_found'}` when missing or revoked, 400 for a malformed id.
  - `GET /api/shares`: session. Returns `{ shares: [{ id, kind, title, createdAt }] }`, newest first.
  - `POST /api/shares/revoke`: session + CSRF, body `{ id }`. Deletes only the owner's share and returns `{ ok: true }`. Another user's share or an unknown id returns 404.
- D4. Snapshot schema v1. The server validates, bounds, and rejects unknown top-level keys.
  ```
  { v: 1, kind, title (≤120), subtitle? (≤160), date (YYYY-MM-DD), startedAt?, durationMs?,
    unit: 'kg'|'lb', accent: '#rrggbb', body: 'male'|'female', owner? (≤60),
    stats?: { volume, sets, workSets, prs, durationMs },
    load: { <muscleSlug>: number },             // body-map intensities; slugs ≤ 40 entries
    entries: [ {                                 // ≤ 60
      id (≤120), name (≤120), img? /^[\w.-]{1,120}\.(jpg|jpeg|png|webp)$/, gif? /^[\w.-]{1,120}\.gif$/,
      muscles: [≤12 strings ≤40], scheme? (≤80), restSec?, superset? (≤8 chars), note? (≤300),
      sets: [ { label (≤80), warmup?: bool, pr?: bool } ]   // ≤ 40 per entry
    } ],
    prs?: [ { name (≤120), detail (≤80) } ],    // ≤ 30
    note? (≤500), days?: [≤7 strings ≤20], aiText? (≤6000) }
  ```
  Numbers must be finite, and non-negative where it makes sense. Strings are trimmed and must not contain control characters.
- D5. AI buttons. The official marks come from Simple Icons, path data CC0, kept as tiny inline SVG components in `components/BrandIcons.jsx`. Copy and prompt are tailored per brand:
  - ChatGPT: label "Track it in ChatGPT". The prompt asks it to update its saved memory and progress log.
  - Claude: label "Review it with Claude". The prompt asks it to keep the log in a Project and give a short coach debrief.
  - `ai-handoff.js` gains `providerPrompt(providerId, baseText)`.
- D6. Fallback: in guest mode or the standalone mobile build there is no server. The existing downloadable HTML file stays as "Download page", and the UI says why.

## Tickets
- S1 (HANDS, Sol): `api/shares.js` + routes + node:test + openapi.yaml + SELF_HOSTING note (shares live in data/).
- S2 (DESIGN, Terra): `lib/share-snapshot.js` + tests. `views/SharePage.jsx`: public, cinematic, branded, with body map, GIFs, eased reveal and the AI CTA with real logos. Share flow: create, then copy link or native share, then "Open". Settings: "Shared pages" list with revoke. BrandIcons + tailored AI buttons. i18n with real translations.
