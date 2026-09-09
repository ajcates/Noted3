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
  noteMtime,
  readNoteFile,
  renameNoteFile,
  resolveNewFilename,
  writeNoteFile,
} from "./file-store.ts";
import { filenameToTitle, parseFilename, stripExt } from "./filename.ts";
import { firstLine } from "./search.ts";
import {
  json,
  optionalString,
  optionalStringArray,
  readJsonObject,
  requireString,
} from "./http.ts";
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

export type Handler = (ctx: HandlerContext) => Response | Promise<Response>;

/** `GET /api/notes` — summaries for the note browser, newest first (from the index). */
export const listNotes: Handler = (ctx) => json(ctx.index.list());

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
  const input = await readJsonObject(req);
  const title = requireString(input, "title");
  const body = optionalString(input, "body") ?? "";

  const filename = await resolveNewFilename(notesDir, title);
  const now = new Date().toISOString();
  const frontmatter = normalizeFrontmatter({ title }, {
    fallbackTitle: title,
    now,
  });
  await writeNoteAndIndex(notesDir, index, filename, frontmatter, body);

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
  const input = await readJsonObject(req);

  const frontmatter: Frontmatter = {
    title: mergedTitle(optionalString(input, "title"), existing.title),
    tags: optionalStringArray(input, "tags") ?? existing.tags,
    created: existing.created,
    updated: new Date().toISOString(),
  };
  const body = optionalString(input, "body") ?? existing.body;

  await writeNoteAndIndex(notesDir, index, filename, frontmatter, body);
  return json(buildDetail(filename, frontmatter, body, index));
};

/** Apply a PUT's `title` field: absent → keep current; present-but-blank → 400. */
function mergedTitle(provided: string | undefined, current: string): string {
  if (provided === undefined) return current;
  const trimmed = provided.trim();
  if (trimmed === "") throw new ApiError(400, '"title" must not be blank');
  return trimmed;
}

/**
 * `PATCH /api/notes/:filename` with `{ filename: "new-name.md" }` — rename a
 * note. Moves the file, then rewrites incoming `[[wikilinks]]` that referenced
 * it *by filename* in every note that linked to it (spec.md §4); title-form
 * links keep working untouched because the title doesn't change.
 */
export const renameNote: Handler = async ({ notesDir, index, params, req }) => {
  const from = parseFilename(params.filename ?? "");
  if (!index.has(from)) throw new ApiError(404, `note not found: ${from}`);

  const input = await readJsonObject(req);
  const to = parseFilename(requireString(input, "filename"));
  if (to === from) {
    throw new ApiError(400, "new filename is the same as the old one");
  }

  // Capture the linkers before the move changes the graph.
  const linkers = index.backlinkFilenames(from);

  await renameNoteFile(notesDir, from, to);
  index.rename(from, to);

  const fromBare = stripExt(from);
  const toBare = stripExt(to);
  for (const linker of linkers) {
    const parsed = parseNote(await readNoteFile(notesDir, linker));
    const { body: rewrittenBody, changed } = rewriteWikilinkTarget(
      parsed.body,
      fromBare,
      toBare,
    );
    if (changed === 0) continue;
    // A mechanical link fix — keep the linker's existing frontmatter (its
    // `updated` is not bumped).
    const fm = normalizeFrontmatter(parsed.frontmatter, {
      fallbackTitle: filenameToTitle(linker),
      now: new Date().toISOString(),
    });
    await writeNoteAndIndex(notesDir, index, linker, fm, rewrittenBody);
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

/** `GET /api/search?q=` — naive title+body search over the index. */
export const search: Handler = ({ index, req }) =>
  json(index.search(new URL(req.url).searchParams.get("q") ?? ""));

/** `GET /api/tags` — every tag with its note count. */
export const listTags: Handler = ({ index }) => json(index.tagCounts());

/** `GET /api/tags/:tag` — summaries of notes carrying `:tag` (empty array if none). */
export const notesByTag: Handler = ({ index, params }) =>
  json(index.notesForTag(params.tag ?? ""));

// --- write path ----------------------------------------------------------------

/**
 * Serialize + write a note, then reflect it in the index — the one place the
 * two stay in sync, so no handler can update disk and forget the index.
 */
async function writeNoteAndIndex(
  notesDir: string,
  index: NoteIndex,
  filename: Filename,
  frontmatter: Frontmatter,
  body: string,
): Promise<void> {
  await writeNoteFile(notesDir, filename, serializeNote(frontmatter, body));
  index.upsert(filename, {
    frontmatter,
    body,
    mtime: await noteMtime(notesDir, filename),
  });
}

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
    snippet: firstLine(body),
    backlinkCount: index.backlinkFilenames(filename).length,
    body,
    links: index.outgoingLinksFor(body),
    html: renderMarkdown(body, (target) => index.resolve(target)),
  };
}
