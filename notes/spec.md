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
                                                     NOTES_DIR/*.md on disk
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

**A note is one `.md` file.** File naming: slugified title (`my-note-title.md`), collisions get a numeric suffix. Filename is a stable ID used for links; title can change without renaming (title lives in frontmatter), but renaming the file is how a note's ID/URL changes — the server rewrites any incoming `[[wikilinks]]` that reference it by filename when a rename happens, so links don't silently break.

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

- `GET /api/notes` — list all notes (filename, title, tags, updated) for the note browser
- `GET /api/notes/:filename` — full content of one note. **As built (M3):** returns `{filename, title, tags, created, updated, body, links, html}` — `links` is the outgoing `[[wikilinks]]` de-duplicated, each `{target, resolved, filename, title}`; `html` is the rendered body with `<a class="wikilink [unresolved]">`.
- `POST /api/notes` — create a note ({title, body} → server picks filename/slug); returns the same shape as GET, 201 + `Location`
- `PUT /api/notes/:filename` — update content; server re-parses links, bumps `updated`, updates the index
- `PATCH /api/notes/:filename` `{filename: "new-name.md"}` — **rename (M3).** Moves the file; rewrites incoming `[[links]]` that referenced it *by filename* in every backlinking note (title-form links untouched); 409 if the new name is taken.
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
- Note browser: flat list + tag filter for v1; folders/nested structure is a possible v2 (see non-goals).

## 7. PWA / offline-first design

- **App shell**: manifest.webmanifest (name, icons, theme color per your MD3/OKLCH palette, `display: standalone`), service worker precaches the shell (JS/CSS/CodeMirror bundle) on install.
- **Note cache**: IndexedDB stores the full note list and recently-opened note bodies, so the app is usable (browse + read + edit) with no connection.
- **Write queue**: edits made offline are written to IndexedDB immediately (so nothing is lost) and queued; a `sync` event (Background Sync API where supported, otherwise a retry-on-reconnect fallback) flushes the queue against the API when connectivity returns.
- **Conflict handling**: if the server's `updated` timestamp for a note has moved past what the client last saw when a queued write is replayed, don't silently overwrite — surface a simple conflict resolution (keep mine / keep server's / view diff). This is the one genuinely tricky piece of the offline design and worth scoping carefully before building.
- Service worker strategy: stale-while-revalidate for the note list/API GETs, cache-first for static assets.

## 8. Deployment

- Single Deno process, run via `deno run --allow-read=$NOTES_DIR --allow-write=$NOTES_DIR --allow-net main.ts` (scope permissions tightly to the notes directory — don't grant blanket `--allow-read`/`--allow-write`).
- Config via environment variables: `NOTES_DIR`, `PORT`, auth token/passphrase.
- Suggested to run under a process supervisor (systemd unit, or `pm2`/a simple restart-on-crash wrapper) so it survives reboots on whatever machine hosts it — including Termux on Android if that's the target, matching your existing on-device Android tooling.
- HTTPS: needed for full PWA features (service worker, installability) on anything other than `localhost` — a reverse proxy (Caddy is the simplest for auto-TLS) in front of the Deno process is the easiest path if this is exposed beyond your home network.

## 9. Non-goals for v1

- Multi-user accounts / sharing notes with other people.
- Real-time collaborative editing (multiple people/tabs editing the same note simultaneously).
- Nested folders/hierarchical organization (tags cover organization for v1; folders can layer on later without changing the storage model).
- Full-text search engine (naive search is enough for a personal note count; revisit if the corpus grows large).
- Image/attachment uploads (assume markdown links to files you place in the directory yourself, for now).

## 10. Phased roadmap

1. **v0 (minimal core)**: Deno server serving the directory read-only-ish — list, read, create, edit, delete notes, no linking yet. Prove the server ↔ filesystem ↔ browser round trip.
2. **v1 (this spec)**: wikilinks, backlinks panel, tags, search, CodeMirror editor, PWA installability, offline-first with sync queue.
3. **v2 (candidates, not committed)**: folders/nesting, image attachments, full-text search index, note templates, export/import (e.g. a git-backed history of the notes directory instead of just mtimes).

## 11. Open questions / assumptions to confirm before or during build

- **Auth**: assumed a single shared passphrase/token (simplest for a personal, self-hosted single-user tool). If this will ever be reachable outside your home network, this needs to be more than a plaintext token check — worth confirming how exposed this will be.
  - _Resolved for v1 (2026-09-05, during M1):_ shipping the plaintext shared token — `Authorization: Bearer <AUTH_TOKEN>`, length-constant compare, `src/auth.ts`. Assumption: this stays on the home network behind Caddy/TLS (§8). Revisit before any wider exposure; tracked in `ISSUES.md`.
- **Conflict resolution UI**: sketched a simple "keep mine / keep server's" prompt in §7 — worth a quick pass of its own once the editor is further along, since this is the part most likely to feel bad if done hastily.
- **Existing notes migration**: if you already have markdown notes elsewhere you want to point this at, the frontmatter schema in §4 should be checked against what you already have (or the server should tolerate missing/partial frontmatter and backfill it on first write).
  - _Partly handled (2026-09-05, during M1):_ the Frontmatter Parser (`src/frontmatter.ts`) tolerates missing / partial / malformed frontmatter — it backfills `title` from the filename and `created`/`updated` from the current time on read, and normalizes `tags` to a string array. A read does not rewrite the file; the backfilled values are persisted on the next `PUT`. Still open: sanity-check against a real existing vault before M7.
- **Client framework**: defaulted to plain JS/Web Components per your past PWA work; flagged Preact as a fallback if the editor + sync-queue state gets hard to manage by hand.
  - _Resolved for M2 (2026-09-05):_ plain **`.js`** ES modules (not `.ts`) + `// @ts-check` + JSDoc, native Web Components, no bundler/transpile — the browser loads the exact file on disk. `deno check`/`lint`/`fmt` still cover it. Rationale + escalation paths (on-the-fly transpile, or Preact) in `system-overview.md` "Client module map".

## 12. Design system — Material 3 Expressive

Full design reference published separately: **[Noted Field Guide](https://claude.ai/code/artifact/d937782c-06d1-4a54-a8c3-3136d7e027ed)** (also saved locally as `noted-field-guide.html` in this folder) — color roles, type scale, shape/corner system, spring-based motion, surface tonal stack, and the four components above (note card, wikilink autocomplete, backlinks panel, docked toolbar) assembled as mockups.

Summary of decisions to carry into implementation:

- **Five seed colors** (OKLCH, matching your established "five base color variables" pattern): Ink (primary, `oklch(52% 0.19 275)`) for links/caret/primary actions; Moss (secondary, `oklch(58% 0.08 175)`) for backlinks/quiet UI; Ember (tertiary, `oklch(68% 0.15 55)`) for tags/accents; a warm-violet-tinted neutral (hue 275) for the surface stack; and a standard error red. Roles (primary/on-primary/primary-container, etc.) and the 6-step surface-container stack are derived from these via OKLCH, using relative-color syntax where practical.
- **Type**: Fraunces (serif, expressive optical sizing) for Display/Headline roles and note titles; Manrope for Title/Body/Label and UI chrome; IBM Plex Mono added as a sixth, app-specific "Source" role for raw markdown and filenames.
- **Shape**: standard M3 corner scale (none → full) for containers and controls; a handful of the newer Expressive "shape library" forms (cookie, sunny, bun) for the FAB and decorative accents, generated as parametric CSS clip-paths rather than fixed assets.
- **Motion**: spring-based, two schemes — Expressive (visible overshoot, reserved for the one primary action per screen, e.g. "New note") and Standard (calm, low-overshoot, for save/close/navigate).
- **Elevation**: no drop-shadows; layering is done entirely through the surface-container tonal steps.

**As built (M5):** the token set above is not hand-copied into the stylesheet — it's data. `theme.yaml` (repo root, path configurable via `THEME_PATH`) holds the four seed colors + neutral hue, the three font families, the 15-role type scale, the shape scale, the two motion schemes, and a small bounded set of layout placements (FAB corner, list density, nav-item visibility) — the M3 Expressive vocabulary as a schema, not open-ended CSS. The Theme Compiler (`src/theme.ts`) reads and compiles it into `GET /theme.css`, recompiled from disk on every request so editing the file and reloading the browser is the entire "retheme" workflow. A color role can give exact light/dark tone values (what ships by default, transcribed from this section) or just a `seed`, in which case `deriveLightRole`/`deriveDarkRole` auto-derive the rest using a fixed-target-tone approximation of real M3 tonal palettes (documented in `src/theme.ts`'s header; the exact numbers differ slightly from the hand-tuned defaults above — see ISSUES.md). A missing `theme.yaml` is not an error; the built-in default (this section, verbatim) applies.

**Mobile (M3 window size classes):** below 600px width — M3's own "compact" breakpoint — the header's inline nav row (`Notes`/`Search`/`Tags`) is replaced by a fixed M3 **Navigation Bar** at the bottom of the screen: three icon+label destinations, the active one marked with M3's pill-shaped active indicator (`secondary-container`/`on-secondary-container`, matching Android's own Navigation Bar default). `app-shell.js` builds both the header nav and the Navigation Bar from the same destination list and keeps a `data-section` attribute current on `<app-shell>` so CSS alone drives which is highlighted — no separate state to keep in sync. At 600px and above, the original inline top nav is what's shown. All interactive controls meet M3's touch-target minimums (40dp buttons, 56dp extended-FAB, 32dp chips, 48dp+ list rows); every text input is pinned to a 16px minimum font size (Material's own touch-input guidance — smaller triggers an unwanted zoom-on-focus in mobile Safari); the FAB and the Navigation Bar account for `env(safe-area-inset-*)` so neither sits under a phone's notch or home-indicator; `:focus-visible` gets an on-brand ring instead of the browser's unstyled default.
