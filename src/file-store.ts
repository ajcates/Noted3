/**
 * File Store (system-overview.md §1) — the only module that touches disk.
 *
 * Thin wrappers around `Deno.*`. Everything here takes `notesDir` explicitly
 * rather than reading config, so it stays trivially testable against a
 * throwaway directory. Filename validation and slug rules live in
 * `filename.ts`; callers pass an already-branded {@link Filename}.
 */

import { basename, dirname, join } from "@std/path";
import { ApiError, type Filename, type FolderPath } from "./types.ts";
import { NOTE_EXT, slugify } from "./filename.ts";

/**
 * List every `*.md` file in the vault recursively. Paths are returned relative
 * to `notesDir`, with `/` separators so they are stable across platforms.
 * Hidden directories (especially `.git`) and symlinks are deliberately not
 * traversed.
 */
export async function listNoteFiles(notesDir: string): Promise<Filename[]> {
  const names: Filename[] = [];
  async function visit(directory: string, prefix: string): Promise<void> {
    for await (const entry of Deno.readDir(directory)) {
      if (entry.name.startsWith(".")) continue;
      const relative = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
      if (entry.isDirectory) {
        await visit(join(directory, entry.name), relative);
      } else if (entry.isFile && entry.name.endsWith(NOTE_EXT)) {
        names.push(relative as Filename);
      }
    }
  }
  await visit(notesDir, "");
  names.sort((a, b) => a.localeCompare(b));
  return names;
}

/** List visible, real directories in the vault, including empty folders. */
export async function listFolders(notesDir: string): Promise<FolderPath[]> {
  const paths: FolderPath[] = [];
  async function visit(directory: string, prefix: string): Promise<void> {
    for await (const entry of Deno.readDir(directory)) {
      if (entry.name.startsWith(".") || !entry.isDirectory) continue;
      const relative = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
      paths.push(relative as FolderPath);
      await visit(join(directory, entry.name), relative);
    }
  }
  await visit(notesDir, "");
  paths.sort((a, b) => a.localeCompare(b));
  return paths;
}

/** Create exactly one folder. Its parent must already exist. */
export async function createFolder(
  notesDir: string,
  path: FolderPath,
): Promise<void> {
  try {
    await Deno.mkdir(join(notesDir, path));
  } catch (cause) {
    if (cause instanceof Deno.errors.AlreadyExists) {
      throw new ApiError(409, `a file or folder named ${path} already exists`);
    }
    if (cause instanceof Deno.errors.NotFound) {
      throw new ApiError(404, `parent folder not found: ${path}`);
    }
    throw cause;
  }
}

/** Rename or move a folder without overwriting an existing destination. */
export async function renameFolder(
  notesDir: string,
  from: FolderPath,
  to: FolderPath,
): Promise<void> {
  try {
    const source = await Deno.lstat(join(notesDir, from));
    if (!source.isDirectory || source.isSymlink) {
      throw new ApiError(404, `folder not found: ${from}`);
    }
  } catch (cause) {
    if (cause instanceof ApiError) throw cause;
    if (cause instanceof Deno.errors.NotFound) {
      throw new ApiError(404, `folder not found: ${from}`);
    }
    throw cause;
  }

  try {
    await Deno.lstat(join(notesDir, to));
    throw new ApiError(409, `a file or folder named ${to} already exists`);
  } catch (cause) {
    if (cause instanceof ApiError) throw cause;
    if (!(cause instanceof Deno.errors.NotFound)) throw cause;
  }

  try {
    await Deno.rename(join(notesDir, from), join(notesDir, to));
  } catch (cause) {
    if (cause instanceof Deno.errors.NotFound) {
      throw new ApiError(404, `destination parent not found: ${to}`);
    }
    throw cause;
  }
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
  const parent = dirname(target);
  await Deno.mkdir(parent, { recursive: true });
  const tmp = join(parent, `.${basename(filename)}.${crypto.randomUUID()}.tmp`);
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
    await Deno.mkdir(dirname(join(notesDir, to)), { recursive: true });
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
