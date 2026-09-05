/**
 * HTTP Router (system-overview.md §1).
 *
 * A hand-rolled method + path table over `Deno.serve` — no framework, per
 * techstack.md. `createApp` is the whole server as one function: it runs the
 * auth check, matches a route, invokes its handler, and turns thrown
 * {@link ApiError}s (and anything else) into JSON responses.
 */

import { ApiError, type Config } from "./types.ts";
import { isAuthorized } from "./auth.ts";
import {
  createNote,
  deleteNote,
  getNote,
  type Handler,
  listNotes,
  updateNote,
} from "./handlers.ts";

interface Route {
  readonly method: string;
  /** Path split on `/`; a segment of the form `:name` captures a param. */
  readonly segments: readonly string[];
  readonly handler: Handler;
}

const ROUTES: readonly Route[] = [
  route("GET", "/api/notes", listNotes),
  route("POST", "/api/notes", createNote),
  route("GET", "/api/notes/:filename", getNote),
  route("PUT", "/api/notes/:filename", updateNote),
  route("DELETE", "/api/notes/:filename", deleteNote),
];

/** Build the request handler for `Deno.serve`. Pure given `config`. */
export function createApp(config: Config): (req: Request) => Promise<Response> {
  return async (req: Request): Promise<Response> => {
    try {
      if (!isAuthorized(req, config.authToken)) {
        return errorResponse(
          new ApiError(401, "missing or invalid bearer token"),
        );
      }

      const { pathname } = new URL(req.url);
      const parts = splitPath(pathname);

      let matchedPath = false;
      for (const r of ROUTES) {
        const params = matchSegments(r.segments, parts);
        if (params === null) continue;
        matchedPath = true;
        if (r.method !== req.method) continue;
        return await r.handler({ notesDir: config.notesDir, params, req });
      }

      return errorResponse(
        new ApiError(
          matchedPath ? 405 : 404,
          matchedPath ? "method not allowed" : "not found",
        ),
      );
    } catch (caught) {
      if (caught instanceof ApiError) return errorResponse(caught);
      console.error("unhandled error in request handler:", caught);
      return errorResponse(new ApiError(500, "internal server error"));
    }
  };
}

function route(method: string, path: string, handler: Handler): Route {
  return { method, segments: splitPath(path), handler };
}

function splitPath(path: string): string[] {
  return path.split("/").filter((s) => s.length > 0);
}

/**
 * Match a route's segments against a request's. Returns captured params, or
 * `null` if the shape doesn't match.
 */
function matchSegments(
  routeSegments: readonly string[],
  reqSegments: readonly string[],
): Record<string, string> | null {
  if (routeSegments.length !== reqSegments.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < routeSegments.length; i++) {
    const rs = routeSegments[i]!;
    const qs = reqSegments[i]!;
    if (rs.startsWith(":")) {
      params[rs.slice(1)] = decodeURIComponent(qs);
    } else if (rs !== qs) {
      return null;
    }
  }
  return params;
}

function errorResponse(err: ApiError): Response {
  return new Response(JSON.stringify({ error: err.message }), {
    status: err.status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
