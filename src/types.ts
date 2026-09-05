/**
 * Shared types for the noted server.
 *
 * Kept dependency-free and free of I/O so every other module can import it
 * without pulling in Deno APIs. See notes/development.md §1 for the language
 * conventions this file leans on (branded types, `readonly` by default).
 */

declare const filenameBrand: unique symbol;

/**
 * A note's on-disk filename, e.g. `my-note.md`. Branded so an arbitrary
 * `string` can't be passed where a validated filename is expected — callers
 * must go through {@link import("./file-store.ts").parseFilename}.
 */
export type Filename = string & { readonly [filenameBrand]: true };

/** Fully-populated frontmatter block. Every field is present after normalization. */
export interface Frontmatter {
  readonly title: string;
  readonly tags: readonly string[];
  /** ISO 8601 timestamp. */
  readonly created: string;
  /** ISO 8601 timestamp. */
  readonly updated: string;
}

/**
 * Frontmatter as it comes off disk — any field may be missing or malformed,
 * because a note may have been created by hand or imported (spec.md §11).
 */
export interface RawFrontmatter {
  readonly title?: string;
  readonly tags?: readonly string[];
  readonly created?: string;
  readonly updated?: string;
}

/** A parsed note: normalized frontmatter plus the markdown body. */
export interface Note {
  readonly filename: Filename;
  readonly frontmatter: Frontmatter;
  readonly body: string;
}

/** The list-view projection returned by `GET /api/notes`. */
export interface NoteSummary {
  readonly filename: Filename;
  readonly title: string;
  readonly tags: readonly string[];
  readonly updated: string;
}

/** The full-note projection returned by `GET /api/notes/:filename`. */
export interface NoteDetail extends NoteSummary {
  readonly created: string;
  readonly body: string;
}

/** Runtime configuration, resolved once at boot from the environment. */
export interface Config {
  readonly notesDir: string;
  readonly port: number;
  readonly authToken: string;
}

/**
 * An error with an HTTP status attached. Handlers throw these; the router
 * turns them into JSON error responses. Anything else that escapes a handler
 * becomes a 500.
 */
export class ApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}
