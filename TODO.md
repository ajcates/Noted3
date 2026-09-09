# noted — Active TODO

Granular task list, one level finer than `notes/roadmap.md`. Checkbox format
matches the roadmap. Finished tasks move under a dated `## Done` heading (newest
first) per `notes/development.md` §5 — they are not deleted.

## M6 — PWA & offline-first (next)

Decided 2026-09-09 (`roadmap.md` M6, `ISSUES.md`): the SW does its own
authenticated fetch on `sync`, reading the token from IndexedDB. Build
implications: SW registers as `{ type: "module" }`; the Write Queue lives in
IndexedDB, not memory; the drain function is one implementation shared by the
SW's `sync` handler and a page-side `online`/boot fallback (Background Sync is
Chromium-only).

Still open: the conflict-resolution UI (`spec.md` §11) wants its own design pass
before being built, not an inline prompt bolted on — flag before starting that
task specifically, not the whole milestone.

- [x] `manifest.webmanifest` + icons + `display: standalone` — see `roadmap.md`
      M6 for the auth-gating bug this caught and fixed in `spec.md` first
- [ ] IndexedDB Cache — note list + recently-opened bodies
- [ ] Write Queue (IndexedDB-backed) — durable pending-mutation log
- [ ] Service Worker (module worker) — precache app shell (incl. vendored
      fonts), SWR for API GETs, cache-first for static assets
- [ ] Sync Manager — the shared drain function; wire it to the SW's `sync` event
      and the page-side fallback
- [ ] Conflict handling — `updated`-timestamp check, keep-mine/keep-server's UI
- [ ] Playwright e2e: offline edit → reconnect → sync, then a forced conflict

## Done

### 2026-09-09 — Design fidelity pass: checklist + close the real gaps it found

- [x] **`notes/design-fidelity-checklist.md`** (new) — audited the running app
      against the actual criteria in `Noted Design Notes.dc.html` §3–4 item by
      item, not from memory. Distinguishes real gaps from "needs a feature this
      pass didn't build" (sort button, folders, format menu, tag editing, etc.)
      so the checklist doesn't quietly become a todo list for M8-sized work.
