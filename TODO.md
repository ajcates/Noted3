# noted — Active TODO

Granular task list, one level finer than `notes/roadmap.md`. Checkbox format
matches the roadmap. Finished tasks move under a dated `## Done` heading (newest
first) per `notes/development.md` §5 — they are not deleted.

## M4 — Real editor (next)

- [ ] Swap the textarea for CodeMirror 6 + `@codemirror/lang-markdown` (ESM, no
      bundler)
- [ ] Inline markdown-syntax de-emphasis (spec.md §6)
- [ ] Wikilink Autocomplete — `[[` trigger, title-filtered dropdown, "create new
      note" action
- [ ] Search View + `GET /api/search` + Search Module (naive substring)
- [ ] Tag Browser — `GET /api/tags`, `GET /api/tags/:tag` (index already builds
      the tag map)
- [ ] Playwright e2e for the autocomplete flow (trigger, filter, select, "create
      new")

## Done

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
