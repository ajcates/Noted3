# noted — Active TODO

Granular task list, one level finer than `notes/roadmap.md`. Checkbox format
matches the roadmap. Finished tasks move under a dated `## Done` heading (newest
first) per `notes/development.md` §5 — they are not deleted.

## M0 — Repo scaffolding

- [x] `git init`, `.gitignore` (Deno cache, `.env`, local vault dir)
- [x] `deno.json` — `dev`/`start`/`test` tasks, strict compiler options,
      JSR-first import map
- [x] `deno fmt`/`deno lint` defaults, only exception: `notes/` excluded from
      both (hand-written prose docs, not code)
- [x] Local dev vault at `./vault` (gitignored), `.env.example` documenting
      `NOTES_DIR`/`PORT`/`AUTH_TOKEN`
- [x] `main.ts` stub: reads `PORT`, starts `Deno.serve`, returns a placeholder
      response
- [x] Verify the stub boots and serves — `deno 2.9.6`, `curl` returns the
      placeholder 200 (`deno check`/`lint`/`fmt --check` all clean)

## M1 — Server core: File Store + Notes API (no linking yet)

Module layout: one file per `system-overview.md` §1 component under `src/`.

- [ ] **Config Loader** (`src/config.ts`) — pure `loadConfig(env)`; `NOTES_DIR`,
      `PORT`, `AUTH_TOKEN`; throw at boot if `NOTES_DIR` missing or not a
      directory
- [ ] **File Store** (`src/file-store.ts`) — `listFiles`, `readNote`,
      `writeNote`, `deleteNote`, `slugify` + numeric collision suffix; atomic
      write (temp file + rename)
- [ ] **Frontmatter Parser** (`src/frontmatter.ts`) — `parseNote(raw)` →
      `{ frontmatter, body }`, `serializeNote(fm, body)`; tolerate
      missing/partial frontmatter and backfill (`spec.md` §11)
- [ ] **Notes API Handlers** (`src/handlers.ts`) — `GET /api/notes`,
      `GET /api/notes/:filename`, `POST /api/notes`, `PUT /api/notes/:filename`,
      `DELETE /api/notes/:filename`
- [ ] **Auth Middleware** (`src/auth.ts`) — pure check of shared token on every
      request; 401 on mismatch
- [ ] **HTTP Router** (`src/router.ts`) — hand-rolled method+path → handler map
      over `Deno.serve`, no framework; wire Config + Auth + Handlers
- [ ] `main.ts` — replace stub: load config, build router, serve
- [ ] **e2e test** (`tests/e2e/notes-crud.test.ts`) — `deno test` driving the
      full create → read → list → update → delete cycle over HTTP against a real
      temp directory; assert file contents on disk match

### Open decision to resolve in M1

- [ ] Auth model (`spec.md` §11) — plaintext shared token is fine on the home
      network; document the assumption in `spec.md` §11 and move on unless
      exposure plans change
