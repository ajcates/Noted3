/**
 * Filename & slug rules — pure, no I/O.
 *
 * The one home for how a note title becomes a stable on-disk filename and back.
 * `spec.md` §11 flags the slug scheme as risky to change once a vault exists,
 * so every rule lives here rather than scattered across the File Store, the
 * index, the markdown parser, and the handlers.
 */

import { basename, normalize } from "@std/path/posix";
import { ApiError, type Filename, type FolderPath } from "./types.ts";

export const NOTE_EXT = ".md";

/** Whether a value is a normalized, visible, vault-relative POSIX path. */
function isSafeRelativePath(name: string): boolean {
  const segments = name.split("/");
  return name !== "" &&
    !name.includes("\\") &&
    !name.includes("\0") &&
    !name.startsWith("/") &&
    normalize(name) === name &&
    !segments.some((segment) =>
      segment === "" || segment === "." || segment === ".." ||
      segment.startsWith(".")
    );
}

/**
 * Validate an untrusted string as a note filename and brand it.
 *
 * Accepts a safe, vault-relative POSIX path ending in `.md`. Nested path
 * segments are how folders are represented; empty, hidden, current/parent,
 * backslash, and absolute segments are rejected before the value is ever
 * joined to the vault directory.
 */
export function parseFilename(value: string): Filename {
  const name = value.trim();
  if (
    !isSafeRelativePath(name) ||
    !name.endsWith(NOTE_EXT) ||
    basename(name).length === NOTE_EXT.length
  ) {
    throw new ApiError(400, `invalid filename: ${value}`);
  }
  return name as Filename;
}

/** Validate and brand a non-empty vault-relative folder path. */
export function parseFolderPath(value: string): FolderPath {
  const path = value.trim();
  if (!isSafeRelativePath(path)) {
    throw new ApiError(400, `invalid folder path: ${value}`);
  }
  return path as FolderPath;
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
  const base = stripExt(basename(filename)).replace(/-+/g, " ").trim();
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
