# Spec: AI coach handoff, focus timer, shareable pages

Branch: `feat/ai-handoff-focus-timer-share`. Owner of scope: BRAIN. Derrick merges.

## Goal
1. Let any external AI (ChatGPT, Claude, Codex, any MCP client) act as a progress-aware coach
   using openGym data: a copyable "coach skill" prompt, a richer athlete profile, and a
   "Share with ChatGPT / Claude" handoff after every workout that carries context (sleep,
   sickness, pain, time) so the AI asks before it adjusts load.
2. Full-screen, cinematic focus timer for timed exercises (readable from across the room).
3. Share a finished workout or a routine as a polished standalone HTML page, with an
   "Open in ChatGPT / Claude" CTA, the repo link, and a foolproof low-cost self-hosting guide.

## Non-goals
- No new runtime dependencies (CONTRIBUTING: dependency-light is a hard rule).
- No server-hosted public share pages (no new API storage). The page is a self-contained
  HTML file the user shares/downloads.
- No direct Oura/Whoop/Apple Health API integration. The prompt tells the AI to use whatever
  health sources the user already connected to that AI, and the profile records which ones exist.
- No changes to progression engine semantics.

## Decisions
- D1. Athlete profile lives in `S.athlete` (persisted, synced, already flows to MCP via
  `state.js` since MCP reads the whole state): `{ sex, birthYear, heightCm, experience,
  goal, injuries, healthSources: [], notes }`. All optional. Edited in Settings > "AI coach".
- D2. Pure text builders in new `frontend/src/lib/ai-handoff.js` (unit-tested, English output,
  portable like `session-share.js`):
  - `coachSkillText(S)`: the copyable "skill" instructions + athlete profile + current
    working weights / est. 1RM summary + rules (ask before adjusting after an off session,
    keep a memory/progress log, ask missing questions, consider connected health sources,
    realistic loads from logged history, never invent numbers).
  - `sessionHandoffText(S, w, prs, e1prs, context)`: intro line ("Here is my latest openGym
    session...") + `sessionShareText` + comparison vs previous same-routine session
    (volume delta, per-exercise top set delta) + session context flags + instruction to ask
    what happened if performance dropped before changing load, then update memory.
  - `aiDeepLink(provider, text)`: `https://chatgpt.com/?q=` / `https://claude.ai/new?q=`
    with URL-length cap (fallback: open base URL, text already in clipboard).
- D3. Session context: a quick chip row on the finish summary ("Slept badly", "Sick",
  "Pain/injury", "Short on time", "Low energy", "Felt great") + optional free note, stored
  on the workout as `w.context = { flags: [], note }`. Server whitelist must accept it
  (`WORKOUT_FIELDS` in api/server.js) only if MCP workout writes need it; local state is
  written verbatim, so only add to the MCP whitelist if tests require.
- D4. Handoff UX: on FinishSummary, a prominent "Share with ChatGPT" button (OpenAI-styled:
  black pill, OpenAI knot glyph drawn as inline SVG we author, not a copied logo asset) plus
  a secondary "Claude" button (Claude-styled, warm clay color, starburst glyph). Click:
  copy text to clipboard, toast "Copied - paste it in ChatGPT", then open deep link
  (on mobile `window.open` / Capacitor App URL; ChatGPT app catches the universal link).
- D5. Focus timer: new component `components/FocusTimer.jsx`, full-screen overlay driven by
  existing `useUI().work` state (no new timer logic). Exercise name, huge tabular-nums
  countdown, progress ring, Done early / Stop. Opened from the work bar ("expand" button)
  and auto-opened when setting `S.focusTimer` (default true) is on. Respects
  `prefers-reduced-motion`. Uses theme accent.
- D6. Shareable page: new `lib/share-page.js` builds a self-contained HTML string (inline CSS,
  no external requests except CTA links) for a workout or a routine. Sections: hero, stats,
  exercise table, muscles, CTA block (Open in ChatGPT / Claude with prefilled prompt about
  the session/routine), "Run your own openGym" block linking to
  https://github.com/derrick-ships/openGym with deploy guide. Shared via existing
  `shareBlob`/download helpers as `.html`.
- D7. Deploy guide: `docs/DEPLOY_LOW_COST.md` plus the same content summarized in the
  share page and in a copyable "deploy with your AI" prompt. Paths and costs:
  (a) Free: Android APK, no server. (b) ~$0: frontend-only demo on GitHub Pages/Vercel free
  (guest mode, data on device; passkeys/sync need the API). (c) ~$5-8/mo: a small VPS
  (Hetzner CX22 / similar) or Coolify on a VPS with Docker Compose + free domain options +
  Caddy/Cloudflare tunnel for HTTPS. Time estimates per path. Flag every prerequisite
  (GitHub account, domain, card for VPS) up front.
- D8. i18n: every new UI string through `t()`. Add keys to ALL locale files (English value
  as placeholder except `es.js`, which gets real Spanish) so `check-locales.mjs` passes.

## Tickets
- T1 (HANDS, Sol): `lib/ai-handoff.js` + tests. Pure. No UI.
- T2 (HANDS, Sol): `S.athlete` default + Settings "AI coach" section (profile form, health
  sources multi-select, "Copy coach instructions" + Open ChatGPT/Claude), MCP `state.js`
  exposure check + mcp tool `get_athlete_profile` with test. Depends on T1 API.
- T3 (DESIGN, Terra): FinishSummary handoff block: context chips, ChatGPT + Claude branded
  buttons, copy + deep link. Depends on T1.
- T4 (DESIGN, Terra): FocusTimer full-screen + Settings toggle + tests.
- T5 (HANDS, Sol): `lib/share-page.js` + tests, buttons in FinishSummary exports and routine
  editor/plan share, `docs/DEPLOY_LOW_COST.md`.
- Disjoint files: T1 new file only; T4 touches RestTimer/FocusTimer/useStore DEF/Settings
  (timer row only); T5 new lib + plan-share callers. Conflict hotspots (`sheets.jsx`,
  `Settings.jsx`, locales) are serialized: T3 and T5 share `CompletedWorkoutExports`, so T5's
  sheets.jsx edit lands after T3.

## Proof
- `cd frontend && npx vitest run` green, `node scripts/check-locales.mjs` green,
  `node scripts/check-source-strings.mjs --strict` no new misses, `npm run build` ok.
- `cd mcp && npx vitest run`, `cd api && npm test` green.
- Screenshots (light/dark, 390px and 1280px): finish summary handoff, focus timer, share page.