- [x] **Snippet card** (§4.4, the list's core unit) — added `snippet` and
      `backlinkCount` to `NoteSummary`/`GET /api/notes` (and `SearchResult`,
      `NoteDetail`), reusing `search.ts`'s existing `firstLine()` rather than a
      second implementation; `backlinkCount` reads the index's already-derived
      backlink graph, so no new disk I/O. Note list now shows a real excerpt,
      clickable tag chips, a "N backlinks" chip, and a `<time>` timestamp
      instead of a comma-joined tag string.
- [x] **Search results** (§4.15) — matched-text highlighting via `<mark>`
      (title + snippet), plus the same relationship-chip/timestamp treatment as
      the snippet card.
- [x] **Masthead kicker** (§4.1) — ember mono note count above the Fraunces
      wordmark, "scale before identity," in an `<hgroup>`.
- [x] **Wikilink autocomplete popup** (§4.9) — restyled CodeMirror's own tooltip
      classes (well-surface, 28px radius, ink-container first match, ink "Create
      …" row); verified via computed style in a real browser, since CodeMirror
      injects its own theme and a couple of overrides needed `!important` to
      actually win.
- [x] Semantic-HTML pass alongside the above: native `<search>` landmark
      (search-view), `<time datetime>` for every timestamp, `aria-label` on the
      title/search inputs (previously placeholder-only), `<hgroup>` for the
      kicker+wordmark pair.
- [x] Verified: `deno check`/`lint`/`fmt` clean, all 21 tests green (re-ran the
      browser trio twice after one sandbox-flake retry), and every visual change
      screenshotted live (light + dark) rather than trusted from source.
- **Real gap found, not fixed**: no UI exists to edit a note's tags at all —
  logged in `ISSUES.md` as a feature decision, not a styling fix.

### 2026-09-09 — Pre-M6: fixed the two risks the M5 review surfaced

- [x] **Vendored fonts** — `scripts/vendor-fonts.ts` (new, follows the
      `vendor-codemirror.ts` pattern) fetches the latin subset of Fraunces/
      Manrope/IBM Plex Mono from Google's `css2` API once and writes 5 woff2
      files + a generated `fonts.css` into `public/vendor/fonts/`; `index.html`
      links that instead of the Google Fonts `<link>`. Verified via Playwright:
      zero non-localhost requests, all three families report `loaded`,
      screenshot pixel-identical to the CDN version.
- [x] **Token moved to IndexedDB** — new `public/app/token-store.js`
      (`getToken`/`setToken`, now async); `api.js` delegates to it,
      `app-shell.js`'s token prefill/change-handler updated to await it. The
      three Playwright tests that seeded `localStorage` directly (`client-crud`,
      `backlinks-panel`, `wikilink-autocomplete`) now seed IndexedDB via a real
      page + reload instead (dynamic-imports the actual `token-store.js`, not a
      duplicated inline copy of its logic).
- [x] Installed Google Chrome in this environment to actually run the
      `channel: "chrome"` Playwright tests instead of trusting the diff — 21/21
      green, including all three browser tests exercising the new token storage
      end-to-end (create/edit/delete, backlinks nav, wikilink autocomplete all
      still authenticate correctly).
- [x] Docs caught up: `ISSUES.md` (both entries closed, with what's still open),
      `roadmap.md` M6, `system-overview.md`'s client module map (new files,
      corrected two stale lines found along the way).
- **Still open**: which side of the Service Worker boundary actually makes the
  authenticated retry — `ISSUES.md`, pre-M6.

### 2026-09-09 — M5: Design system integration (mostly done — see roadmap.md for what's still open and why)

- [x] Full Material 3 Expressive token set (color/radius/font/spacing/motion)
      ported into `public/app/styles.css` `:root`, light + dark via
      `prefers-color-scheme` — sourced from `noted-field-guide.html` +
      `notes/mobile-app-design-project/.../Noted Design Notes.dc.html`
- [x] Applied to every real component: note cards, tag chips (ember), masthead/
      nav, editor surface, backlinks panel (moss), search; detokenized
      `codemirror-setup.js`'s wikilink/quote/list colors along the way (predated
      M5, still hardcoded hex)
- [x] Press feedback (design notes §6.2) done properly — scale 0.96 + a
      surface-step/brightness shift over 100ms in, releasing on spatial-fast;
      found and fixed a real bug where the generic `button:active` rule was
      winning a specificity tie over `.primary`/`.delete`/`.tag-chip` and
      showing the wrong press color
- [x] Search results get their 120ms crossfade (§6.2); `prefers-reduced-motion`
      now zeroes `animation-duration` too, not just `transition-duration`
- [x] Empty states (note list/tags/search) — quiet dashed card + Fraunces-
      italic copy instead of bare gray text
- [x] Verified live: installed Deno (wasn't present), ran the dev server, drove
      it with Playwright against the vendored Chromium, screenshotted note
      list/editor/backlinks/tags/search in both themes plus press states
- **Still open** (see `roadmap.md` M5 for the item-by-item breakdown): the rest
  of the element catalogue that needs features from other milestones (sort
  button, folder row, format pop menu), the asymmetric-pill/notched-card shapes
  (plain radii only so far), and the 7 of 8 missing states that need
  sync/AI/snapshots/folders to exist first
- **New risks found, not yet fixed** — logged in `ISSUES.md` and `roadmap.md`
  M6: the Google Fonts runtime dependency this introduced, and a pre-existing
  Service-Worker/localStorage conflict this surfaced while reviewing M6's design
  ahead of time

### 2026-09-06 — Review + micro-refactor (post-M4)

- [x] **Bugs fixed** — `PUT {title:""}` now 400s instead of silently blanking
      the title (+ trims titles on create/update); `NoteIndex.build` skips a
      file that vanishes mid-scan instead of failing boot; misleading `auth.ts`
      constant-time comment corrected; dead `Note` type removed.
- [x] **`src/filename.ts`** — the filename/slug rules (`parseFilename`,
      `slugify`, `filenameToTitle`, `stripExt`/`ensureExt`, `NOTE_EXT`) pulled
      out of `file-store.ts` and the two duplicate `ensureMd`/`stripMd` copies
      in `markdown.ts` / `note-index.ts` collapsed into it. `file-store.ts` is
      now purely disk I/O.
- [x] **`src/http.ts`** — `json` / `errorResponse` / `readJsonObject` / the
      request-field validators moved here; router and handlers no longer each
      build JSON responses their own way.
- [x] **`writeNoteAndIndex` helper** — the write→stat→`index.upsert` triple
      (create / update / rename) is now one call, so no handler can update disk
      and forget the index.
- [x] **`public/app/ui.js`** — `el()` + `emit()` DOM helpers; every view
      component rewritten with them (render methods ~40% shorter, event dispatch
      uniform). `NoteEditor` setters no longer render while disconnected
      (removed the `childElementCount` guard + triple render).
- [x] App Shell caches note titles (`#titlesLoaded`) instead of re-fetching
      `/api/notes` on every note open. `search-view` clears its debounce on
      disconnect.
- [x] All 21 tests green; `check`/`lint`/`fmt` clean; browser-smoked list /
      editor / backlinks / search / tags.

### 2026-09-06 — M4: Real editor (CodeMirror), search, tags

- [x] **CodeMirror 6 editor** (`public/app/codemirror-setup.js`) — markdown
      language + highlight style; vendored ESM under `public/vendor/codemirror/`
      (`scripts/vendor-codemirror.ts`), loaded via the import map in
      `index.html`; `deno.json` maps the same names to npm for `deno check`.
- [x] **Syntax de-emphasis** (spec.md §6) — a `ViewPlugin` hides markdown
      punctuation (`#`, `*`, `` ` ``, `>`, bullets) on every line except the
      cursor's, where it dims. `[[wikilinks]]` get a colour accent.
- [x] **Wikilink Autocomplete** — `[[` opens a title-filtered list (query starts
      after `[[`); a `Create "…"` entry inserts the link and fires
      `editor-create-link`, which the App Shell turns into a `POST /api/notes`.
- [x] **Search** — `src/search.ts` (`searchNotes`, pure over an index snapshot),
      `NoteIndex.search`, `GET /api/search?q=`, `<search-view>` (debounced),
      route `#/search`.
- [x] **Tags** — `NoteIndex.tagCounts`/`notesForTag`, `GET /api/tags`,
      `GET /api/tags/:tag`, `<tag-browser>` (all-tags + per-tag), routes
      `#/tags` and `#/tags/<tag>`; header nav added.
- [x] **Tests** — `tests/e2e/search-tags.test.ts` (3 API cases) +
      `tests/e2e/wikilink-autocomplete.test.ts` (Playwright: pick existing
      title, "Create" path with on-disk assertion). M2/M3 browser tests updated
      to drive CodeMirror via `tests/e2e/_support.ts`. 20/20 green;
      `check`/`lint`/`fmt` clean.

### 2026-09-06 — M3: Wikilinks & backlinks

- [x] **Markdown/Wikilink Parser** (`src/markdown.ts`) — one `markdown-it`
      instance with a custom `[[wikilink]]` (+ `[[target|alias]]`) inline rule.
      `extractWikilinkTargets` (tokenizer-based, so code spans/fences are
      ignored), `renderMarkdown` (body → HTML, resolved vs. `unresolved`
      `<a class="wikilink">`), `rewriteWikilinkTarget` (rename), and
      `firstWikilinkSnippet` (backlinks context).
- [x] **In-Memory Index** (`src/note-index.ts`) — `NoteIndex` stateful class,
      built at boot by scanning `NOTES_DIR`; per note holds normalized
      frontmatter + outgoing targets + mtime; derives the title lookup, backlink
      graph, and tag map (recomputed in full on every mutation). `resolve` tries
      filename → title (ci) → slug. `GET /api/notes` now serves from the index
      with no disk I/O.
- [x] **`GET /api/notes/:filename/backlinks`** — linkers + title + de-bracketed
      snippet; 404 when the note isn't indexed.
- [x] `GET /api/notes/:filename` gains `links[]` (outgoing, resolved) and `html`
      (rendered body).
- [x] **`PATCH /api/notes/:filename`** `{ filename }` — rename: moves the file,
      rewrites filename-form `[[links]]` in every backlinker (title-form links
      untouched, they still resolve), 409 on name clash.
- [x] **Delete handling** — `index.remove` drops the entry; dependents' links
      simply stop resolving (`resolved: false`), nothing silently breaks.
- [x] **Backlinks Panel** (`public/app/backlinks-panel.js`) —
      `<backlinks-panel>`, collapsible, shown under the editor for an existing
      note; emits `note-open`. App Shell fetches note + backlinks together.
- [x] **Tests** — `tests/e2e/wikilinks.test.ts` (7 API cases: resolve/unresolve,
      filename forms, backlinks + 404, code-fence ignore, rename rewrite, rename
      409, delete breaks links) + `tests/e2e/backlinks-panel.test.ts`
      (Playwright: panel lists linkers, click navigates). 16/16 green;
      `check`/`lint`/`fmt` clean.

### 2026-09-05 — M2: Minimal client (v0 milestone)

- [x] **Static app shell** — `public/index.html` + `public/app/*.js` served
      directly as ES modules (no bundler). `src/static.ts` wraps `@std/http`'s
      `serveDir`; the router serves `/api/*` (auth-gated) vs. everything else
      (the public shell). Client authored as plain `.js` + `// @ts-check` +
      JSDoc — see the decision note in `system-overview.md` / `spec.md` §11.
- [x] **App Shell / Router** (`public/app/app-shell.js`) — `<app-shell>` custom
      element; hash routing (`#/`, `#/new`, `#/note/<filename>`); owns the top
      bar, the auth-token field (persisted to `localStorage`), and the status
      line; the only component that calls the API Client
- [x] **Note List View** (`public/app/note-list.js`) — `<note-list>`, pure
      render from a `notes` array; emits `note-new` / `note-open` /
      `note-delete`
- [x] **Editor View** (`public/app/note-editor.js`) — `<note-editor>`, title
      input + `<textarea>` (CodeMirror is M4); emits `editor-save` /
      `editor-back` / `editor-delete`
- [x] **API Client** (`public/app/api.js`) — the one `fetch` wrapper; attaches
      the bearer token; `ApiError` with status; `list/get/create/update/delete`
- [x] **Playwright e2e** (`tests/e2e/client-crud.test.ts`) — real Chrome
      (`channel: "chrome"`, no browser download), in-process server on a temp
      dir: create → edit → delete through the UI, asserting the `.md` file on
      disk at each step. Green alongside the 7 M1 API tests; `check` / `lint` /
      `fmt` clean.

### 2026-09-05 — M1: Server core (File Store + Notes API)

- [x] **Config Loader** (`src/config.ts`) — `loadConfig(env)` for `NOTES_DIR` /
      `PORT` / `AUTH_TOKEN`; throws `ConfigError` at boot if `NOTES_DIR` is
      missing or not a directory, `PORT` is out of range, or `AUTH_TOKEN` blank
- [x] **File Store** (`src/file-store.ts`) — `listNoteFiles`, `readNoteFile`,
      `writeNoteFile` (atomic: temp file + rename), `deleteNoteFile`,
      `noteFileExists`, `slugify`, `resolveNewFilename` (numeric collision
      suffix), `parseFilename` (branded, rejects traversal / separators)
- [x] **Frontmatter Parser** (`src/frontmatter.ts`) — `parseNote` /
      `normalizeFrontmatter` / `serializeNote`; tolerates missing, partial, or
      malformed frontmatter and backfills title (from filename) + timestamps
- [x] **Notes API Handlers** (`src/handlers.ts`) — `GET/POST /api/notes`,
      `GET/PUT/DELETE /api/notes/:filename`; `POST` → 201 + `Location`
- [x] **Auth Middleware** (`src/auth.ts`) — `Authorization: Bearer <token>`,
      length-constant compare; 401 on mismatch
- [x] **HTTP Router** (`src/router.ts`) — hand-rolled method+path table with
      `:param` capture; `createApp(config)` wires auth + dispatch + `ApiError` →
      JSON; unknown path → 404, known path wrong method → 405
- [x] `main.ts` — loads config, builds the app, serves
- [x] **e2e test** (`tests/e2e/notes-crud.test.ts`) — 7 `deno test` cases over
      real HTTP + a temp dir: full CRUD cycle with on-disk assertions, auth
      gate, slug collisions, traversal block, bad input, 404/405, no-frontmatter
      note. All green; `deno check` / `lint` / `fmt --check` clean.
- [x] Auth model decision (`spec.md` §11) — plaintext shared token accepted for
      home-network v1; recorded in `spec.md` §11 and `ISSUES.md`

### 2026-09-05 — M0: Repo scaffolding

- [x] `git init`, `.gitignore` (Deno cache, `.env`, local vault dir),
      `.gitattributes` (LF)
- [x] `deno.json` — `dev`/`start`/`test` tasks, strict compiler options,
      JSR-first import map; `notes/` excluded from `fmt`/`lint` (prose docs)
- [x] Local dev vault at `./vault` (gitignored) with a welcome note;
      `.env.example` documenting `NOTES_DIR` / `PORT` / `AUTH_TOKEN`
- [x] `main.ts` stub, verified booting on Deno 2.9.6
