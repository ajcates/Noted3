# noted — Project Spec

A self-hosted, installable PWA for editing a directory of wiki-linked markdown notes, built on Deno.

Status: draft v1 — decisions below reflect what we've settled; open items are called out at the end.

## 1. Goals

- Edit a real directory of `.md` files on disk, from a phone or any browser, as if it were a native notes app.
- Support `[[wikilink]]`-style linking between notes with an automatic backlinks panel — Obsidian/Roam-style, not just flat files.
- Install to a home screen and keep working with no connection; writes made offline sync once back online.
- Single persistent Deno process you run yourself (home server, VPS, or Termux on Android) with normal filesystem access — no serverless/edge constraints, no Deno KV required for the core data.

## 2. Architecture overview

**Model: server-side directory, thin client.** See **[system-overview.md](system-overview.md)** for the full component-by-component breakdown and data-flow diagrams — this section is just the high-level shape.

```
┌─────────────────────┐        HTTP/JSON         ┌──────────────────────────┐
│   Browser (PWA)      │  ───────────────────────▶ │   Deno server (Deno.serve) │
│  - CodeMirror 6       │                          │  - REST API                │
│  - Service worker      │ ◀─────────────────────── │  - reads/writes real .md   │
│  - IndexedDB (offline   │        JSON              │    files under NOTES_DIR  │
│    cache + write queue) │                          │  - in-memory link/backlink │
└─────────────────────┘                          │    index, rebuilt on boot   │
                                                   └──────────────────────────┘
                                                                │
                                                                ▼
                                                     NOTES_DIR/**/*.md on disk
```

Key decision: **the filesystem directory is the database.** Notes are plain markdown files with YAML frontmatter, not rows in a database — this keeps the notes portable, editable outside the app (a text editor, git, Syncthing), and simple to back up. The server maintains an in-memory index (built at startup, updated incrementally on writes) purely for fast search, tag lookups, and backlink resolution — that index is a cache, never the source of truth, and can always be rebuilt by rescanning the directory.

## 3. Tech stack

| Layer | Choice | Notes |
|---|---|---|
| Runtime | Deno (latest stable) | Native TS, no `node_modules`, built-in `Deno.serve` |
| HTTP | `Deno.serve` + a small router (or `oak`/`hono` via npm specifier) | Keep it thin; most logic lives in plain functions, not framework middleware |
| Frontmatter parsing | `std/front-matter` or a small YAML lib | Title, tags, created/updated timestamps live here |
| Markdown → HTML | `markdown-it` or similar (npm specifier) with a wikilink plugin | Need a custom rule for `[[Note Title]]` → resolved link |
| Editor | CodeMirror 6, `@codemirror/lang-markdown` | Inline styling of markdown syntax (headers, bold, links rendered lighter/hidden) rather than raw-text + separate preview pane |
| Client framework | Plain JS/TS + Web Components, or Preact if state gets complex | Matches your past preference for lean vanilla-JS PWAs; escalate to Preact only if the editor/sync state gets unwieldy |
| Styling | Material Design 3 Expressive tokens, OKLCH color space, rem units | See §12 — full design system worked out separately |
| Offline storage | Service Worker (Cache API for app shell + assets) + IndexedDB (note cache + pending-write queue) | See §7 |
| Persistence | Filesystem (`Deno.readTextFile`/`writeTextFile`/`readDir`) | No database process to run or back up |
| Auth | Single shared token/passphrase (see open questions) | This is a personal tool, not multi-tenant |

## 4. Data model

**A note is one `.md` file.** Notes may live at the vault root or in nested folders; their vault-relative path is the stable ID used by the API and links. New notes are created at the vault root with a slugified title (`my-note-title.md`), and collisions get a numeric suffix. Title can change without renaming (title lives in frontmatter), but renaming the file is how a note's ID/URL changes — the server rewrites any incoming `[[wikilinks]]` that reference it by filename when a rename happens, so links don't silently break.

Frontmatter (YAML) at the top of every file:

```yaml
---
title: My Note Title
tags: [project-x, idea]
created: 2026-09-05T10:00:00-07:00
updated: 2026-09-05T10:00:00-07:00
---
```

