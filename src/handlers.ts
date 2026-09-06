/**
 * Notes API Handlers (system-overview.md §1) — one function per endpoint in
 * spec.md §5. Each takes a {@link HandlerContext} and returns a `Response`.
 *
 * Reads that only need metadata (`GET /api/notes`) come straight from the
 * In-Memory Index. Reads that need the body (`GET /api/notes/:filename`,
 * backlinks) still touch disk. Every write updates both disk and the index in
 * the same handler. Handlers throw {@link ApiError} for anything the client
 * did wrong; the router maps those to JSON.
 */

import {
  ApiError,
  type Backlink,
  type Filename,
  type Frontmatter,
  type NoteDetail,
} from "./types.ts";
import {
  deleteNoteFile,
  filenameToTitle,
  noteMtime,
  parseFilename,
  readNoteFile,
  renameNoteFile,
  resolveNewFilename,
  writeNoteFile,
} from "./file-store.ts";
import {
  normalizeFrontmatter,
  parseNote,
  serializeNote,
} from "./frontmatter.ts";
import {
  firstWikilinkSnippet,
  renderMarkdown,
  rewriteWikilinkTarget,
} from "./markdown.ts";
import type { NoteIndex } from "./note-index.ts";

export interface HandlerContext {
  readonly notesDir: string;
  readonly index: NoteIndex;
  /** Path params captured by the router, e.g. `{ filename: "note.md" }`. */
  readonly params: Readonly<Record<string, string>>;
  readonly req: Request;
}

export type Handler = (ctx: HandlerContext) => Promise<Response>;

/** `GET /api/notes` — summaries for the note browser, newest first (from the index). */
export const listNotes: Handler = (ctx) =>
  Promise.resolve(json(ctx.index.list()));

/** `GET /api/notes/:filename` — full content of one note, plus outgoing links. */
export const getNote: Handler = async ({ notesDir, index, params }) => {
  const filename = parseFilename(params.filename ?? "");
  const raw = await readNoteFile(notesDir, filename);
  return json(toDetail(filename, raw, index));
};

/** `GET /api/notes/:filename/backlinks` — notes whose links resolve to this one. */
export const getBacklinks: Handler = async ({ notesDir, index, params }) => {
  const filename = parseFilename(params.filename ?? "");
  if (!index.has(filename)) {
    throw new ApiError(404, `note not found: ${filename}`);
  }

  const linkers = index.backlinkFilenames(filename);
  const backlinks: Backlink[] = await Promise.all(
    linkers.map(async (linker): Promise<Backlink> => {
      const body = parseNote(await readNoteFile(notesDir, linker)).body;
      return {
        filename: linker,
        title: index.titleOf(linker) ?? filenameToTitle(linker),
        snippet: firstWikilinkSnippet(
          body,
          (target) => index.resolve(target)?.filename === filename,
        ),
      };
    }),
  );
  backlinks.sort((a, b) => a.title.localeCompare(b.title));
  return json(backlinks);
};

/** `POST /api/notes` — create from `{ title, body? }`; server picks the filename. */
export const createNote: Handler = async ({ notesDir, index, req }) => {
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
  index.upsert(filename, {
    frontmatter,
    body,
    mtime: await noteMtime(notesDir, filename),
  });

  return json(buildDetail(filename, frontmatter, body, index), 201, {
    location: `/api/notes/${filename}`,
  });
};

/**
 * `PUT /api/notes/:filename` — update content. Merges the provided fields onto
 * the existing note and bumps `updated`. (Conflict detection against a
 * client-supplied `updated` is M6, not M1.)
 */
export const updateNote: Handler = async ({ notesDir, index, params, req }) => {
  const filename = parseFilename(params.filename ?? "");
  const existing = toDetail(
    filename,
    await readNoteFile(notesDir, filename),
    index,
  );
  const input = await readJson(req);

  const title = optionalString(input, "title") ?? existing.title;
  const body = optionalString(input, "body") ?? existing.body;
  const tags = optionalStringArray(input, "tags") ?? existing.tags;

  const frontmatter: Frontmatter = {
    title,
    tags,
    created: existing.created,
    updated: new Date().toISOString(),
  };
  await writeNoteFile(notesDir, filename, serializeNote(frontmatter, body));
  index.upsert(filename, {
    frontmatter,
    body,
    mtime: await noteMtime(notesDir, filename),
  });
  return json(buildDetail(filename, frontmatter, body, index));
};

/**
 * `PATCH /api/notes/:filename` with `{ filename: "new-name.md" }` — rename a
 * note. Moves the file, then rewrites incoming `[[wikilinks]]` that referenced
 * it *by filename* in every note that linked to it (spec.md §4); title-form
 * links keep working untouched because the title doesn't change.
 */
export const renameNote: Handler = async ({ notesDir, index, params, req }) => {
  const from = parseFilename(params.filename ?? "");
  if (!index.has(from)) throw new ApiError(404, `note not found: ${from}`);

  const input = await readJson(req);
  const to = parseFilename(requireString(input, "filename"));
  if (to === from) {
    throw new ApiError(400, "new filename is the same as the old one");
  }

  // Capture the linkers before the move changes the graph.
  const linkers = index.backlinkFilenames(from);

  await renameNoteFile(notesDir, from, to);
  index.rename(from, to);

  const fromBare = from.replace(/\.md$/i, "");
  const toBare = to.replace(/\.md$/i, "");
  for (const linker of linkers) {
    const parsed = parseNote(await readNoteFile(notesDir, linker));
    const { body: rewrittenBody, changed } = rewriteWikilinkTarget(
      parsed.body,
      fromBare,
      toBare,
    );
    if (changed === 0) continue;
    const fm = normalizeFrontmatter(parsed.frontmatter, {
      fallbackTitle: filenameToTitle(linker),
      now: new Date().toISOString(),
    });
    // A mechanical link fix — do not bump the linker's `updated`.
    await writeNoteFile(notesDir, linker, serializeNote(fm, rewrittenBody));
    index.upsert(linker, {
      frontmatter: fm,
      body: rewrittenBody,
      mtime: await noteMtime(notesDir, linker),
    });
  }

  return json(toDetail(to, await readNoteFile(notesDir, to), index));
};

/** `DELETE /api/notes/:filename`. 204 on success, 404 if it was already gone. */
export const deleteNote: Handler = async ({ notesDir, index, params }) => {
  const filename = parseFilename(params.filename ?? "");
  await deleteNoteFile(notesDir, filename);
  index.remove(filename);
  return new Response(null, { status: 204 });
};

// --- projections -----------------------------------------------------------

function toDetail(
  filename: Filename,
  raw: string,
  index: NoteIndex,
): NoteDetail {
  const parsed = parseNote(raw);
  const frontmatter = normalizeFrontmatter(parsed.frontmatter, {
    fallbackTitle: filenameToTitle(filename),
    now: new Date().toISOString(),
  });
  return buildDetail(filename, frontmatter, parsed.body, index);
}

function buildDetail(
  filename: Filename,
  frontmatter: Frontmatter,
  body: string,
  index: NoteIndex,
): NoteDetail {
  return {
    filename,
    title: frontmatter.title,
    tags: frontmatter.tags,
    created: frontmatter.created,
    updated: frontmatter.updated,
    body,
    links: index.outgoingLinksFor(body),
    html: renderMarkdown(body, (target) => index.resolve(target)),
  };
}

// --- request/response helpers --------------------------------------------------

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
