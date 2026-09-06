/**
 * HTTP Router (system-overview.md §1).
 *
 * A hand-rolled method + path table over `Deno.serve` — no framework, per
 * techstack.md. `createApp` is the whole server as one function: it runs the
 * auth check, matches a route, invokes its handler, and turns thrown
 * {@link ApiError}s (and anything else) into JSON responses.
 */

import { ApiError, type Config } from "./types.ts";
import { errorResponse } from "./http.ts";
import { isAuthorized } from "./auth.ts";
import { serveStatic } from "./static.ts";
import type { NoteIndex } from "./note-index.ts";
import {
  createNote,
  deleteNote,
  getBacklinks,
  getNote,
  type Handler,
  listNotes,
  listTags,
  notesByTag,
  renameNote,
  search,
  updateNote,
} from "./handlers.ts";

export interface AppOptions {
  /** The In-Memory Index, built at boot; every handler reads or updates it. */
  readonly index: NoteIndex;
  /**
   * Directory to serve the client app shell from. When omitted, non-API
   * requests get a 404.
   */
  readonly staticDir?: string;
}

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
  route("PATCH", "/api/notes/:filename", renameNote),
  route("DELETE", "/api/notes/:filename", deleteNote),
  route("GET", "/api/notes/:filename/backlinks", getBacklinks),
  route("GET", "/api/search", search),
  route("GET", "/api/tags", listTags),
  route("GET", "/api/tags/:tag", notesByTag),
];

/** Build the request handler for `Deno.serve`. Pure given `config` + `options`. */
export function createApp(
  config: Config,
  options: AppOptions,
): (req: Request) => Promise<Response> {
  return async (req: Request): Promise<Response> => {
    try {
      const { pathname } = new URL(req.url);

      // Everything under /api/ is the JSON API and is auth-gated. Everything
      // else is the (public) client app shell.
      if (!isApiPath(pathname)) {
        if (options.staticDir !== undefined && req.method === "GET") {
          return await serveStatic(req, options.staticDir);
        }
        return errorResponse(new ApiError(404, "not found"));
      }

      if (!isAuthorized(req, config.authToken)) {
        return errorResponse(
          new ApiError(401, "missing or invalid bearer token"),
        );
      }

      const parts = splitPath(pathname);
      let matchedPath = false;
      for (const r of ROUTES) {
        const params = matchSegments(r.segments, parts);
        if (params === null) continue;
        matchedPath = true;
        if (r.method !== req.method) continue;
        return await r.handler({
          notesDir: config.notesDir,
          index: options.index,
          params,
          req,
        });
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

function isApiPath(pathname: string): boolean {
  return pathname === "/api" || pathname.startsWith("/api/");
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