Body: plain markdown, with `[[Note Title]]` or `[[filename]]` as the wikilink syntax. Unresolved links (pointing to a note that doesn't exist yet) render distinctly and can be clicked to create the target note — standard wiki behavior.

**In-memory index** (rebuilt from the directory on boot, updated on write):
- filename → {title, tags, outgoing links, mtime}
- backlinks: filename → [filenames that link to it] (derived, inverse of outgoing links)
- tag → [filenames]
- a simple inverted-index or just naive substring search over titles+bodies for v1 (full-text search engine is a later optimization, not v1)

## 5. API design (v1)

REST/JSON over the Deno server. Illustrative, not final:

Here and below, `:filename` is one URL-encoded vault-relative path such as
`projects/roadmap.md`; the `/` within it is encoded by the client.

- `GET /api/notes` — list all notes (filename, title, tags, updated) for the note browser
- `GET /api/folders` — list visible vault-relative directory paths, including empty folders
- `POST /api/folders` `{path: "projects"}` — create one folder; its parent must already exist
- `PATCH /api/folders/:path` `{path: "archive/projects"}` — rename or move a folder, update every nested note ID, and rewrite incoming filename-form wikilinks
- `GET /api/notes/:filename` — full content of one note. **As built (M3):** returns `{filename, title, tags, created, updated, body, links, html}` — `links` is the outgoing `[[wikilinks]]` de-duplicated, each `{target, resolved, filename, title}`; `html` is the rendered body with `<a class="wikilink [unresolved]">`.
- `POST /api/notes` — create a note ({title, body} → server picks filename/slug); returns the same shape as GET, 201 + `Location`
- `PUT /api/notes/:filename` — update content; server re-parses links, bumps `updated`, updates the index
- `PATCH /api/notes/:filename` `{filename: "archive/new-name.md"}` — **rename/move (M3).** Moves the file, creating the destination folder when needed; rewrites incoming `[[links]]` that referenced it *by filename* in every backlinking note (title-form links untouched); 409 if the new name is taken.
- `DELETE /api/notes/:filename` — delete; the index drops the entry and dependents' links become `resolved: false` on their next fetch (no server push — see §2 / system-overview.md "Deleting a note")
- `GET /api/notes/:filename/backlinks` — notes that link to this one: `[{filename, title, snippet}]`, 404 if the note isn't indexed
- `GET /api/search?q=` — naive case-insensitive title/body substring search **(M4)**; `[{filename,title,tags,updated,snippet}]`, title hits first, `[]` for a blank query
- `GET /api/tags` **(M4)** → `[{tag,count}]`; `GET /api/tags/:tag` **(M4)** → `[NoteSummary]` (empty array if none)
- `GET /api/manifest.webmanifest`, service worker at `/sw.js` _(M6)_

**Wikilink resolution (M3), in order:** target as a filename (`name` or `name.md`) → exact case-insensitive title match → `slugify(target).md`. Duplicate titles: first by sorted filename wins (see ISSUES.md).

Writes should be idempotent enough to support the offline sync-queue replaying them (see §7) — e.g. `PUT` with a client-supplied `updated` timestamp so the server can detect and surface a conflict rather than silently overwriting.

## 6. Editor UX

- CodeMirror 6 with `@codemirror/lang-markdown`, styled so markdown syntax (`**bold**`, `# heading`, link brackets) is visually de-emphasized or hidden when the cursor isn't on that line — "WYSIWYG-ish," not a raw textarea and not a fully separate preview pane.
  - _Built in M4 (`public/app/codemirror-setup.js`):_ a `ViewPlugin` hides `#`/`*`/`` ` ``/`>`/bullet marks on non-cursor lines and dims them on the cursor line; a highlight style makes headings bigger, bold/italic real, code monospace. `[[wikilinks]]` get a colour accent (brackets not hidden — hiding one bracket of `[[…]]` looked broken). CodeMirror ships as vendored ESM (`public/vendor/codemirror/`, `scripts/vendor-codemirror.ts`) loaded through the `index.html` import map — no bundler, no runtime CDN. `deno.json` maps the same package names to npm so `deno check` has types.
- Typing `[[` triggers an autocomplete popup of existing note titles (filtered as you type), with an option to create a new note if nothing matches — this is the core wiki-linking interaction.
  - _Built in M4:_ query starts after `[[`; the `Create "…"` entry inserts the link and fires `editor-create-link`, which the App Shell turns into `POST /api/notes` for an empty note so the link resolves immediately.
- A backlinks panel (collapsible, below or beside the editor) lists notes linking to the current one, each with a short snippet of surrounding context.
- Note browser: an all-notes list, folder view with breadcrumbs, tag filter,
  and a responsive vault sidebar for jumping directly between notes and
  folders. The folder view can create child folders and rename existing ones;
  folders are real filesystem directories and remain visible when empty.

## 7. PWA / offline-first design

- **App shell**: manifest.webmanifest (name, icons, theme color per your MD3/OKLCH palette, `display: standalone`), service worker precaches the shell (JS/CSS/CodeMirror bundle) on install.
- **Note cache**: IndexedDB stores the full note list and recently-opened note bodies, so the app is usable (browse + read + edit) with no connection.
- **Write queue**: edits made offline are written to IndexedDB immediately (so nothing is lost) and queued; a `sync` event (Background Sync API where supported, otherwise a retry-on-reconnect fallback) flushes the queue against the API when connectivity returns.
- **Conflict handling**: if the server's `updated` timestamp for a note has moved past what the client last saw when a queued write is replayed, don't silently overwrite — surface a simple conflict resolution (keep mine / keep server's / view diff). This is the one genuinely tricky piece of the offline design and worth scoping carefully before building.
- Service worker strategy: stale-while-revalidate for the note list/API GETs, cache-first for static assets.

## 8. Deployment

- Single Deno process, permissions scoped to what it actually touches: `NOTES_DIR` (the vault) and `~/.noted` (per-vault state — the persisted auth token, kept outside `NOTES_DIR` since M7 makes that directory a git repo). Don't grant blanket `--allow-read`/`--allow-write`.
- _As built (M7):_ shipped as `npm install -g @ajcates/noted3` — a thin launcher (`bin/noted.js`) that ensures `deno` is present (installing it via the official installer if not) and execs `deno run` against the real TypeScript source with the caller's actual working directory as `NOTES_DIR`. Running `deno task start` directly still works identically; the npm package is a convenience wrapper, not a different app.
- Config via environment variables: `NOTES_DIR`, `PORT`, auth token — _as built (M7):_ each now has a deterministic default instead of being required, so `noted` needs no `.env`/setup to run from inside a fresh vault directory:
  - `NOTES_DIR` defaults to the current directory.
  - `PORT` defaults to a hash of `NOTES_DIR`'s absolute path (`src/derive-port.ts`) — the same folder always gets the same port back across restarts; a different folder (almost always) gets a different one, so several vaults can run side by side with no port-juggling.
  - `AUTH_TOKEN` defaults to a token generated once per vault and persisted under `~/.noted/vaults/` (`src/vault-state.ts`), so the browser stays logged in (same origin, same token) across restarts without the token ever being committed into the vault's own git history.
  - An explicit env var still overrides any of the three, unchanged.
- _As built (M7):_ on a successful boot, `noted` opens the OS's default browser to the running app with the token in the URL (`src/open-browser.ts`); the client reads it and scrubs it from the address bar (`public/app/main.js`). If the derived port is already bound, that's treated as "already running for this folder" and it just opens the browser to the existing instance rather than erroring.
- _As built (M7):_ backup strategy resolved as **git** — the vault becomes a plain git repo on first run (`git init`, or left alone if you already manage it yourself) and every write is committed automatically (`src/git-backup.ts`), best-effort (a machine with no `git` just runs without backups). See the open-questions entry below for why this was chosen over a periodic-copy job.
- No process supervisor (systemd unit, Termux restart wrapper) or reverse proxy is set up as part of M7 — the accepted deploy shape for v1 is "you run `noted` from a terminal on your home network," not "always-on server reachable from outside it." Revisit both if that assumption changes (see §11).
- HTTPS: needed for full PWA features (service worker, installability) on anything other than `localhost` — a reverse proxy (Caddy is the simplest for auto-TLS) in front of the Deno process is the easiest path if this is exposed beyond your home network. Not set up for v1; home-network-only.

## 9. Non-goals for v1

- Multi-user accounts / sharing notes with other people.
- Real-time collaborative editing (multiple people/tabs editing the same note simultaneously).
- Full-text search engine (naive search is enough for a personal note count; revisit if the corpus grows large).
- Image/attachment uploads (assume markdown links to files you place in the directory yourself, for now).

## 10. Phased roadmap

1. **v0 (minimal core)**: Deno server serving the directory read-only-ish — list, read, create, edit, delete notes, no linking yet. Prove the server ↔ filesystem ↔ browser round trip.
2. **v1 (this spec)**: wikilinks, backlinks panel, tags, search, CodeMirror editor, PWA installability, offline-first with sync queue.
3. **v2 (candidates, not committed)**: image attachments, full-text search index, note templates, export/import (e.g. a git-backed history of the notes directory instead of just mtimes).

## 11. Open questions / assumptions to confirm before or during build

- **Auth**: assumed a single shared passphrase/token (simplest for a personal, self-hosted single-user tool). If this will ever be reachable outside your home network, this needs to be more than a plaintext token check — worth confirming how exposed this will be.
  - _Resolved for v1 (2026-09-05, during M1):_ shipping the plaintext shared token — `Authorization: Bearer <AUTH_TOKEN>`, length-constant compare, `src/auth.ts`. Assumption: this stays on the home network behind Caddy/TLS (§8). Revisit before any wider exposure; tracked in `ISSUES.md`.
- **Conflict resolution UI**: sketched a simple "keep mine / keep server's" prompt in §7 — worth a quick pass of its own once the editor is further along, since this is the part most likely to feel bad if done hastily.
- **Existing notes migration**: if you already have markdown notes elsewhere you want to point this at, the frontmatter schema in §4 should be checked against what you already have (or the server should tolerate missing/partial frontmatter and backfill it on first write).
  - _Partly handled (2026-09-05, during M1):_ the Frontmatter Parser (`src/frontmatter.ts`) tolerates missing / partial / malformed frontmatter — it backfills `title` from the filename and `created`/`updated` from the current time on read, and normalizes `tags` to a string array. A read does not rewrite the file; the backfilled values are persisted on the next `PUT`. Still open: sanity-check against a real existing vault before M7.
- **Client framework**: defaulted to plain JS/Web Components per your past PWA work; flagged Preact as a fallback if the editor + sync-queue state gets hard to manage by hand.
  - _Resolved for M2 (2026-09-05):_ plain **`.js`** ES modules (not `.ts`) + `// @ts-check` + JSDoc, native Web Components, no bundler/transpile — the browser loads the exact file on disk. `deno check`/`lint`/`fmt` still cover it. Rationale + escalation paths (on-the-fly transpile, or Preact) in `system-overview.md` "Client module map".
- **How `noted` gets installed and launched (M7)**: `techstack.md`/§8 originally assumed a systemd unit or Termux restart wrapper you set up by hand.
  - _Resolved for M7 (2026-09-10):_ `npm install -g @ajcates/noted3`, run from any directory — no process supervisor, still a plain foreground Deno process you start yourself (`bin/noted.js` is a launcher, not a service manager). Chosen over systemd/Termux because the actual usage pattern is "launch it from a terminal when you want it," not "always-on." Revisit (and add the systemd unit / Termux wrapper this originally called for) if that stops being true.
- **Whether this ever leaves the home network (M7)**: §8/§11's auth resolution already assumed "home network only" behind Caddy/TLS if exposed further; M7 needed a concrete answer to decide whether to build that reverse-proxy/TLS layer now.
  - _Resolved for M7 (2026-09-10):_ home network only, no public exposure. Caddy/TLS and the auth hardening §11's "Auth" entry calls for both stay explicitly out of scope until that changes — `techstack.md` documents Caddy as ready to add, not added.
- **Backup strategy for `NOTES_DIR` (M7)**: `spec.md` §8/roadmap.md M7 left this as "git, or a plain periodic copy," undecided.
  - _Resolved for M7 (2026-09-10):_ git. The vault becomes a git repo on first run (or is left alone if you already manage it as one yourself) and every write gets an automatic commit (`src/git-backup.ts`) — chosen over a periodic-copy job because it's finer-grained (a commit per save, not per interval) and gives real history for free, matching the git-backed-history idea already listed as a v2 candidate (§10) — this pulls just the backup half of that forward into v1, not full export/import.

## 12. Design system — Material 3 Expressive

Full design reference published separately: **[Noted Field Guide](https://claude.ai/code/artifact/d937782c-06d1-4a54-a8c3-3136d7e027ed)** (also saved locally as `noted-field-guide.html` in this folder) — color roles, type scale, shape/corner system, spring-based motion, surface tonal stack, and the four components above (note card, wikilink autocomplete, backlinks panel, docked toolbar) assembled as mockups.

Summary of decisions to carry into implementation:

- **Five seed colors** (OKLCH, matching your established "five base color variables" pattern): Ink (primary, `oklch(52% 0.19 275)`) for links/caret/primary actions; Moss (secondary, `oklch(58% 0.08 175)`) for backlinks/quiet UI; Ember (tertiary, `oklch(68% 0.15 55)`) for tags/accents; a warm-violet-tinted neutral (hue 275) for the surface stack; and a standard error red. Roles (primary/on-primary/primary-container, etc.) and the 6-step surface-container stack are derived from these via OKLCH, using relative-color syntax where practical.
- **Type**: Fraunces (serif, expressive optical sizing) for Display/Headline roles and note titles; Manrope for Title/Body/Label and UI chrome; IBM Plex Mono added as a sixth, app-specific "Source" role for raw markdown and filenames.
- **Shape**: standard M3 corner scale (none → full) for containers and controls; a handful of the newer Expressive "shape library" forms (cookie, sunny, bun) for the FAB and decorative accents, generated as parametric CSS clip-paths rather than fixed assets.
- **Motion**: spring-based, two schemes — Expressive (visible overshoot, reserved for the one primary action per screen, e.g. "New note") and Standard (calm, low-overshoot, for save/close/navigate).
- **Elevation**: no drop-shadows; layering is done entirely through the surface-container tonal steps.
