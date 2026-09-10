# noted — Roadmap

Milestones in build order. Each one should leave you with something you can actually run and poke at before moving to the next — nothing here is "big bang." Component names match `system-overview.md`; concrete tools/libraries match `techstack.md`; decisions referenced match `spec.md`.

**Workflow reminder** (full version in `development.md` §4–5): every task below follows goal → code → e2e test — write the acceptance criteria before touching implementation, then a `deno test` or Playwright spec proves it, then it gets checked off and committed. This file tracks milestones; once one is underway, break it into day-to-day tasks in a `TODO.md` at the granularity `development.md` §5 describes.

One naming note before you start: the `notes/` folder in the project directory is reserved for project docs (this roadmap, the spec, the field guide). Give the app's own local-dev vault directory a different name — `vault/` or `.dev-notes/` — so the two never collide.

## M0 — Repo scaffolding ✅ (done 2026-09-05)

- [x] `git init`, `.gitignore` (Deno cache, `.env`, local vault dir)
- [x] `deno.json` — tasks for `dev`/`start`/`test`, compiler options, and the import map (JSR first, `npm:` fallback — `techstack.md`)
- [x] Accept `deno fmt`/`deno lint` defaults, no custom config (`techstack.md`) — one exception: `notes/` excluded (prose docs)
- [x] Pick and create the local dev vault path (not `notes/` — see above) → `./vault`, gitignored
- [x] `main.ts` stub: reads env, starts `Deno.serve`, returns a placeholder response

## M1 — Server core: File Store + Notes API (no linking yet) ✅ (done 2026-09-05)

- [x] Config Loader — `NOTES_DIR`, `PORT`, `AUTH_TOKEN` from env; fail fast at boot if `NOTES_DIR` doesn't exist
- [x] File Store — `readDir`/`readTextFile`/`writeTextFile` wrappers, slugify + collision-suffix logic (atomic writes: temp + rename)
- [x] Frontmatter Parser — parse and serialize the YAML block (spec.md §4); tolerates missing/partial/malformed
- [x] Notes API Handlers — `GET /api/notes`, `GET /api/notes/:filename`, `POST`, `PUT`, `DELETE` (link parsing comes in M3)
- [x] Auth Middleware — single shared token check on every request (length-constant compare)
- [x] HTTP Router — raw `Deno.serve` + a hand-rolled router, no framework (`techstack.md`), wiring all of the above together
- [x] `deno test` covering the full CRUD cycle against a real directory of files — this is the e2e test for this milestone's goal, not a one-off manual `curl` check

**Open decision made here:** auth model (spec.md §11) — shipping the plaintext shared token for the home network; documented in spec.md §11, revisit before wider exposure.

## M2 — Minimal client — v0 done here ✅ (done 2026-09-05)

- [x] Static app shell — native Web Components, served directly as ES modules, no bundler, no framework (`techstack.md`). Authored as plain `.js` + `// @ts-check` (not `.ts`) — decision in `system-overview.md`
- [x] Note List View — fetch `/api/notes`, render the list
- [x] Editor View — plain `<textarea>` bound to save (CodeMirror comes in M4), calls `POST`/`PUT`
- [x] API Client — the one fetch wrapper every view goes through
- [x] Playwright e2e test: create, edit, delete a note from a real browser session, confirm the file on disk matches

**✅ v0 milestone** — the client ↔ server ↔ filesystem loop is proven end to end.

## M3 — Wikilinks & backlinks — the core v1 differentiator ✅ (done 2026-09-06)

- [x] Markdown/Wikilink Parser — `markdown-it` + a custom inline rule; `[[link]]` and `[[link|alias]]`; extraction is tokenizer-based so code is ignored; resolved vs. `unresolved` link styling in the rendered HTML
- [x] In-Memory Index — `NoteIndex`, built at boot; backlink graph + tag map, recomputed on every mutation; `GET /api/notes` now served from it with no disk I/O
- [x] `GET /api/notes/:filename/backlinks` endpoint (with context snippet)
- [x] Backlinks Panel component in the client (`<backlinks-panel>`, under the editor)
- [x] Rename handling — `PATCH /api/notes/:filename`; rewrites incoming filename-form `[[links]]`, 409 on name clash
- [x] Delete handling — dependents' links go `resolved: false`, nothing silently breaks
- [x] `deno test` + Playwright covering: a link resolves, a link stays unresolved until its target exists, a rename rewrites incoming links, a delete flags dependents (16/16 tests green)

