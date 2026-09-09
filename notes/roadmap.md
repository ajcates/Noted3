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

## M5 — Design system integration

- [x] Read `notes/mobile-app-design-project/project/Noted Design Notes.dc.html` in full before touching CSS — it supersedes/extends the field-guide-only plan below with theory, principles, foundations, an element catalogue, interaction rules, and motion tokens for the nine mocked Android screens in the same folder (`Noted Mobile v1.dc.html`)
- [x] Port foundations from that doc's §3 (colour, type, the shape family, space/density/touch, iconography) into the app's real stylesheet — plain CSS, no preprocessor, no CSS-in-JS (`techstack.md`); this reconciles the "two voices" the doc names — the existing field guide (`noted-field-guide.html`, spec.md §12) and Material 3 Expressive. _Done 2026-09-09:_ full color/radius/font/spacing/motion token set ported into `public/app/styles.css` `:root`, light + dark via `prefers-color-scheme`; the asymmetric-pill/notched-card clip-path details from §3.3 were **not** ported (plain radii only) — still open below.
- [x] Apply tokens to real components: note cards, tag chips, toolbar, FAB — never a hardcoded color/radius. _Done 2026-09-09:_ note list, tag chips (ember container), the masthead/nav, the editor surface, backlinks panel, and search all run on tokens now; `codemirror-setup.js`'s wikilink/quote/list colors were also detokenized (they predated this pass and still had hardcoded hex). No floating FAB exists as a separate component — the one "New note"/"Save" commit button per screen uses the ember asymmetric-pill treatment §3.3 specifies for FABs and commit actions instead.
- [ ] Rebuild the app's existing screens against the element catalogue (§4): masthead ✅; search field ✅ + sort button ❌; section rail + view-mode switcher ❌ (not applicable to the current flat nav — revisit if/when that chrome gets built); snippet card ✅; folder/file row ❌ (v1.1, folders don't exist yet); tag row ✅ + expander ❌; docked bar + primary action ⚠️ (commit-button styling done, no distinct docked bar); editor surface ✅; wikilink autocomplete ✅ (color only — no dedicated popup restyle beyond token colors); format pop menu ❌ (doesn't exist yet — v1.1 territory, §6.1 of spec.md)
- [ ] Wire up the interaction rules (§5) and motion tokens (§6.1) per the specified behaviours (§6.2) — "nothing irreversible" is a stated principle (§1.5), not just a nice-to-have. _Partial:_ motion tokens (spatial-fast/default/slow, effects, exit) are defined and wired to button/chip press+hover states; the fuller interaction-rule pass (§5) is still open.
- [x] Light/dark via `prefers-color-scheme`, same pattern the field guide already models. _Done 2026-09-09_ — verified with Playwright screenshots of note list, editor, backlinks, tags, and search in both schemes.
- [ ] Before calling this milestone done, design the states the notes call out as missing (§7): empty vault / empty tag, index-rebuilding, server-unreachable, sync-conflict banner, keyboard-up editor at its smallest height, sort sheet, long-press note menu, name-this-snapshot sheet
- [x] Spot-check contrast against real note content, not just the palette swatches. _Done 2026-09-09:_ real notes with tags and a wikilink, screenshotted in light + dark via a throwaway Playwright driver (no project skill for running this app existed yet — worth a `/run-skill-generator` pass later).

**Open decision surfaced by the design bundle:** three of the nine mocked screens design features with no home yet in `spec.md`'s v1 scope — undo/redo + Snapshot + Version History (§4.11–4.12, screen 1f), an AI edit panel for one note and for a bulk selection (§4.13–4.14, screens 1g/1h), and a folder-view note list (§4.5, screen 1i — folders are explicitly deferred to v2 in spec.md §9). Decide whether these get their own milestone (see **v2 candidates** below for what's already mocked) or get cut before implementation — don't build them just because they're drawn.

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

**Now also mocked (design only) in `notes/mobile-app-design-project/`:** version history/snapshots and an AI edit panel — single-note and bulk-across-selection (`Noted Design Notes.dc.html` §4.11–4.14, screens 1f/1g/1h of `Noted Mobile v1.dc.html`). A design exists; a spec does not — these need a `spec.md` pass (data model, server endpoints, how "keep mine/keep theirs" interacts with the M6 sync conflict UI) before they're buildable, not just a CSS port.
