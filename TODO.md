# noted — Active TODO

Granular task list, one level finer than `notes/roadmap.md`. Checkbox format
matches the roadmap. Finished tasks move under a dated `## Done` heading (newest
first) per `notes/development.md` §5 — they are not deleted.

## M6 — PWA & offline-first (next)

See `notes/roadmap.md` M6 — manifest + icons, hand-written Service Worker,
IndexedDB cache, write queue, sync manager, conflict handling. Break into
day-to-day tasks here once underway.

## Done

### 2026-09-06 — Directory cleanup + M5: themeable design system

- [x] **Cleanup** — removed two stray placeholder files
      (`notes/Example txt file.txt`, `notes/Another example txt file.txt`)
      accidentally committed during M0; not project docs, not referenced
      anywhere. Verified the rest of the tree: `deno check`/`lint`/`fmt` clean,
      all 21 pre-existing tests green.
- [x] **M5 scope changed on request** — instead of hand-copying the field
      guide's token set into `styles.css` once, the app is now themeable via a
      YAML file at runtime, no rebuild/restart:
  - `theme.yaml` (repo root, `THEME_PATH` env override) — the M3 Expressive
    vocabulary as a schema (four seed colors + neutral hue, three font families,
    the fixed 15-role type scale, the fixed shape scale, the two named motion
    schemes, a small bounded set of layout placements) with no raw-CSS escape
    hatch
  - **Theme Compiler** (`src/theme.ts`) — `DEFAULT_THEME` (the field guide's
    exact values), `buildTheme` (tolerant deep-merge of parsed YAML onto the
    default — bad/unrecognized keys are dropped, not fatal),
    `deriveLightRole`/`deriveDarkRole` (seed-only color role derivation, a
    documented approximation of real M3 tonal palettes), `compileThemeCss`
    (pure: `ThemeConfig` → the full CSS text)
  - `GET /theme.css` (`src/router.ts`) — public like the static shell,
    recompiled from disk on every request so editing `theme.yaml` and reloading
    the browser is the whole retheme workflow
  - `public/app/styles.css` fully rewritten against the generated custom
    properties (every component: shell chrome, note list + FAB, editor,
    backlinks, search, tags) — zero hardcoded colors/radii/fonts;
    `codemirror-setup.js`'s highlight/theme colors likewise switched to
    `var(--...)`; `app-shell.js`'s status line now toggles an `is-error` class
    instead of setting inline hex
  - `Config`/`loadConfig` gained `themePath` (`THEME_PATH`, default
    `./theme.yaml`); `deno.json`'s `start` task's `--allow-read` list updated to
    match
  - Tests: `tests/e2e/theme.test.ts` (6 cases — seed derivation branching,
    tolerant merge, CSS compilation, `GET /theme.css` live + falling back when
    `THEME_PATH` doesn't exist). 27/27 tests green (24 via `deno test` directly;
    the 3 Playwright browser tests confirmed passing via a local-only
    `executablePath` override in this sandbox, since only plain Chromium is
    installed here — not the `"chrome"` channel the committed tests correctly
    target for the real dev machine; no test files changed)
  - Visually spot-checked in a real browser (light + dark, note list + editor
    with heading/bold/wikilink/code) via a Playwright screenshot; docs
    (`spec.md` §12, `system-overview.md`, `techstack.md`, `roadmap.md`) updated
    to describe the as-built system `check`/`lint`/`fmt` clean throughout.

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
