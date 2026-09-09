# noted — Project Spec

A self-hosted, installable PWA for editing a directory of wiki-linked markdown notes, built on Deno.

Status: draft v1 — decisions below reflect what we've settled; open items are called out at the end.

## 1. Goals

- Edit a real directory of `.md` files on disk, from a phone or any browser, as if it were a native notes app.
- Support `[[wikilink]]`-style linking between notes with an automatic backlinks panel — Obsidian/Roam-style, not just flat files.
- Install to a home screen and keep working with no connection; writes made offline sync once back online.
- Single persistent Deno process you run yourself (home server, VPS, or Termux on Android) with normal filesystem access — no serverless/edge constraints, no Deno KV required for the core data.
- **v1.1 (added 2026-09-09, from `notes/mobile-app-design-project/`):** organize notes into folders, not just tags; keep a version history of each note with named snapshots you can restore; optionally hand a note (or a tagged set of notes) to an AI assistant that proposes an edit as a reviewable diff before anything is written. See §4/§5/§6/§10 for the full spec of these three; they're additive to the goals above, not replacements.

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
| AI provider (v1.1, optional) | Anthropic Claude API (Messages API), default model `claude-sonnet-5` | Single-user, cost-sensitive tool — Sonnet 5 (`$2`/`$10` per MTok in/out) balances quality and cost for markdown edits, summarization, and tag suggestions; the bulk-edit plan (§5) uses `output_config.format` structured outputs so the per-file diff list parses reliably. Escalate a specific request to `claude-opus-5` only if Sonnet 5's output proves insufficient — don't default to the more expensive model. Entirely optional: no `ANTHROPIC_API_KEY` means the feature is off, not degraded (§8/§9) |

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

### 4.1 Folders (v1.1)

Filename-as-ID (§4) extends to a **path relative to `NOTES_DIR`**, POSIX-style (`daily/2026-09-05.md`), rather than a bare basename. A note at the root of `NOTES_DIR` belongs to the implicit **"unsorted"** folder — there's no separate empty-folder concept, a folder exists only because a note's path mentions it, matching the file-system-is-the-database principle in §2.

- File Store's `readDir` recurses into subdirectories (skipping any directory starting with `.`, per §4.2) instead of listing one flat level.
- Slug collisions (§4) are scoped per-directory, same as a real filesystem — `daily/idea.md` and `essays/idea.md` can coexist.
- **Wikilink resolution is unaffected by folders.** `[[idea]]` still resolves across the whole vault, not just the current folder — the design's own folder-view mock keeps tags and links as the graph, folders as a view. When a bare filename match is ambiguous across folders, extend the existing tie-break (§5): first by sorted **full path** wins.
- `POST /api/notes` gains an optional `folder` field (default: root/"unsorted"); moving a note between folders is a **rename** — `PATCH /api/notes/:filename` already supports changing the path (§5), no new endpoint needed.
- Folder listings (counts, "newest", subfolder counts, the breadcrumb) are computed **client-side** by grouping the existing flat `GET /api/notes` response on path segments — no new read endpoint for this.

### 4.2 Version history & snapshots (v1.1)

Versions are stored the same way notes are: as files, under `NOTES_DIR/.noted/versions/<note-path>/<version-id>.md` (full frontmatter + body, not a diff — diffs are computed on read). The File Store's directory scan (§4.1) excludes anything under `.noted/`, so version storage never appears in the note index, search, or backlinks. This keeps the "the filesystem is the database" principle (§2) intact for versions too — they survive a plain directory copy/backup, no separate database.

