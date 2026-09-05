/**
 * Notes API Handlers (system-overview.md §1) — one function per endpoint in
 * spec.md §5. Each takes a {@link HandlerContext} and returns a `Response`.
 *
 * M1 reads and writes straight through the File Store on every call; the
 * In-Memory Index that makes reads disk-free arrives in M3, and link parsing
 * with it. Handlers throw {@link ApiError} for anything the client did wrong;
 * the router maps those to JSON.
 */

import {
  ApiError,
  type Filename,
  type Frontmatter,
  type NoteDetail,
  type NoteSummary,
} from "./types.ts";
import {
  deleteNoteFile,
  filenameToTitle,
  listNoteFiles,
  parseFilename,
  readNoteFile,
  resolveNewFilename,
  writeNoteFile,
} from "./file-store.ts";
import {
  normalizeFrontmatter,
  parseNote,
  serializeNote,
} from "./frontmatter.ts";

export interface HandlerContext {
  readonly notesDir: string;
  /** Path params captured by the router, e.g. `{ filename: "note.md" }`. */
  readonly params: Readonly<Record<string, string>>;
  readonly req: Request;
}

export type Handler = (ctx: HandlerContext) => Promise<Response>;

/** `GET /api/notes` — summaries for the note browser, newest first. */
export const listNotes: Handler = async ({ notesDir }) => {
  const files = await listNoteFiles(notesDir);
  const summaries = await Promise.all(
    files.map(async (filename) =>
      toSummary(filename, await readNoteFile(notesDir, filename))
    ),
  );
  summaries.sort((a, b) => b.updated.localeCompare(a.updated));
  return json(summaries);
};

/** `GET /api/notes/:filename` — full content of one note. */
export const getNote: Handler = async ({ notesDir, params }) => {
  const filename = parseFilename(params.filename ?? "");
  const raw = await readNoteFile(notesDir, filename);
  return json(toDetail(filename, raw));
};

/** `POST /api/notes` — create from `{ title, body? }`; server picks the filename. */
export const createNote: Handler = async ({ notesDir, req }) => {
  const input = await readJson(req);
  const title = requireString(input, "title");
  const body = optionalString(input, "body") ?? "";

  const filename = await resolveNewFilename(notesDir, title);
  const now = new Date().toISOString();
  const frontmatter = normalizeFrontmatter({ title }, {
    fallbackTitle: title,
    now,
  });
  await writeNoteFile(notesDir, filename, serializeNote(frontmatter, body));

  return json(buildDetail(filename, frontmatter, body), 201, {
    location: `/api/notes/${filename}`,
  });
};

/**
 * `PUT /api/notes/:filename` — update content. Merges the provided fields onto
 * the existing note and bumps `updated`. (Conflict detection against a
 * client-supplied `updated` is M6, not M1.)
 */
export const updateNote: Handler = async ({ notesDir, params, req }) => {
  const filename = parseFilename(params.filename ?? "");
  const existingRaw = await readNoteFile(notesDir, filename);
  const existing = toDetail(filename, existingRaw);
  const input = await readJson(req);

  const title = optionalString(input, "title") ?? existing.title;
  const body = optionalString(input, "body") ?? existing.body;
  const tags = optionalStringArray(input, "tags") ?? existing.tags;
  const now = new Date().toISOString();

  const frontmatter: Frontmatter = {
    title,
    tags,
    created: existing.created,
    updated: now,
  };
  await writeNoteFile(notesDir, filename, serializeNote(frontmatter, body));
  return json(buildDetail(filename, frontmatter, body));
};

/** `DELETE /api/notes/:filename`. 204 on success, 404 if it was already gone. */
export const deleteNote: Handler = async ({ notesDir, params }) => {
  const filename = parseFilename(params.filename ?? "");
  await deleteNoteFile(notesDir, filename);
  return new Response(null, { status: 204 });
};

// --- projections -------------------------------------------------------------

function toSummary(filename: Filename, raw: string): NoteSummary {
  const { frontmatter } = parseAndNormalize(filename, raw);
  return {
    filename,
    title: frontmatter.title,
    tags: frontmatter.tags,
    updated: frontmatter.updated,
  };
}

function toDetail(filename: Filename, raw: string): NoteDetail {
  const { frontmatter, body } = parseAndNormalize(filename, raw);
  return buildDetail(filename, frontmatter, body);
}

function buildDetail(
  filename: Filename,
  frontmatter: Frontmatter,
  body: string,
): NoteDetail {
  return {
    filename,
    title: frontmatter.title,
    tags: frontmatter.tags,
    created: frontmatter.created,
    updated: frontmatter.updated,
    body,
  };
}

function parseAndNormalize(
  filename: Filename,
  raw: string,
): { frontmatter: Frontmatter; body: string } {
  const parsed = parseNote(raw);
  const now = new Date().toISOString();
  const frontmatter = normalizeFrontmatter(parsed.frontmatter, {
    fallbackTitle: filenameToTitle(filename),
    now,
  });
  return { frontmatter, body: parsed.body };
}

// --- request/response helpers ---------------------------------------------------

function json(
  data: unknown,
  status = 200,
  extraHeaders: Readonly<Record<string, string>> = {},
): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...extraHeaders,
    },
  });
}

async function readJson(req: Request): Promise<Record<string, unknown>> {
  let parsed: unknown;
  try {
    parsed = await req.json();
  } catch {
    throw new ApiError(400, "request body must be valid JSON");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new ApiError(400, "request body must be a JSON object");
  }
  return parsed as Record<string, unknown>;
}

function requireString(input: Record<string, unknown>, key: string): string {
  const value = input[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new ApiError(
      400,
      `"${key}" is required and must be a non-empty string`,
    );
  }
  return value;
}

function optionalString(
  input: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = input[key];
  if (value === undefined) return undefined;
  if (typeof value !== "string") {
    throw new ApiError(400, `"${key}" must be a string`);
  }
  return value;
}

function optionalStringArray(
  input: Record<string, unknown>,
  key: string,
): readonly string[] | undefined {
  const value = input[key];
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.some((v) => typeof v !== "string")) {
    throw new ApiError(400, `"${key}" must be an array of strings`);
  }
  return value as string[];
}
