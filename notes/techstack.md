# noted — Tech Stack

The concrete technology choices for the project, in one place. `spec.md` explains the architecture these choices serve; `development.md` explains how work gets done with them. This file is the answer to "what exactly are we building this with."

## Runtime & language

- **Deno** (latest stable) — native TypeScript, no `node_modules`, a single binary to install on whatever machine hosts this.
- **TypeScript, strict everywhere** — see `development.md` §1 for the specific language features to lean on (discriminated unions, `satisfies`, branded types, `readonly` by default).
- **`deno.json`** holds tasks (`dev`, `start`, `test`), compiler options, and the import map.

## Server

- **`Deno.serve` directly, with a small hand-rolled router** — no framework. The endpoint count in `spec.md` §5 doesn't justify Hono or Oak's abstraction; a plain function mapping method+path to a handler is enough, and it keeps the dependency count at zero on the server side.
- **Filesystem as the database** — `Deno.readDir`/`readTextFile`/`writeTextFile`, scoped permissions (`--allow-read=$NOTES_DIR --allow-write=$NOTES_DIR`).
- **Single shared token** for auth (`spec.md` §11) — a plain middleware check, no session/cookie machinery, appropriate for a single-user self-hosted tool.

## Client

- **Plain TypeScript + native Web Components** — no client framework. Matches the established lean vanilla-JS PWA pattern from past projects, and keeps the client dependency-free the same way the server is. If the editor/sync-queue state genuinely gets unwieldy once M4–M6 are underway, Preact stays the fallback option (`spec.md` §3) — but that's a decision to revisit with real code in front of it, not to pre-empt.
- **No bundler — native ES modules served directly, via an import map.** True to Deno's own "no build step" philosophy. Trade-off accepted: no tree-shaking or minification, which is a fine trade for a personal-scale app that isn't trying to shave kilobytes off a marketing site's load time.
- **CodeMirror 6** (`@codemirror/lang-markdown` + friends) for the editor — see `spec.md` §6.
  - _As built (M4):_ CM6 is many small packages, so rather than committing 20+ raw files or depending on a CDN at runtime, `scripts/vendor-codemirror.ts` fetches one pre-bundled ESM file per package from esm.sh (with `external=` so `@codemirror/state`, `@lezer/common` etc. stay shared singletons) into `public/vendor/codemirror/`. The `index.html` import map points the bare specifiers there. esm.sh bundles server-side; there is still no bundler or build step in *our* dev/serve loop, and nothing is fetched from a CDN at runtime. Bump versions by re-running the script (needs network).

## Content & parsing

- **Markdown → HTML + wikilink extraction**: a markdown library (e.g. `markdown-it`) with a custom rule for `[[Note Title]]` syntax, per `spec.md` §4.
- **YAML frontmatter**: a small YAML parser for the title/tags/created/updated block.
- These are exactly the kind of small, well-defined pure functions `development.md` §1 wants as plain functions on immutable data — easy to unit test with a string in, string/object out.

## Dependency sourcing

