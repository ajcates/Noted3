/**
 * noted — HTTP entry point.
 *
 * Boot sequence (system-overview.md §3): load config from the environment,
 * build the In-Memory Index by scanning NOTES_DIR, build the app handler,
 * start `Deno.serve`.
 */

import { join } from "@std/path";
import { loadConfig } from "./src/config.ts";
import { NoteIndex } from "./src/note-index.ts";
import { createApp } from "./src/router.ts";

const config = await loadConfig({ get: (k) => Deno.env.get(k) });
const index = await NoteIndex.build(config.notesDir);
const staticDir = join(import.meta.dirname ?? ".", "public");
const app = createApp(config, { staticDir, index });

Deno.serve({
  port: config.port,
  onListen: ({ hostname, port }) => {
    console.info(
      `noted listening on http://${hostname}:${port}  (NOTES_DIR=${config.notesDir})`,
    );
  },
}, app);
