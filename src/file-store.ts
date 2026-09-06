/**
 * File Store (system-overview.md §1) — the only module that touches disk.
 *
 * Thin wrappers around `Deno.*`. Everything here takes `notesDir` explicitly
 * rather than reading config, so it stays trivially testable against a
 * throwaway directory. Filename validation and slug rules live in
 * `filename.ts`; callers pass an already-branded {@link Filename}.
 */

import { join } from "@std/path";
import { ApiError, type Filename } from "./types.ts";
import { NOTE_EXT, slugify } from "./filename.ts";

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
 * Move a note file. Throws {@link ApiError} 404 if `from` is missing, 409 if
 * `to` already exists (an explicit rename shouldn't silently clobber).
 */
export async function renameNoteFile(
  notesDir: string,
  from: Filename,
  to: Filename,
): Promise<void> {
  if (await noteFileExists(notesDir, to)) {
    throw new ApiError(409, `a note named ${to} already exists`);
  }
  try {
    await Deno.rename(join(notesDir, from), join(notesDir, to));
  } catch (cause) {
    if (cause instanceof Deno.errors.NotFound) {
      throw new ApiError(404, `note not found: ${from}`);
    }
    throw cause;
  }
}

/** File mtime in epoch ms, or `0` if it can't be read. */
export async function noteMtime(
  notesDir: string,
  filename: Filename,
): Promise<number> {
  try {
    return (await Deno.stat(join(notesDir, filename))).mtime?.getTime() ?? 0;
  } catch {
    return 0;
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