A version record is `{id, kind: "snapshot" | "autosave", label?, device?, createdAt, content}`:
- **Autosave** — captured automatically on `PUT` (§5) when the content actually changed since the last stored version, debounced to at most one per note per 2 minutes. Retention: 30 days **or** the 50 most recent, whichever is smaller — a version store that silently grows is a liability (the design's own retention footer, §4.12 of `Noted Design Notes.dc.html`).
- **Snapshot** — captured explicitly by the user (the "⏱ Snapshot" pill, §6), optionally named. Kept indefinitely until the user deletes it; not subject to the 30-day/50-entry purge. **Idempotent-feeling**: if nothing changed since the last version of either kind, the server reports "no changes to snapshot" rather than writing a duplicate.
- **Current draft** is not a version — it's just the note's live content — but the version-history UI (§6) shows it as a synthetic first entry so "restore" always has something to restore *from*.

Restoring a version is implemented as a normal write: it copies the version's content back into the note via the same path as `PUT` (bumps `updated`, re-parses links, updates the index) — and because that write itself triggers a new autosave first, a restore is itself always undoable.

## 5. API design (v1)

REST/JSON over the Deno server. Illustrative, not final:

- `GET /api/notes` — list all notes (filename, title, tags, updated) for the note browser
- `GET /api/notes/:filename` — full content of one note. **As built (M3):** returns `{filename, title, tags, created, updated, body, links, html}` — `links` is the outgoing `[[wikilinks]]` de-duplicated, each `{target, resolved, filename, title}`; `html` is the rendered body with `<a class="wikilink [unresolved]">`.
- `POST /api/notes` — create a note ({title, body, folder?} → server picks filename/slug within that folder, default root/"unsorted", §4.1); returns the same shape as GET, 201 + `Location`
- `PUT /api/notes/:filename` — update content; server re-parses links, bumps `updated`, updates the index
- `PATCH /api/notes/:filename` `{filename: "new-name.md"}` — **rename (M3).** Moves the file; rewrites incoming `[[links]]` that referenced it *by filename* in every backlinking note (title-form links untouched); 409 if the new name is taken. A path change (`"essays/new-name.md"`) is how a note moves between folders (v1.1, §4.1) — same endpoint, no special case.
- `DELETE /api/notes/:filename` — delete; the index drops the entry and dependents' links become `resolved: false` on their next fetch (no server push — see §2 / system-overview.md "Deleting a note")
- `GET /api/notes/:filename/backlinks` — notes that link to this one: `[{filename, title, snippet}]`, 404 if the note isn't indexed
- `GET /api/search?q=` — naive case-insensitive title/body substring search **(M4)**; `[{filename,title,tags,updated,snippet}]`, title hits first, `[]` for a blank query
- `GET /api/tags` **(M4)** → `[{tag,count}]`; `GET /api/tags/:tag` **(M4)** → `[NoteSummary]` (empty array if none)
- `manifest.webmanifest` and the service worker at `/sw.js` are **not** under `/api/` _(M6)_ — both are static files served the unauthenticated way `index.html` is (§2/system-overview.md's "the browser must be able to load the shell before it has a token" applies just as much to the manifest: the OS fetches it during install with no way to attach a bearer token, so gating it behind auth would make the app uninstallable). Caught during the pre-M6 review (`ISSUES.md`, 2026-09-09) — an earlier draft of this line had the manifest under `/api/`.

**Wikilink resolution (M3), in order:** target as a filename (`name` or `name.md`) → exact case-insensitive title match → `slugify(target).md`. Duplicate titles: first by sorted filename wins (see ISSUES.md).

Writes should be idempotent enough to support the offline sync-queue replaying them (see §7) — e.g. `PUT` with a client-supplied `updated` timestamp so the server can detect and surface a conflict rather than silently overwriting.

### 5.1 Versions API (v1.1)

- `GET /api/notes/:filename/versions` — `[{id, kind, label, device, createdAt, diffStats: {added, removed}}]`, newest first, plus a synthetic `current` entry for the live draft. `diffStats` for each entry is against the version immediately before it.
- `GET /api/notes/:filename/versions/:versionId?against=current|previous` (default `current`) — `{...version, diff: {added, removed, hunks}}`; a minimal line-based diff (LCS over lines) is enough for markdown notes, no external diff library needed.
- `POST /api/notes/:filename/snapshots` `{label?}` — explicit snapshot; `{created: false, message: "no changes to snapshot"}` (200) if content is unchanged since the last version of either kind, otherwise `{created: true, version}` (201).
- `POST /api/notes/:filename/versions/:versionId/restore` — writes that version's content back as the note's current content via the same path as `PUT` (§4.2); 404 if the version doesn't exist.
- `DELETE /api/notes/:filename/versions/:versionId` — only meaningful for snapshots (autosaves purge themselves per §4.2); 404 if not found.

### 5.2 AI edit API (v1.1, optional)

Present only when `ANTHROPIC_API_KEY` is configured (§8); absent it, these routes 501 and the client hides the AI entry points entirely rather than showing a disabled button (§9 — this is an opt-in feature, not a degraded fallback). Every apply is preceded by a snapshot (§4.2), matching the "nothing irreversible" principle behind the design (`Noted Design Notes.dc.html` §1.5) — proposals are never written straight to disk.

**Single note** (`Noted Design Notes.dc.html` §4.13):
- `POST /api/notes/:filename/ai/propose` `{instruction, history?: [{role, content}], scope?: {includeBacklinks: boolean}}` → one Claude Messages API call (model per §3) with the note's content — plus its backlinking notes' content if `scope.includeBacklinks` — as context; response `{proposalId, rationale, diff, proposedContent}`. Stateless: the client resends prior turns as `history` on each call rather than the server holding a session, consistent with the rest of the API. Proposals live in an in-process map keyed by `proposalId` with a 15-minute TTL — they're not durable state, so they don't need a home on disk.
- `POST /api/notes/:filename/ai/apply` `{proposalId}` → snapshots current content unconditionally, writes `proposedContent` via the same path as `PUT`, invalidates the proposal. 410 if the proposal expired.
- The quick-action chips in the panel (Summarize, Suggest links, Fix tags) are just canned `instruction` strings the client sends — no separate endpoints for them.

**Bulk, across a selection** (`Noted Design Notes.dc.html` §4.14):
- `POST /api/notes/ai/bulk-propose` `{scope: {tags?: string[], filenames?: string[]}, instruction, history?}` → resolves scope to a note list, one Claude call covering all of them using `output_config: {format: {...}}` (structured outputs) so the response parses as a reliable per-file plan rather than free text. Response `{proposalId, plan: [{filename, diffStats, excluded: false} | {filename, excluded: true, reason}]}` — a note the model declines to touch, or one that changed on disk after being read into context, comes back `excluded` with a reason rather than silently dropped (§4.14: "excluded rows kept visible with their reason").
- `POST /api/notes/ai/bulk-apply` `{proposalId, filenames: string[]}` — applies only the caller-selected subset of the plan's non-excluded rows (the checkboxes in the design, §4.14); snapshots each note individually first, so "batch undo" is just restoring each touched note's pre-apply snapshot.

## 6. Editor UX

- CodeMirror 6 with `@codemirror/lang-markdown`, styled so markdown syntax (`**bold**`, `# heading`, link brackets) is visually de-emphasized or hidden when the cursor isn't on that line — "WYSIWYG-ish," not a raw textarea and not a fully separate preview pane.
  - _Built in M4 (`public/app/codemirror-setup.js`):_ a `ViewPlugin` hides `#`/`*`/`` ` ``/`>`/bullet marks on non-cursor lines and dims them on the cursor line; a highlight style makes headings bigger, bold/italic real, code monospace. `[[wikilinks]]` get a colour accent (brackets not hidden — hiding one bracket of `[[…]]` looked broken). CodeMirror ships as vendored ESM (`public/vendor/codemirror/`, `scripts/vendor-codemirror.ts`) loaded through the `index.html` import map — no bundler, no runtime CDN. `deno.json` maps the same package names to npm so `deno check` has types.
- Typing `[[` triggers an autocomplete popup of existing note titles (filtered as you type), with an option to create a new note if nothing matches — this is the core wiki-linking interaction.
  - _Built in M4:_ query starts after `[[`; the `Create "…"` entry inserts the link and fires `editor-create-link`, which the App Shell turns into `POST /api/notes` for an empty note so the link resolves immediately.
- A backlinks panel (collapsible, below or beside the editor) lists notes linking to the current one, each with a short snippet of surrounding context.
- Note browser: flat list + tag filter for v1; **folder view and tag view are both v1.1** (§4.1, §10) — client-side groupings over the same `GET /api/notes` response, not separate data sources.

### 6.1 Undo, redo, and Snapshot (v1.1)

Undo/redo are CodeMirror's own local edit history (`@codemirror/commands`) — client-only, no server round-trip, no relation to §4.2's versions. They sit as a neighbouring pair of controls; a disabled step (nothing to undo/redo) dims rather than disappears, so the pair keeps its shape. The old "Done"/close button is replaced by an **⏱ Snapshot** action that calls `POST /api/notes/:filename/snapshots` (§5.1) — leaving the editor isn't an event worth a button, but marking a version the user might want back is.

### 6.2 Version history view (v1.1)

Scope chips filter the list from `GET /api/notes/:filename/versions` (§5.1) to Snapshots / Autosaves / All. Selecting a version shows its diff (`GET .../versions/:versionId`) with a restore action (`POST .../restore`) and a compare toggle. A timeline below groups versions by day: snapshots as larger dots (the live-draft entry gets a distinct halo), autosaves as smaller, quieter dots. A footer states the retention policy in plain terms (e.g. "keeps 30 days · 214 kB") — per §4.2, that's autosave retention only; snapshots aren't purged.

### 6.3 AI edit panels (v1.1, optional)

A bottom-sheet panel over the (dimmed) editor, present only when the AI API is enabled (§5.2/§9). Two variants, same shell:

- **Single note**: header states scope in plain text before any conversation happens ("this note + 2 backlinks") — the scope is stated up front because an editing agent's blast radius is the whole safety story. Chat-style turns (user / assistant) call `POST /api/notes/:filename/ai/propose` (§5.2) each round; the assistant's turn ends in a proposed diff, not just prose. Two commit actions: **Apply both** (calls `ai/apply` directly) and **Review one by one** (steps through hunks before applying) — both preceded by the "a snapshot is taken before applying" promise, which is not just UI copy: §5.2 makes it true server-side.
- **Bulk, across a selection**: scope is editable (removable tag/filename chips, "+ scope" to add more) rather than fixed to one note. The assistant's answer is a per-file plan, not prose — one row per note with a checkbox, the filename, and a diff count; a note the model excluded shows why. The commit button states what it will touch by count ("Apply to 11"), and applying promises one snapshot per note plus a batch undo (§5.2). Bulk editing is only tolerable when the blast radius is enumerated per file before the tap — don't collapse the plan into a single "apply all" with no per-file visibility.

## 7. PWA / offline-first design

- **App shell**: manifest.webmanifest (name, icons, theme color per your MD3/OKLCH palette, `display: standalone`), service worker precaches the shell (JS/CSS/CodeMirror bundle) on install.
- **Note cache**: IndexedDB stores the full note list and recently-opened note bodies, so the app is usable (browse + read + edit) with no connection.
- **Write queue**: edits made offline are written to IndexedDB immediately (so nothing is lost) and queued; a `sync` event (Background Sync API where supported, otherwise a retry-on-reconnect fallback) flushes the queue against the API when connectivity returns.
- **Conflict handling**: if the server's `updated` timestamp for a note has moved past what the client last saw when a queued write is replayed, don't silently overwrite — surface a simple conflict resolution (keep mine / keep server's / view diff). This is the one genuinely tricky piece of the offline design and worth scoping carefully before building.
- Service worker strategy: stale-while-revalidate for the note list/API GETs, cache-first for static assets.
- **AI edit panels (v1.1) are online-only and are not part of the sync queue.** They call a third-party API in real time; there's no meaningful way to queue "propose an edit" for later. Offline, the AI entry points are hidden rather than shown-disabled or silently queued — same "don't hide the mechanism" instinct as the rest of this app's design (§12).

## 8. Deployment

- Single Deno process, run via `deno run --allow-read=$NOTES_DIR --allow-write=$NOTES_DIR --allow-net main.ts` (scope permissions tightly to the notes directory — don't grant blanket `--allow-read`/`--allow-write`).
- Config via environment variables: `NOTES_DIR`, `PORT`, auth token/passphrase, and optionally `ANTHROPIC_API_KEY` (v1.1) — its absence turns off the AI edit API (§5.2) rather than erroring, since it's an optional enhancement, not a boot-time requirement like `NOTES_DIR` (§8/M1).
- Suggested to run under a process supervisor (systemd unit, or `pm2`/a simple restart-on-crash wrapper) so it survives reboots on whatever machine hosts it — including Termux on Android if that's the target, matching your existing on-device Android tooling.
- HTTPS: needed for full PWA features (service worker, installability) on anything other than `localhost` — a reverse proxy (Caddy is the simplest for auto-TLS) in front of the Deno process is the easiest path if this is exposed beyond your home network.

## 9. Non-goals for v1 (and v1.1)

- Multi-user accounts / sharing notes with other people.
- Real-time collaborative editing (multiple people/tabs editing the same note simultaneously).
- Full-text search engine (naive search is enough for a personal note count; revisit if the corpus grows large).
- Image/attachment uploads (assume markdown links to files you place in the directory yourself, for now).
- **AI features writing anything without a human tap.** Every propose/apply is two calls (§5.2), never one; there's no "auto-apply on a schedule" or background agent that edits notes unattended. If that's ever wanted, it's a new decision, not an extension of §5.2.
- **AI features sending note content anywhere without explicit opt-in.** No `ANTHROPIC_API_KEY` configured means the feature doesn't exist for that install (§8) — not a fallback to a local model, not a "coming soon" state. This is a personal-notes tool (§1); shipping any note content off-device has to be a decision the person running the server made, not a default.
- Unbounded version storage. §4.2's retention (30 days / 50 autosaves, snapshots kept until deleted) is a starting guess, not a guarantee this can't grow large in a heavily-snapshotted vault over years — see §11.

**Moved out of non-goals in v1.1:** nested folders/hierarchical organization and a version history were both listed as v1 non-goals previously ("tags cover organization for v1"; no history beyond mtimes). The mobile design bundle (`notes/mobile-app-design-project/`, added 2026-09-07) designed both, so they're now specced above (§4.1, §4.2, §5.1, §6.1–6.2) rather than deferred. This is a scope change worth being deliberate about, not an accretion — see the roadmap's open decision in `roadmap.md` M5.

## 10. Phased roadmap

1. **v0 (minimal core)**: Deno server serving the directory read-only-ish — list, read, create, edit, delete notes, no linking yet. Prove the server ↔ filesystem ↔ browser round trip.
2. **v1 (this spec)**: wikilinks, backlinks panel, tags, search, CodeMirror editor, PWA installability, offline-first with sync queue.
3. **v1.1 (added 2026-09-09, design-led — not yet committed to build)**: folders (§4.1), version history & snapshots (§4.2, §5.1, §6.1–6.2), AI edit panels single-note and bulk (§5.2, §6.3). Design exists (`notes/mobile-app-design-project/`); this spec section is what turns it into something buildable. Flagged as its own tier rather than folded into v1 because it changes non-goals (§9) that v1 shipped against — worth a deliberate go/no-go, not an automatic yes.
4. **v2 (candidates, not committed)**: image attachments, full-text search index, note templates, export/import (e.g. a git-backed history of the notes directory as an alternative to §4.2's own version store).

## 11. Open questions / assumptions to confirm before or during build

- **Auth**: assumed a single shared passphrase/token (simplest for a personal, self-hosted single-user tool). If this will ever be reachable outside your home network, this needs to be more than a plaintext token check — worth confirming how exposed this will be.
  - _Resolved for v1 (2026-09-05, during M1):_ shipping the plaintext shared token — `Authorization: Bearer <AUTH_TOKEN>`, length-constant compare, `src/auth.ts`. Assumption: this stays on the home network behind Caddy/TLS (§8). Revisit before any wider exposure; tracked in `ISSUES.md`.
- **Conflict resolution UI**: sketched a simple "keep mine / keep server's" prompt in §7 — worth a quick pass of its own once the editor is further along, since this is the part most likely to feel bad if done hastily.
- **Existing notes migration**: if you already have markdown notes elsewhere you want to point this at, the frontmatter schema in §4 should be checked against what you already have (or the server should tolerate missing/partial frontmatter and backfill it on first write).
  - _Partly handled (2026-09-05, during M1):_ the Frontmatter Parser (`src/frontmatter.ts`) tolerates missing / partial / malformed frontmatter — it backfills `title` from the filename and `created`/`updated` from the current time on read, and normalizes `tags` to a string array. A read does not rewrite the file; the backfilled values are persisted on the next `PUT`. Still open: sanity-check against a real existing vault before M7.
- **Client framework**: defaulted to plain JS/Web Components per your past PWA work; flagged Preact as a fallback if the editor + sync-queue state gets hard to manage by hand.
  - _Resolved for M2 (2026-09-05):_ plain **`.js`** ES modules (not `.ts`) + `// @ts-check` + JSDoc, native Web Components, no bundler/transpile — the browser loads the exact file on disk. `deno check`/`lint`/`fmt` still cover it. Rationale + escalation paths (on-the-fly transpile, or Preact) in `system-overview.md` "Client module map".
- **AI model choice and cost (v1.1, open):** §3 defaults to `claude-sonnet-5`; this hasn't been validated against real note-editing quality or real per-month cost for your actual usage. Worth a small trial (a week of real edits through the panel) before locking it in, and worth deciding whether cost is even a concern for a single-user tool at this scale.
- **Version store growth (v1.1, open):** §4.2's retention (30 days / 50 autosaves for autosaves, snapshots kept forever) is a guess ported from the design mock's own footer copy, not a measured number. Revisit once there's a real vault with real snapshot habits — a "kept forever" policy on explicit snapshots is fine until someone snapshots constantly.
- **Folder depth / breadcrumb limits (v1.1, open):** §4.1 doesn't cap nesting depth. The design's folder-row mock only shows one level of breadcrumb (`vault / notes`); deeply nested vaults may need a cap or a truncated breadcrumb before this ships. Not a blocker, just undecided.
- **AI panel conversation state (v1.1, open):** §5.2 specs the AI endpoints as stateless (client resends `history` each call). That's the minimal-surface choice, but it means a long single-note conversation resends the whole transcript every turn — fine for a personal tool's usage volume, worth revisiting only if it turns out to matter for cost or latency.

## 12. Design system — Material 3 Expressive

Full design reference published separately: **[Noted Field Guide](https://claude.ai/code/artifact/d937782c-06d1-4a54-a8c3-3136d7e027ed)** (also saved locally as `noted-field-guide.html` in this folder) — color roles, type scale, shape/corner system, spring-based motion, surface tonal stack, and the four components above (note card, wikilink autocomplete, backlinks panel, docked toolbar) assembled as mockups.

**Extended in v1.1** by `notes/mobile-app-design-project/project/Noted Design Notes.dc.html` — the same design system carried through nine additional Android screens, reconciling this field guide's voice with Material 3 Expressive (its own §1.2 "two voices"). It adds the full element catalogue behind §4.1–§6.3 above (folder/file row, docked bar + FAB, undo/redo/Snapshot, version timeline, both AI panels), plus interaction rules and motion tokens (its §5–6), and names states still to design before build (empty vault/tag, index-rebuilding, server-unreachable, sync-conflict banner, keyboard-up editor, sort sheet, long-press menu, name-this-snapshot sheet — its §7). Treat it as the source of truth for anything in §4.1–§6.3 that this spec summarized rather than fully restated.

Summary of decisions to carry into implementation:

- **Five seed colors** (OKLCH, matching your established "five base color variables" pattern): Ink (primary, `oklch(52% 0.19 275)`) for links/caret/primary actions; Moss (secondary, `oklch(58% 0.08 175)`) for backlinks/quiet UI; Ember (tertiary, `oklch(68% 0.15 55)`) for tags/accents; a warm-violet-tinted neutral (hue 275) for the surface stack; and a standard error red. Roles (primary/on-primary/primary-container, etc.) and the 6-step surface-container stack are derived from these via OKLCH, using relative-color syntax where practical.
- **Type**: Fraunces (serif, expressive optical sizing) for Display/Headline roles and note titles; Manrope for Title/Body/Label and UI chrome; IBM Plex Mono added as a sixth, app-specific "Source" role for raw markdown and filenames.
- **Shape**: standard M3 corner scale (none → full) for containers and controls; a handful of the newer Expressive "shape library" forms (cookie, sunny, bun) for the FAB and decorative accents, generated as parametric CSS clip-paths rather than fixed assets.
- **Motion**: spring-based, two schemes — Expressive (visible overshoot, reserved for the one primary action per screen, e.g. "New note") and Standard (calm, low-overshoot, for save/close/navigate).
- **Elevation**: no drop-shadows; layering is done entirely through the surface-container tonal steps.