## M4 — Real editor ✅ (done 2026-09-06)

- [x] Swap the textarea for CodeMirror 6 + `@codemirror/lang-markdown` — vendored ESM (`public/vendor/codemirror/`, `scripts/vendor-codemirror.ts`) via the `index.html` import map, no bundler
- [x] Inline markdown-syntax de-emphasis — `ViewPlugin` hides marks off the cursor line, dims them on it (spec.md §6)
- [x] Wikilink Autocomplete — `[[` trigger, title-filtered dropdown, "create new note" action (creates the note via `POST /api/notes`)
- [x] Search View + `GET /api/search` + Search Module (`src/search.ts`, pure over an index snapshot)
- [x] Tag Browser — `GET /api/tags`, `GET /api/tags/:tag`, `<tag-browser>`, header nav
- [x] Playwright e2e for the autocomplete flow — trigger, filter, select existing, and the "create new" path (with on-disk assertion). 20/20 tests green.

## M5 — Design system integration ✅ (done 2026-09-10)

Full screen-by-screen and element-by-element target list:
`notes/design-checklist.md` (checked against the mockup bundle in
`notes/mobile-app-design-project/`). This milestone closes out that
checklist's §1 (foundations) and the note-list/search/tag-view/editor rows
of its §2–§3 — the four screens the mockups and the current spec actually
agree are in scope.

- [x] Port the OKLCH token set (spec.md §12; full values in
      `notes/design-checklist.md` §1) into the app's real stylesheet — plain
      CSS custom properties, no preprocessor, no CSS-in-JS (`techstack.md`)
      — done 2026-09-10, straight from `notes/noted-field-guide.html`
- [x] Load Fraunces / Manrope / IBM Plex Mono and assign them by
      jurisdiction (titles / chrome / filenames+metadata — design-checklist
      §1) instead of the current `system-ui` default — done 2026-09-10
- [x] Build the shape system as reusable CSS — done 2026-09-10: mirrored
      squircle icon buttons (alternating odd/even), the notched snippet
      card (alternating which corner), the asymmetric commit pill (flat
      end toward its content). Simplification: alternation is odd/even in
      a flat list, not the mockup's richer per-screen rotation.
- [x] Restyle note list (`1a`: card shape, tag + backlink chip, mono stamp —
      done 2026-09-10, using new `excerpt`/`backlinkCount` fields on
      `NoteSummary`), search (`1d`: pill field + result cards — done; scope
      chips and highlighted match spans still open), tag browser (`1j`: pill
      rows — done; A–Z index and the expander-vs-row-navigates split still
      open)
- [x] Editor (`1c`): format pop-menu (Bold/Italic/Strike/Heading/List/Quote
      grid + Wikilink/Tag/Code pills) and visible undo/redo — done
      2026-09-10, verified end-to-end via a scripted Playwright session.
      Simplification: cells don't reflect the current selection's active
      marks yet (plain actions, not toggle indicators); Snapshot itself is
      still out (blocked on §0)
- [x] Docked bottom bar + FAB on every browsing view (note list, search,
      tags — done 2026-09-10, shared `renderToolbar()`); the editor gets its
      own sticky docked bar instead (Back/Save/Delete)
- [x] Light/dark via `prefers-color-scheme` — done 2026-09-10
- [x] Spot-check contrast against real note content, not just the palette
      swatches — done 2026-09-10 via `scripts/check-contrast.ts` (real
      WCAG 2 ratios, not eyeballing): found and fixed 3 pairs under 4.5:1
      (the tag `#` mark, the "ok" status color, the delete button), every
      other pair already cleared it

**Open decisions to make here** (`design-checklist.md` §0): the mockup bundle
also covers Settings, Version history, an AI edit panel (single + bulk),
and a folder view — none of which has a `spec.md` entry, and the folder
view actively contradicts the §9 non-goal on nested folders. Resolve each
(bring into scope with a real spec section, or explicitly defer) before
M5 is called done, so the milestone doesn't quietly ship 4 of 9 mockup
screens without anyone deciding that was the plan.

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

Also from the mockup bundle (`notes/design-checklist.md` §0), each needing its
own `spec.md` section + milestone before it's buildable, not just a style
pass: a **Settings screen** (vault path, auth token, sync — none of it
wired to anything server-side yet), **note version history / snapshots**
(no versioning API exists), and an **AI edit panel** (single-note and bulk,
propose-then-commit with a diff preview — no LLM integration exists). The
folder view above already covers mockup `1i`/part of `1j`.
