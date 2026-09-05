# noted — Issues & deferred decisions

One line per entry with the date noticed, per `notes/development.md` §7. Triage
at the end of each roadmap milestone: close what's fixed, promote real design
gaps into `spec.md` §11.

## Open

- 2026-09-05 — Auth is a plaintext shared token (`spec.md` §11). Acceptable on a
  home network; revisit before any wider exposure.
- 2026-09-05 — Conflict-resolution UX (`spec.md` §7, §11) needs its own design
  pass before M6.
- 2026-09-05 — Existing-notes migration: frontmatter parser must tolerate
  missing/partial frontmatter and backfill on first write (`spec.md` §11).

## Closed

- 2026-09-05 — Deno not installed on the dev machine. **Closed 2026-09-05**:
  installed Deno 2.9.6 via the official install script to
  `C:\Users\ajcates\.deno\bin`.
