/**
 * File Store (system-overview.md §1) — the only module that touches disk.
 *
 * Thin wrappers around `Deno.*` plus the slug/collision logic for turning a
 * note title into a stable filename. Everything here takes `notesDir`
 * explicitly rather than reading config, so it stays trivially testable
 * against a throwaway directory.
 *
 * Filenames are validated and branded ({@link parseFilename}) before they are
 * ever joined to a path, so a request param like `../../etc/passwd` or
 * `sub/dir.md` is rejected up front and path traversal can't happen.
 */

import { join, normalize } from "@std/path";
import { ApiError, type Filename } from "./types.ts";

const NOTE_EXT = ".md";

/**
 * Validate an untrusted string as a note filename and brand it.
 *
 * Accepts a single path segment ending in `.md` with no separators, no `..`,
 * and no leading dot. Throws {@link ApiError} 400 otherwise — this is on the
 * request path.
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
 * Turn a note title into a filesystem slug (without extension).
 *
 * Lowercase, spaces and underscores to `-`, drop anything outside
 * `[a-z0-9-]`, collapse and trim `-`. An empty result becomes `untitled`.
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
export function filenameToTitle(filename: Filename): string {
  const base = filename.slice(0, -NOTE_EXT.length).replace(/-+/g, " ").trim();
  return base.length > 0 ? base[0]!.toUpperCase() + base.slice(1) : "Untitled";
}

/** List every `*.md` file directly under `notesDir` (not recursive — v1 is flat). */
export async function listNoteFiles(notesDir: string): Promise<Filename[]> {
  const names: Filename[] = [];
  for await (const entry of Deno.readDir(notesDir)) {
    if (entry.isFile && entry.name.endsWith(NOTE_EXT)) {
      names.push(entry.name as Filename);
    }
  }
  names.sort((a, b) => a.localeCompare(b));
  return names;
}

export async function noteFileExists(
  notesDir: string,
  filename: Filename,
): Promise<boolean> {
  try {
    const stat = await Deno.stat(join(notesDir, filename));
    return stat.isFile;
  } catch (cause) {
    if (cause instanceof Deno.errors.NotFound) return false;
    throw cause;
  }
}

/** Read raw file text. Throws {@link ApiError} 404 if the note doesn't exist. */
export async function readNoteFile(
  notesDir: string,
  filename: Filename,
): Promise<string> {
  try {
    return await Deno.readTextFile(join(notesDir, filename));
  } catch (cause) {
    if (cause instanceof Deno.errors.NotFound) {
      throw new ApiError(404, `note not found: ${filename}`);
    }
    throw cause;
  }
}

/**
 * Write `content` to `filename` atomically: write a sibling temp file, then
 * rename it over the target so a reader never sees a half-written note and a
 * crash mid-write can't corrupt an existing file.
 */
export async function writeNoteFile(
  notesDir: string,
  filename: Filename,
  content: string,
): Promise<void> {
  const target = join(notesDir, filename);
  const tmp = join(notesDir, `.${filename}.${crypto.randomUUID()}.tmp`);
  try {
    await Deno.writeTextFile(tmp, content);
    await Deno.rename(tmp, target);
  } catch (cause) {
    await Deno.remove(tmp).catch(() => {});
    throw cause;
  }
}

/** Delete a note. Throws {@link ApiError} 404 if it doesn't exist. */
export async function deleteNoteFile(
  notesDir: string,
  filename: Filename,
): Promise<void> {
  try {
    await Deno.remove(join(notesDir, filename));
  } catch (cause) {
    if (cause instanceof Deno.errors.NotFound) {
      throw new ApiError(404, `note not found: ${filename}`);
    }
    throw cause;
  }
}

/**
 * Pick a free filename for a new note with the given title: `slug.md`, or
 * `slug-2.md`, `slug-3.md`, … if earlier ones are taken.
 */
export async function resolveNewFilename(
  notesDir: string,
  title: string,
): Promise<Filename> {
  const slug = slugify(title);
  for (let n = 1;; n++) {
    const candidate =
      (n === 1 ? `${slug}${NOTE_EXT}` : `${slug}-${n}${NOTE_EXT}`) as Filename;
    if (!(await noteFileExists(notesDir, candidate))) return candidate;
  }
}
