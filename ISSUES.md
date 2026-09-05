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

## Closed

- 2026-09-05 — Deno not installed on the dev machine. **Closed 2026-09-05**:
  installed Deno 2.9.6 via the official install script to
  `C:\Users\ajcates\.deno\bin`.
