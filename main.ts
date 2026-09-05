/**
 * noted — HTTP entry point.
 *
 * Boot sequence (system-overview.md §3): load config from the environment,
 * build the app handler, start `Deno.serve`. The In-Memory Index build step
 * joins this sequence in M3.
 */

import { join } from "@std/path";
import { loadConfig } from "./src/config.ts";
import { createApp } from "./src/router.ts";

const config = await loadConfig({ get: (k) => Deno.env.get(k) });
const staticDir = join(import.meta.dirname ?? ".", "public");
const app = createApp(config, { staticDir });

Deno.serve({
  port: config.port,
  onListen: ({ hostname, port }) => {
    console.info(
      `noted listening on http://${hostname}:${port}  (NOTES_DIR=${config.notesDir})`,
    );
  },
}, app);