**JSR first, npm: specifiers as the fallback.** Check JSR (Deno's native registry) before reaching for an npm package — better types, no CommonJS/ESM interop shims, and it's the registry Deno itself is steering toward. Fall back to `npm:` specifiers for anything that only lives there (CodeMirror, whichever markdown/YAML libraries end up chosen) rather than avoiding them on principle. Pin versions explicitly in `deno.json`'s import map; let `deno.lock` track the resolved graph.

## Styling

- **Material 3 Expressive tokens, OKLCH color space, relative color syntax where practical** — the full system lives in `noted-field-guide.html`; the copy-pasteable custom properties are in `spec.md` §12.
- Plain CSS, no preprocessor and no CSS-in-JS — consistent with "no bundler" above; custom properties do the theming work a preprocessor would otherwise be for.

## Offline & PWA

- **Service Worker** (hand-written, no Workbox) — precache + stale-while-revalidate, per `spec.md` §7.
- **IndexedDB** directly (no wrapper library like `idb`) for the note cache and write queue — the access patterns here are simple enough not to need one, and it keeps this layer dependency-free too.

## Testing

- **`deno test`** (built-in) for server-side and API-level end-to-end tests.
- **Playwright** for anything that has to happen in a real browser — wikilink autocomplete, the offline/reconnect sync path, install-to-home-screen behavior.
- Tests are written *after* the goal and the implementation, per `development.md` §4 — they're what proves a goal was met, not a design tool here.

## Tooling

- **`deno fmt` / `deno lint`** with their defaults — no custom config unless a specific rule actively gets in the way. One less thing to maintain opinions about.
- **No CI pipeline for now** — this is a solo, self-hosted project; `deno test` runs locally before each commit lands. Worth revisiting only if this ever gets a second contributor.

## Deployment

- Still, underneath, a single long-running Deno process (`spec.md` §8) — M7 (`notes/roadmap.md`) just changed how you get one running.
- **Distributed via npm** (`npm install -g @ajcates/noted3`) as a thin launcher (`bin/noted.js`), not a Deno-to-Node port: it checks for `deno` (installing it via the official installer if missing) and then execs `deno run` against the real `main.ts`/`src/*.ts` — no build step, no bundling, the same TypeScript source `deno task start` runs.
- **Zero-config by directory**: run `noted` from inside a vault folder and it just works — `NOTES_DIR` defaults to the current directory, `PORT` to a deterministic hash of its absolute path (`src/derive-port.ts` — the same folder always gets the same port, a different one almost always gets a different port), and `AUTH_TOKEN` to a token generated once and persisted outside `NOTES_DIR` (`src/vault-state.ts`, `~/.noted/vaults/`) so a restart doesn't log the browser out and a secret never ends up inside the git-backed vault below. An explicit env var still overrides any of the three.
- **Opens itself**: on a successful boot, `noted` launches the OS's default browser pointed at the running app with the token embedded in the URL (`src/open-browser.ts`; the client picks the token up and strips it from the address bar). If the derived port is already taken, that's treated as "another `noted` is already running for this folder" — it opens the browser to the existing instance instead of erroring.
- **Backup**: the vault directory becomes a plain git repo on first run (`src/git-backup.ts`, `git init` if one doesn't already exist — a repo you already manage yourself is left untouched), and every write is committed automatically, serialized so concurrent saves can't race over `.git/index.lock`. No separate periodic-copy job — full history comes for free. Best-effort throughout: a machine with no `git` installed just runs without backups, logged once at boot.
- No process supervisor (systemd/Termux wrapper) or reverse proxy is set up by any of the above — accepted for now since the deploy target is "run from a terminal on the home network," not "always-on server reachable from outside it" (`spec.md` §11). Revisit both if that assumption changes.
- **Caddy** would still be the reverse proxy of choice if this is ever exposed past `localhost`, purely for automatic HTTPS — needed for full PWA installability off-network. Not needed for the home-network-only v1 deploy.

## Summary table

| Layer | Choice |
|---|---|
| Runtime | Deno |
| Server framework | None — raw `Deno.serve` + hand-rolled router |
| Client framework | None — plain TS + native Web Components |
| Client build | None — native ES modules + import map |
| Editor | CodeMirror 6 |
| Markdown/wikilinks | `markdown-it` (or similar) + custom wikilink rule |
| Frontmatter | Small YAML parser |
| Styling | Plain CSS, custom properties, OKLCH |
| Offline | Hand-written Service Worker + raw IndexedDB |
| Server tests | `deno test` |
| Browser tests | Playwright |
| Dependency source | JSR first, `npm:` fallback |
| Formatting/linting | `deno fmt` / `deno lint`, defaults |
| Distribution | npm (`@ajcates/noted3`), thin launcher around the same Deno process |
| Backup | Auto-committing git repo in `NOTES_DIR` |
| Reverse proxy | Caddy (only if exposed beyond localhost) |
