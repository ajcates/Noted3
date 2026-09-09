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
- [ ] Wire up the interaction rules (§5) and motion tokens (§6.1) per the specified behaviours (§6.2) — "nothing irreversible" is a stated principle (§1.5), not just a nice-to-have. _Partial, reviewed 2026-09-09:_ read all of §5 and §6.2 — nearly every specified behaviour (format menu, sort sheet, AI panel, folder drill-in, tag expander, version timeline, sync dots, keyboard-IME tracking) belongs to chrome that doesn't exist in this app yet (mostly v1.1). Of what's actually buildable now: **Press** (§6.2) is done properly — scale 0.96 + one-surface-step-brighter (or a brightness dip for filled ember/error buttons, since those aren't on the surface ladder) over 100ms in, releasing on spatial-fast; each button variant (`.primary`/`.delete`/`.tag-chip`) got its own explicit `:active` rule after finding that the generic `button:active` rule was cascading over them by specificity tie, silently showing the wrong press color. **Search** (§6.2) got its 120ms results crossfade (a fade-in on each row, since the list fully replaces with no old/new pair to interpolate between). `prefers-reduced-motion` now also zeroes `animation-duration`, not just `transition-duration` — the new keyframe fade needed it too. Re-open this item once more of the catalogue's chrome actually gets built.
- [x] Light/dark via `prefers-color-scheme`, same pattern the field guide already models. _Done 2026-09-09_ — verified with Playwright screenshots of note list, editor, backlinks, tags, and search in both schemes.
- [ ] Before calling this milestone done, design the states the notes call out as missing (§7): empty vault / empty tag ⚠️ (see below — a CSS-only placeholder, not the real design pass §7 asks for), index-rebuilding ❌, server-unreachable ❌, sync-conflict banner ❌, keyboard-up editor at its smallest height ❌, sort sheet ❌, long-press note menu ❌, name-this-snapshot sheet ❌ (the eight ❌ items all belong to features — sync, AI, folders/sort, snapshots — that don't exist yet; this stays open until they're built or someone does the real design pass ahead of that). _2026-09-09:_ gave empty note-list/tags/search a token-styled quiet dashed card + Fraunces-italic message instead of bare gray text — real content now, not just a design placeholder, but still just a plain-CSS stand-in for whatever the actual empty-state design turns out to be.
- [x] Spot-check contrast against real note content, not just the palette swatches. _Done 2026-09-09:_ real notes with tags and a wikilink, screenshotted in light + dark via a throwaway Playwright driver (no project skill for running this app existed yet — worth a `/run-skill-generator` pass later).

**Open decision surfaced by the design bundle:** three of the nine mocked screens design features that were v1 non-goals — undo/redo + Snapshot + Version History (§4.11–4.12, screen 1f), an AI edit panel for one note and for a bulk selection (§4.13–4.14, screens 1g/1h), and a folder-view note list (§4.5, screen 1i). `spec.md` now fully specs all three as v1.1 (§4.1–§4.2, §5.1–§5.2, §6.1–§6.3) and **M8** below positions them in build order — but scoping them isn't the same as deciding to build them. That decision — go, or cut and leave the design as reference-only — is still open.

## M6 — PWA & offline-first — budget real time here, it's the hardest milestone

**Resolved ahead of time (2026-09-09), so M6 doesn't inherit them — see `ISSUES.md` Closed for detail:**

- ~~Fonts won't survive real offline use~~ — `scripts/vendor-fonts.ts` now vendors Fraunces/Manrope/IBM Plex Mono into `public/vendor/fonts/` (latin subset), `index.html` links a local `fonts.css`. Zero runtime CDN dependency, verified. The Service Worker's precache list (below) should include these files.
- ~~Auth token was in `localStorage`, unreachable from a Service Worker~~ — moved to IndexedDB (`public/app/token-store.js`). This only fixes *where the token lives*, not *who does the authenticated fetch* — that part is still open, immediately below.

**Still resolve before writing the Write Queue/Sync Manager:**

- **Where does the authenticated retry actually run?** `system-overview.md`'s "Reconnecting" flow reads "Service Worker's `sync` event fires → Sync Manager drains the Write Queue." Now that the token is in IndexedDB, the SW *can* read it — but decide deliberately whether it should: (a) the SW does the drain itself (works even if no tab is open — the actual point of Background Sync), or (b) the SW's `sync` event only wakes a page context (`clients.matchAll`/postMessage) and the fetch stays page-side (simpler, but sync silently doesn't happen with the app fully closed). Pick one before building the Write Queue — it changes what the drain function is allowed to assume about its execution context. See `ISSUES.md` (2026-09-09, Open).

- [ ] `manifest.webmanifest` + icons + `display: standalone`
- [ ] Service Worker — hand-written, no Workbox (`techstack.md`); precache the app shell (including `public/vendor/fonts/`), stale-while-revalidate for API GETs, cache-first for static assets
- [ ] IndexedDB Cache — direct IndexedDB, no wrapper library (`techstack.md`); note list + recently-opened bodies
- [ ] Write Queue — durable pending-mutation log, written before any network attempt
- [ ] Sync Manager — drains the queue on reconnect / background-sync event
- [ ] Conflict handling — `updated`-timestamp check on replay; "keep mine / keep server's" UI, not a silent overwrite
- [ ] Playwright e2e test, deliberately: simulate offline → edit a note → reconnect → confirm sync, then force a conflict and confirm the prompt appears

**Open decision to make here:** the conflict-resolution UI (spec.md §11) deserves its own quick design pass before you build it, not just an inline prompt bolted on.

**Also worth a glance before this milestone:** the In-Memory Index has no file watcher (`ISSUES.md`, 2026-09-06) — fine for a single client, but M6 is explicitly building for multiple devices writing to the same vault while one was offline, which is exactly the scenario that makes index staleness more likely to actually bite. Not a blocker, just don't be surprised by it.

## M7 — Deploy

- [ ] Reverse proxy — Caddy, only if this leaves `localhost` (`techstack.md`), for automatic HTTPS
- [ ] Process supervisor — systemd unit, or a restart-on-crash wrapper if running under Termux
- [ ] Confirm home-screen install actually works over HTTPS from your phone, and confirm offline (M6) actually holds up over a real network — do this against the dev vault first
- [ ] Point `NOTES_DIR` at your real notes only once the above is confirmed working; settle on a backup strategy (git, or a plain periodic copy) — pointing at real data before the deploy is proven is more risk than the extra round trip costs
- [ ] `deno test` (and the Playwright suite) green locally before this milestone is called done — there's no CI pipeline for a solo project (`techstack.md`), so this check is the gate

**This completes v1** (spec.md §10) — wikilinks, backlinks, tags, search, the real editor, the design system, offline-first, and a real deployment. M8 below is scoped, not scheduled: don't start it as a continuation of momentum out of M7 without deciding to.

## M8 — v1.1: folders, version history, AI edit panels — not scheduled, needs a go/no-go first

Fully specced (`spec.md` §4.1–§4.2, §5.1–§5.2, §6.1–§6.3, added 2026-09-09) from the mobile design bundle in `notes/mobile-app-design-project/`, but this is a real scope change, not a continuation of M5's styling work — it reverses two things v1 shipped as explicit non-goals (folders, version history beyond mtimes) and adds a new one (an optional Anthropic API dependency, `spec.md` §9). The open decision flagged back in M5 hasn't been made: build it, or cut it and leave the design bundle as reference-only. If it's a go, suggested internal order (each is independently useful, so this isn't a hard dependency chain, just a sensible sequence):

1. **Folders** (§4.1) — pure path-handling change to the existing File Store/index, no new UI chrome beyond what note-list grouping needs. Lowest risk, most self-contained.
2. **Version history & snapshots** (§4.2, §5.1, §6.1–6.2) — new on-disk storage (`.noted/versions/`) and new endpoints, but no external dependency. Do this before AI panels: the AI apply flow (§5.2) *requires* the snapshot mechanism to already exist ("every apply writes a version" is a hard dependency, not a nice-to-have).
3. **AI edit panels** (§5.2, §6.3) — depends on (2), and is the only piece with an external network/cost dependency (`ANTHROPIC_API_KEY`, spec.md §3/§9). Do this last so a go/no-go on the AI-specific privacy tradeoff doesn't block the other two.

**Watch for before starting:** version storage under `NOTES_DIR/.noted/` (§4.2) will interact with whatever M7 backup strategy got chosen — confirm it either backs that up too (probably right, it's real history) or explicitly excludes it, don't leave it undecided.

## v2 candidates — not scheduled, don't build early

Image attachments, a real full-text search index, note templates, export/import. Revisit only once v1 has survived actual daily use — see spec.md §9 for why these are explicitly out of scope for now.
