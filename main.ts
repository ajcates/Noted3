/**
 * noted — HTTP entry point.
 *
 * Boot sequence (system-overview.md §3): load config from the environment,
 * build the In-Memory Index by scanning NOTES_DIR, build the app handler,
 * start `Deno.serve`.
 *
 * M7 (`notes/roadmap.md`) additions: `NOTES_DIR`/`PORT`/`AUTH_TOKEN` now
 * default from the current directory (`src/config.ts`) instead of being
 * required, so `noted` needs no setup to run in a fresh vault. If the
 * derived port is already taken, that almost certainly means another
 * `noted` is already serving this exact directory — rather than erroring,
 * just open the browser to it. On a successful boot: make sure the vault is
 * a git repo (`src/git-backup.ts`) and open the browser to the running app,
 * with the auth token in the URL so the client logs itself in
 * (`public/app/app-shell.js` picks it up and strips it from the address bar).
 */

import { join } from "@std/path";
import { loadConfig } from "./src/config.ts";
import { NoteIndex } from "./src/note-index.ts";
import { createApp } from "./src/router.ts";
import { ensureRepo, flushBackups } from "./src/git-backup.ts";
import { openInBrowser } from "./src/open-browser.ts";

const config = await loadConfig({
  get: (k) => Deno.env.get(k),
  cwd: () => Deno.cwd(),
});

const url = `http://localhost:${config.port}/?token=${
  encodeURIComponent(config.authToken)
}`;

try {
  const index = await NoteIndex.build(config.notesDir);
  const staticDir = join(import.meta.dirname ?? ".", "public");
  const app = createApp(config, { staticDir, index });

  // Awaited before `Deno.serve` so the very first write can't race past
  // `ensureRepo` and silently skip its backup commit.
  if (!(await ensureRepo(config.notesDir))) {
    console.warn(
      "noted: 'git' not found (or 'git init' failed) — automatic backups are off, see notes/roadmap.md M7",
    );
  }

  Deno.serve({
    port: config.port,
    onListen: ({ hostname, port }) => {
      console.info(
        `noted listening on http://${hostname}:${port}  (NOTES_DIR=${config.notesDir})`,
      );
      openInBrowser(url);
    },
  }, app);
} catch (cause) {
  if (!(cause instanceof Deno.errors.AddrInUse)) throw cause;
  console.info(
    `noted is already running for this folder (port ${config.port} is taken) — opening it in your browser`,
  );
  await openInBrowser(url);
  Deno.exit(0);
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  try {
    Deno.addSignalListener(signal, () => {
      console.info(`\nnoted: ${signal} — finishing pending backups…`);
      flushBackups().finally(() => Deno.exit(0));
    });
  } catch {
    // Signal not supported on this platform (e.g. SIGTERM on Windows) — skip.
  }
}
