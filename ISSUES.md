# noted — Issues & deferred decisions

One line per entry with the date noticed, per `notes/development.md` §7. Triage
at the end of each roadmap milestone: close what's fixed, promote real design
gaps into `spec.md` §11.

## Open

- 2026-09-10 (M7) — `derivePort`'s hash isn't collision-free: two different
  vault directories could in principle land on the same port (very unlikely at
  personal scale, but possible). If it ever happens, running the second one just
  fails to bind and logs an error — no automatic fallback to a nearby port.
  Worth adding one if it's ever hit in practice.
- 2026-09-10 (M7) — Backup commits are best-effort with no retry queue: if
  `git commit` fails for a reason other than "nothing to commit" (disk full, a
  corrupted `.git`, an unexpected lock), that one write's backup is just lost —
  logged to the console, not surfaced in the app, and not retried on the next
  write. Acceptable since the note itself is still safely on disk either way
  (backup, not source of truth); revisit if it's ever silently broken for a
  while in practice.
- 2026-09-10 (M7) — Observed during manual testing, not a code bug: killing the
  `noted` (npm launcher) process with `SIGKILL` doesn't give the Node wrapper a
  chance to forward the signal to its Deno child, so the child can be orphaned
  holding the port. The graceful path (`Ctrl-C`, `SIGTERM`, `SIGINT`) works
  correctly — verified end-to-end, including "same folder reuses the same port
  after a graceful restart." An orphaned instance is still handled sanely on the
  next launch (treated as "already running," browser opened to it) — just worth
  knowing `kill -9` is the one way to leave a stray process around.
- 2026-09-10 (M7) — The npm launcher's automatic Deno-install path (official
  installer via `curl | sh` / `irm | iex`) is exercised and confirmed working
  for the "Deno already installed" case (this session's actual test), but the
  "Deno missing, auto-install kicks in" branch itself wasn't exercised
  end-to-end on Windows — only the command construction was reviewed, not run.
  Worth a real test on a clean Windows machine before relying on it there.
- 2026-09-10 (M7) — `vault-state.ts`'s `getOrCreateToken` has a narrow race: two
  `noted` processes launched for the very first time against the same brand-new
  vault, at the same moment, could each generate a different token and race to
  persist it — the loser's in-memory token wouldn't match what's on disk. Only
  matters for two _simultaneous first launches_ of the same fresh directory,
  which the normal "one `noted` per folder" usage pattern doesn't produce; not
  worth atomic-transaction complexity for v1.
- 2026-09-10 (M5) — The editor's format-menu cells (Bold/Italic/Strike/
  Heading/List/Quote) are plain actions, not toggles — they don't reflect
  whether the current selection already has that mark. Would need reading the
  syntax tree at the selection on every menu-open/selection-change; deferred
  since the commands themselves work correctly either way.
- 2026-09-10 (M5) — Shape-system "alternation" (mirrored-squircle icon buttons,
  notched cards) is odd/even-in-a-flat-list, not the mockup's richer per-screen
  rotation (e.g. the mockup's card notch position also varies by content, not
  just list position). Cosmetic; fine for v1.
- 2026-09-05 — Auth is a plaintext shared token, checked with a length-constant
  compare (`src/auth.ts`, `spec.md` §11). Accepted for home-network v1; revisit
  before any wider exposure (needs TLS + something better than a static token).
- 2026-09-05 — Existing-notes migration: frontmatter parser now tolerates
  missing/partial/malformed frontmatter and backfills on read; still needs a
  check against a real pre-existing vault's frontmatter shape (`spec.md` §11).
  Still open post-M7 — no real existing vault was available to test against
  during that milestone; do this the first time `noted` is pointed at real
  notes.
- 2026-09-05 — Reading a note with an offset timestamp (`...-07:00`) normalizes
  it to UTC (`...Z`) in API responses and on next write. Same instant, but the
  author's local offset is dropped. Minor; fine for v1. Decide in M4/M5 whether
  to preserve the original offset string.
- 2026-09-05 (M2) — After creating a note the "Created." status flashes and is
  immediately cleared by the route change to the new note. Cosmetic; fix when
  the status/toast UI gets real attention (M5).
