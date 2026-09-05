/**
 * Static file server for the client app shell.
 *
 * Not in system-overview.md §1's component list on its own — it's the "serves
 * the app shell" half of the Deno process. A thin wrapper over `@std/http`'s
 * `serveDir` so content types, `index.html`, and traversal safety come for
 * free; the client is plain files on disk (no bundler), so nothing more is
 * needed. Auth does not apply here — the browser must be able to load the
 * shell before it has a token (spec.md §7).
 */

import { serveDir } from "@std/http/file-server";

export function serveStatic(req: Request, fsRoot: string): Promise<Response> {
  return serveDir(req, { fsRoot, quiet: true });
}
