/**
 * Filename & slug rules — pure, no I/O.
 *
 * The one home for how a note title becomes a stable on-disk filename and back.
 * `spec.md` §11 flags the slug scheme as risky to change once a vault exists,
 * so every rule lives here rather than scattered across the File Store, the
 * index, the markdown parser, and the handlers.
 */

import { normalize } from "@std/path";
import { ApiError, type Filename } from "./types.ts";

export const NOTE_EXT = ".md";

/**
 * Validate an untrusted string as a note filename and brand it.
 *
 * Accepts a single path segment ending in `.md` with no separators, no `..`,
 * and no leading dot. Throws {@link ApiError} 400 otherwise — this runs on the
 * request path, so path traversal (`../../etc/passwd`, `sub/dir.md`) is
 * rejected before the value is ever joined to a directory.
 */
export function parseFilename(value: string): Filename {
  const name = value.trim();
  if (
    name === "" ||
    !name.endsWith(NOTE_EXT) ||
    name.length === NOTE_EXT.length ||
    name.includes("/") ||
    name.includes("\\") ||
    name.includes("\0") ||
    name.startsWith(".") ||
    name.includes("..") ||
    normalize(name) !== name
  ) {
    throw new ApiError(400, `invalid filename: ${value}`);
  }
  return name as Filename;
}

/**
 * Turn a note title into a filesystem slug (without extension): lowercase,
 * spaces and underscores to `-`, drop anything outside `[a-z0-9-]`, collapse
 * and trim `-`. An empty result becomes `untitled`.
 */
export function slugify(title: string): string {
  // NFKD splits accented letters into base + combining mark; the
  // `[^a-z0-9-]` pass below then drops the marks, so "café" → "cafe".
  const slug = title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]+/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return slug || "untitled";
}

/** Best-effort inverse of {@link slugify}, for backfilling a missing title. */
export function filenameToTitle(filename: string): string {
  const base = stripExt(filename).replace(/-+/g, " ").trim();
  return base.length > 0 ? base[0]!.toUpperCase() + base.slice(1) : "Untitled";
}

/** Drop a trailing `.md` (case-insensitive) if present. */
export function stripExt(name: string): string {
  return name.trim().replace(/\.md$/i, "");
}

/** Ensure the name ends in `.md` (adds it if missing). */
export function ensureExt(name: string): string {
  const trimmed = name.trim();
  return /\.md$/i.test(trimmed) ? trimmed : `${trimmed}${NOTE_EXT}`;
}
