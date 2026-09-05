# noted — Roadmap

Milestones in build order. Each one should leave you with something you can actually run and poke at before moving to the next — nothing here is "big bang." Component names match `system-overview.md`; concrete tools/libraries match `techstack.md`; decisions referenced match `spec.md`.

**Workflow reminder** (full version in `development.md` §4–5): every task below follows goal → code → e2e test — write the acceptance criteria before touching implementation, then a `deno test` or Playwright spec proves it, then it gets checked off and committed. This file tracks milestones; once one is underway, break it into day-to-day tasks in a `TODO.md` at the granularity `development.md` §5 describes.

One naming note before you start: the `notes/` folder in the project directory is reserved for project docs (this roadmap, the spec, the field guide). Give the app's own local-dev vault directory a different name — `vault/` or `.dev-notes/` — so the two never collide.

## M0 — Repo scaffolding

- [ ] `git init`, `.gitignore` (Deno cache, `.env`, local vault dir)
- [ ] `deno.json` — tasks for `dev`/`start`/`test`, compiler options, and the import map (JSR first, `npm:` fallback — `techstack.md`)
- [ ] Accept `deno fmt`/`deno lint` defaults, no custom config (`techstack.md`)
- [ ] Pick and create the local dev vault path (not `notes/` — see above)
- [ ] `main.ts` stub: reads env, starts `Deno.serve`, returns a placeholder response

## M1 — Server core: File Store + Notes API (no linking yet)

- [ ] Config Loader — `NOTES_DIR`, `PORT`, `AUTH_TOKEN` from env; fail fast at boot if `NOTES_DIR` doesn't exist
- [ ] File Store — `readDir`/`readTextFile`/`writeTextFile` wrappers, slugify + collision-suffix logic
- [ ] Frontmatter Parser — parse and serialize the YAML block (spec.md §4)
- [ ] Notes API Handlers — `GET /api/notes`, `GET /api/notes/:filename`, `POST`, `PUT`, `DELETE` (link parsing comes in M3)
- [ ] Auth Middleware — single shared token check on every request
- [ ] HTTP Router — raw `Deno.serve` + a hand-rolled router, no framework (`techstack.md`), wiring all of the above together
- [ ] `deno test` covering the full CRUD cycle against a real directory of files — this is the e2e test for this milestone's goal, not a one-off manual `curl` check

**Open decision to make here:** auth model (spec.md §11) — a plaintext shared token is fine while this stays on your home network; revisit before it's ever exposed further.

## M2 — Minimal client — v0 done here

- [ ] Static app shell — plain TS + native Web Components, served directly as ES modules via the import map, no bundler, no framework (`techstack.md`)
- [ ] Note List View — fetch `/api/notes`, render the list
- [ ] Editor View — plain `<textarea>` bound to save (CodeMirror comes in M4), calls `POST`/`PUT`
- [ ] API Client — the one fetch wrapper every view goes through
- [ ] Playwright e2e test: create, edit, delete a note from a real browser session, confirm the file on disk matches

**✅ v0 milestone** — the client ↔ server ↔ filesystem loop is proven end to end.

## M3 — Wikilinks & backlinks — the core v1 differentiator

- [ ] Markdown/Wikilink Parser — `markdown-it` (or similar, JSR-first — `techstack.md`) + a custom rule that extracts `[[links]]` from a body and renders resolved vs. unresolved link styling
- [ ] In-Memory Index — build at boot by scanning every file through the parser; maintain the backlink graph and tag map
- [ ] `GET /api/notes/:filename/backlinks` endpoint
- [ ] Backlinks Panel component in the client
- [ ] Rename handling — rewrite incoming `[[links]]` when a file's filename changes (flagged as tricky in spec.md §4)
- [ ] Delete handling — mark dependent notes' links unresolved rather than silently breaking them
- [ ] `deno test` + Playwright covering: a link resolves, a link stays unresolved until its target exists, a rename rewrites incoming links, a delete flags dependents

## M4 — Real editor

- [ ] Swap the textarea for CodeMirror 6 + `@codemirror/lang-markdown`, loaded directly as an ES module (no bundler needed — CodeMirror 6 is clean ESM)
- [ ] Inline markdown-syntax de-emphasis — the "WYSIWYG-ish" styling from spec.md §6
- [ ] Wikilink Autocomplete — `[[` trigger, title-filtered dropdown, "create new note" action
- [ ] Search View + `GET /api/search` + Search Module (naive substring is enough for v1)
- [ ] Tag Browser — `GET /api/tags`, `GET /api/tags/:tag`
- [ ] Playwright e2e test for the autocomplete flow specifically — trigger, filter, select, and the "create new" path

## M5 — Design system integration

- [ ] Port the token set from `noted-field-guide.html` into the app's real stylesheet (spec.md §12 has the exact custom properties) — plain CSS, no preprocessor, no CSS-in-JS (`techstack.md`)
- [ ] Apply tokens to real components: note cards, tag chips, toolbar, FAB — never a hardcoded color/radius
- [ ] Light/dark via `prefers-color-scheme`, same pattern the field guide already models
- [ ] Spot-check contrast against real note content, not just the palette swatches

## M6 — PWA & offline-first — budget real time here, it's the hardest milestone

- [ ] `manifest.webmanifest` + icons + `display: standalone`
- [ ] Service Worker — hand-written, no Workbox (`techstack.md`); precache the app shell, stale-while-revalidate for API GETs, cache-first for static assets
- [ ] IndexedDB Cache — direct IndexedDB, no wrapper library (`techstack.md`); note list + recently-opened bodies
- [ ] Write Queue — durable pending-mutation log, written before any network attempt
- [ ] Sync Manager — drains the queue on reconnect / background-sync event
- [ ] Conflict handling — `updated`-timestamp check on replay; "keep mine / keep server's" UI, not a silent overwrite
- [ ] Playwright e2e test, deliberately: simulate offline → edit a note → reconnect → confirm sync, then force a conflict and confirm the prompt appears

**Open decision to make here:** the conflict-resolution UI (spec.md §11) deserves its own quick design pass before you build it, not just an inline prompt bolted on.

## M7 — Deploy

- [ ] Reverse proxy — Caddy, only if this leaves `localhost` (`techstack.md`), for automatic HTTPS
- [ ] Process supervisor — systemd unit, or a restart-on-crash wrapper if running under Termux
- [ ] Point `NOTES_DIR` at your real notes; settle on a backup strategy (git, or a plain periodic copy)
- [ ] Confirm home-screen install actually works over HTTPS from your phone
- [ ] `deno test` (and the Playwright suite) green locally before this milestone is called done — there's no CI pipeline for a solo project (`techstack.md`), so this check is the gate

## v2 candidates — not scheduled, don't build early

Folders/nested organization, image attachments, a real full-text search index, note templates, git-backed history or export/import. Revisit only once v1 has survived actual daily use — see spec.md §9 for why these are explicitly out of scope for now.