- 2026-09-05 (M2) — Auth token is entered in a plain field and kept in
  `localStorage`; there's no real "log in" step and no way to clear it from the
  UI. Acceptable for a single-user home tool; reconsider alongside the auth
  rework before wider exposure.
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
- 2026-09-10 (M6) — A note created while offline has no filename yet to key an
  IndexedDB Cache write against, so it doesn't appear in the note list until the
  Write Queue drains and the create actually lands server-side (the status line
  does say "Saved offline — will create when back online." so it isn't silent).
  Acceptable for v1; revisit with a client-generated temp id if offline note
  creation turns out to be common in daily use.
- 2026-09-10 (M6) — Deletes don't participate in the conflict flow (`spec.md` §7
  covers edits, not deletes): a queued delete always wins over a concurrent
  server-side edit of the same note, with no "someone changed this before you
  deleted it" prompt. Matches the spec as written; worth a look if it causes a
  surprise in daily use.
- 2026-09-10 (M6) — Background Sync (`registration.sync.register()`) is
  best-effort and not universally supported (notably no Safari/iOS); the
  `online` window event is the cross-browser fallback already wired in
  `sync-manager.js`, so sync still happens on reconnect everywhere, just not
  always the instant the OS wakes the service worker in the background.
- 2026-09-10 (M6) — No per-note-card sync-state indicator (`design-checklist.md`
  §4 calls for an "ember dot/bar/queued label" wherever a note appears). Right
  now a queued/offline write only surfaces as a transient app-shell status line,
  not a persistent per-note badge — a note sitting in the Write Queue looks
  identical to a fully-synced one in the list. Worth a small follow-up pass
  (Write Queue already exposes `list()`, keyed by filename) rather than
  reopening the whole milestone for it.

## Closed

- 2026-09-10 (M7) — Reported by the user: `npm install -g @ajcates/noted3`
  failed outright on Termux (Android) with
  `npm error notsup Unsupported
  platform ... current: {"os":"android"}` —
  `package.json`'s `os` allowlist (`darwin`/`linux`/`win32`) omitted Android
  despite `spec.md` §8 explicitly naming Termux as a target platform. **Closed
  2026-09-10**: added `"android"` to `package.json`'s `os` field, and went
  further since Termux isn't just "Linux" for two other things this milestone
  got wrong for it: (1) `bin/noted.js` now tries Termux's own
  `pkg install -y deno` before the generic deno.land installer, since that
  installer's binary isn't guaranteed to run under Termux's bionic libc (the
  failure message now points at a community workaround instead of the generic
  docs); (2) `src/open-browser.ts`'s `pickOpener` now detects Termux via the
  `TERMUX_VERSION` env var and uses `termux-open-url` instead of `xdg-open`,
  which Termux doesn't have. Not fully verified on an actual Termux device (no
  such environment available here) — the `pkg install` fallback path and
  `termux-open-url` both depend on packages (`termux-api`) that may not be
  installed; worth a real check next time `noted` is run there.
- 2026-09-05 — Deno not installed on the dev machine. **Closed 2026-09-05**:
  installed Deno 2.9.6 via the official install script to
  `C:\Users\ajcates\.deno\bin`.
- 2026-09-05 — `PUT /api/notes/:filename` has no conflict check yet — it always
  overwrites and bumps `updated`. The client-supplied `updated` / conflict flow
  is M6 (`spec.md` §7). **Closed 2026-09-10**: an optional `updated` field on
  the PUT body is checked against the note's current `updated`; a mismatch 409s
  with a `ConflictResponse` (the server's current copy) instead of overwriting.
  Omitting it still force-overwrites (back-compat) — nothing client-side sends
  it yet until the Sync Manager (M6) is wired up.
- 2026-09-05 — Conflict-resolution UX (`spec.md` §7, §11) needs its own design
  pass before M6. **Closed 2026-09-10**: built as a banner over the editor
  (`note-editor.js`'s `#renderConflictBanner`) — "Keep mine" / "Keep the other
  version", not a silent overwrite or a bare `confirm()`.
