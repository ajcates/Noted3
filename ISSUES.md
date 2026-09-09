# noted — Issues & deferred decisions

One line per entry with the date noticed, per `notes/development.md` §7. Triage
at the end of each roadmap milestone: close what's fixed, promote real design
gaps into `spec.md` §11.

## Open

- 2026-09-05 — Auth is a plaintext shared token, checked with a length-constant
  compare (`src/auth.ts`, `spec.md` §11). Accepted for home-network v1; revisit
  before any wider exposure (needs TLS + something better than a static token).
- 2026-09-05 — Conflict-resolution UX (`spec.md` §7, §11) needs its own design
  pass before M6.
- 2026-09-05 — Existing-notes migration: frontmatter parser now tolerates
  missing/partial/malformed frontmatter and backfills on read; still needs a
  check against a real pre-existing vault's frontmatter shape before M7
  (`spec.md` §11).
- 2026-09-05 — Reading a note with an offset timestamp (`...-07:00`) normalizes
  it to UTC (`...Z`) in API responses and on next write. Same instant, but the
  author's local offset is dropped. Minor; fine for v1. Decide in M4/M5 whether
  to preserve the original offset string.
- 2026-09-05 — `PUT /api/notes/:filename` has no conflict check yet — it always
  overwrites and bumps `updated`. The client-supplied `updated` / conflict flow
  is M6 (`spec.md` §7).
- 2026-09-05 (M2) — After creating a note the "Created." status flashes and is
  immediately cleared by the route change to the new note. Cosmetic; fix when
  the status/toast UI gets real attention (M5).
- 2026-09-05 (M2) — Auth token is entered in a plain field with no real "log in"
  step and no way to clear it from the UI. Acceptable for a single-user home
  tool; reconsider alongside the auth rework before wider exposure. (Storage
  moved from `localStorage` to IndexedDB 2026-09-09 — see the closed entry below
  — but this UX gap is unrelated and still open.)
- 2026-09-05 (M2) — Playwright e2e depends on a system Chrome install
  (`channel: "chrome"`) since the version-matched browser binary isn't
  downloaded. If Chrome isn't present, run `npx playwright install chromium`.
- 2026-09-06 (M3) — Wikilink resolution on duplicate titles is "first by sorted
  filename wins" — silent and arbitrary. Fine for a personal vault; if it bites,
  surface the ambiguity or prefer the closest slug.
- 2026-09-06 (M3) — `rewriteWikilinkTarget` (used only on rename) is a raw-text
  regex, so it would also rewrite a `[[old-name]]` sitting inside a code block.
  Extraction/indexing is tokenizer-based and unaffected. Acceptable for now.
- 2026-09-06 (M3) — The In-Memory Index has no file watcher: notes edited on
  disk while the server runs aren't reflected until restart (or a future rebuild
  endpoint). Out of scope for v1 per `spec.md` §2, worth a note.
- 2026-09-06 (M3) — `GET /api/notes/:filename` always renders `html` even though
  only M4's editor/preview will consume it. Cheap; revisit if it shows up in
  profiling.
- 2026-09-06 (M4) — CodeMirror is vendored from esm.sh
  (`scripts/vendor-codemirror.ts`); re-vendoring needs network + esm.sh being
  up. The committed bundles don't. `deno.json` carries `@codemirror/*` /
  `@lezer/highlight` npm entries **only so `deno check` has types** — the
  browser never uses them (import map → vendored).
- 2026-09-06 (M4) — The `Create "…"` autocomplete entry immediately `POST`s an
  empty note. If the user then doesn't type anything meaningful, an empty note
  is left behind. Acceptable for now; revisit if it's annoying in daily use.
- 2026-09-06 (M4) — Editor has no dirty-state guard still (M2 note carried
  forward) — leaving a note with unsaved CodeMirror changes loses them silently.
- 2026-09-06 (M4) — `[[wikilink]]` in the editor is colour-only; it isn't
  click-to-navigate and unresolved vs. resolved isn't distinguished there. The
  resolved/unresolved styling lives in the API `html` field (M3), not yet the
  editor.
- 2026-09-06 (M4) — Search reads `body` from every index entry; the index now
  holds all note bodies in memory. Fine at personal scale; the "real full-text
  index" in spec.md §9 is the escalation if a vault gets large.
- 2026-09-06 (review) — `PATCH` rename isn't transactional: if a backlinker
  rewrite fails mid-loop, the file is already moved and some linkers still hold
  the old target (they render as unresolved, not wrong). Self-heals on the next
  boot (`NoteIndex.build` re-reads disk). Left as-is; a proper transaction is a
  bigger change than v1 warrants.
- 2026-09-09 (design fidelity pass) — There is no UI to edit a note's tags at
  all. The plumbing already goes most of the way: `PUT /api/notes/:filename`
  accepts and applies a `tags` field server-side (`src/handlers.ts`), and
  `api.js`'s `updateNote` JSDoc already types `tags?: string[]` — but
  `createNote` doesn't, and more to the point, `note-editor.js` has no
  tag-editing control and never includes tags in the `editor-save` event it
  emits, so nothing in the UI ever sends one. Tags can only be set today by
  hand-editing frontmatter outside the app, or a direct API call. The design
  bundle's editor surface (§4.8) wants tag chips + a dashed "+ tag" affordance
  above the body; closing that gap is a real feature addition (an editor
  control, wired through to an API that's already mostly ready for it), not a
  styling fix, so it wasn't built as part of
  `notes/design-fidelity-checklist.md`. Worth a deliberate decision.

## Closed

- 2026-09-05 — Deno not installed on the dev machine. **Closed 2026-09-05**:
  installed Deno 2.9.6 via the official install script to
  `C:\Users\ajcates\.deno\bin`.
- 2026-09-09 (M5) — `index.html` loaded Fraunces/Manrope/IBM Plex Mono from
  `fonts.googleapis.com` — a runtime CDN dependency, which is exactly what
  `techstack.md` vendors CodeMirror locally to avoid. **Closed 2026-09-09**:
  `scripts/vendor-fonts.ts` vendors the latin subset of all three (5 files,
  ~200KB) into `public/vendor/fonts/`; `index.html` now links a local
  `fonts.css` instead. Verified zero non-localhost requests and all three
  families loading correctly via Playwright. Scope note: latin subset only — a
  note title in Cyrillic/Vietnamese/Greek falls back to a system font rather
  than 404ing; re-run the script with more subsets if that bites.
- 2026-09-09 (pre-M6) — The auth token lived in `localStorage`
  (`public/app/api.js`), unreachable from a Service Worker's global scope, which
  M6's Sync Manager would need. **Closed 2026-09-09**: moved to IndexedDB
  (`public/app/token-store.js`, a small dedicated module so a future Service
  Worker can import just this, not all of `api.js`). `getToken`/`setToken` are
  now async; `app-shell.js` and the three Playwright tests that seed the token
  were updated to match, and all three (previously blocked by no system Chrome
  in this container) were run for real after installing Google Chrome — 21/21
  tests green. The _remaining_ half of this problem — does the SW do its own
  fetch, or wake a page? — is decided below.
- 2026-09-09 (pre-M6) — Decided: the Service Worker does its own authenticated
  fetch on the `sync` event, reading the token from IndexedDB (`token-store.js`)
  directly — this is the actual point of Background Sync (it works with no tab
  open), and the token move above made it possible. Two implications for the
  Write Queue/Sync Manager build in M6:
  - The SW needs `import`ing `token-store.js`, so it must be registered as a
    module worker (`{ type: "module" }`). Background Sync itself is
    Chromium-only (not Safari, not Firefox) — spec.md §7 already calls for a
    "retry-on-reconnect fallback" for that case, and the fix here is to write
    the actual drain logic as one function usable from _either_ context (SW
    `sync` handler, or a page's `online` listener + a check on boot), not two
    separate implementations — nothing about it needs to be SW-only now that the
    token isn't page-only either.
  - The Write Queue's log itself must live in IndexedDB (not an in-memory
    array), since it needs to survive both a page reload and the SW's own
    lifecycle (a worker can be terminated and restarted between `sync` events).
- 2026-09-09 (M6) — `spec.md` §5 originally listed the manifest as
  `GET /api/manifest.webmanifest`. **Closed 2026-09-09, before it shipped**: the
  router auth-gates everything under `/api/`, but a browser/OS fetching a web
  app manifest during install has no way to attach a bearer token — that route
  would have made the app permanently uninstallable, silently (the manifest
  fetch just 401s, no visible error to the end user, "Add to Home Screen" simply
  doesn't appear or does nothing). Fixed in `spec.md` and served
  `public/manifest.webmanifest` as a plain static file instead, the same
  unauthenticated path `index.html` already uses. Verified: 200 with no auth
  header, correct `application/manifest+json` content type, and a real browser
  actually discovering and fetching it via the page's `<link rel="manifest">`.
