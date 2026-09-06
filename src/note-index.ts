/**
 * In-Memory Index (system-overview.md §1) — the one place mutable shared
 * state lives on the server.
 *
 * Built at boot by scanning `NOTES_DIR` and kept current as notes are written,
 * renamed, and deleted. It holds, per note, the normalized frontmatter, the
 * list of outgoing `[[wikilink]]` targets, and the file mtime; from those it
 * derives the title lookup used for link resolution, the backlink graph, and
 * the tag map. It is a cache: `NoteIndex.build` can always rebuild it from
 * disk, and nothing here is a source of truth (spec.md §2).
 *
 * The derived maps are recomputed in full after every mutation. For a
 * personal-scale vault that is a few milliseconds and removes a whole class of
 * incremental-update bugs — adding a note can resolve links in any other note,
 * so partial updates are deceptively hard to get right.
 */

import { join } from "@std/path";
import type {
  Filename,
  Frontmatter,
  NoteSummary,
  OutgoingLink,
  SearchResult,
  TagCount,
} from "./types.ts";
import { filenameToTitle, listNoteFiles, slugify } from "./file-store.ts";
import { normalizeFrontmatter, parseNote } from "./frontmatter.ts";
import { extractWikilinkTargets } from "./markdown.ts";
import { searchNotes } from "./search.ts";

interface IndexEntry {
  readonly filename: Filename;
  readonly frontmatter: Frontmatter;
  readonly outgoingTargets: readonly string[];
  /** Kept so search can run as a pure function over the index snapshot. */
  readonly body: string;
  readonly mtime: number;
}

export interface UpsertInput {
  readonly frontmatter: Frontmatter;
  readonly body: string;
  readonly mtime: number;
}

export class NoteIndex {
  #entries = new Map<Filename, IndexEntry>();

  // Derived — cleared and rebuilt by #rebuildDerived().
  #byTitleLower = new Map<string, Filename>();
  #backlinks = new Map<Filename, Filename[]>();
  #tags = new Map<string, Filename[]>(); // consumed by the M4 Tag Browser

  /** Scan `notesDir` and build a fresh index. */
  static async build(notesDir: string): Promise<NoteIndex> {
    const index = new NoteIndex();
    for (const filename of await listNoteFiles(notesDir)) {
      const path = join(notesDir, filename);
      const raw = await Deno.readTextFile(path);
      const mtime = (await Deno.stat(path)).mtime?.getTime() ?? 0;
      index.#entries.set(filename, toEntry(filename, raw, mtime));
    }
    index.#rebuildDerived();
    return index;
  }

  /** Add or replace a note's entry (called after a successful write). */
  upsert(filename: Filename, input: UpsertInput): void {
    this.#entries.set(filename, {
      filename,
      frontmatter: input.frontmatter,
      outgoingTargets: extractWikilinkTargets(input.body),
      body: input.body,
      mtime: input.mtime,
    });
    this.#rebuildDerived();
  }

  /** Drop a note's entry (called after a successful delete). Links to it in
   * other notes are left in place — they simply stop resolving. */
  remove(filename: Filename): void {
    this.#entries.delete(filename);
    this.#rebuildDerived();
  }

  /** Move an entry from one filename to another, keeping its parsed data. */
  rename(from: Filename, to: Filename): void {
    const entry = this.#entries.get(from);
    if (!entry) return;
    this.#entries.delete(from);
    this.#entries.set(to, { ...entry, filename: to });
    this.#rebuildDerived();
  }

  has(filename: Filename): boolean {
    return this.#entries.has(filename);
  }

  /** The indexed title for a note, or `null` if it isn't indexed. */
  titleOf(filename: Filename): string | null {
    return this.#entries.get(filename)?.frontmatter.title ?? null;
  }

  /** Note summaries for `GET /api/notes`, newest first — served without disk I/O. */
  list(): NoteSummary[] {
    return [...this.#entries.values()]
      .map((e) => ({
        filename: e.filename,
        title: e.frontmatter.title,
        tags: e.frontmatter.tags,
        updated: e.frontmatter.updated,
      }))
      .sort((a, b) => b.updated.localeCompare(a.updated));
  }

  /**
   * Resolve a wikilink target to a note. Tries, in order: the target as a
   * filename (`name` or `name.md`), an exact case-insensitive title match,
   * then the slug of the target as a filename.
   */
  resolve(target: string): { filename: Filename; title: string } | null {
    const trimmed = target.trim();

    const asFile = ensureMd(trimmed) as Filename;
    const byFile = this.#entries.get(asFile);
    if (byFile) return { filename: asFile, title: byFile.frontmatter.title };

    const byTitle = this.#byTitleLower.get(trimmed.toLowerCase());
    if (byTitle) {
      return {
        filename: byTitle,
        title: this.#entries.get(byTitle)!.frontmatter.title,
      };
    }

    const bySlug = `${slugify(trimmed)}.md` as Filename;
    const slugEntry = this.#entries.get(bySlug);
    if (slugEntry) {
      return { filename: bySlug, title: slugEntry.frontmatter.title };
    }

    return null;
  }

  /**
   * Outgoing links for a body, each resolved against the current index.
   * Takes the body (not a filename) so the result always matches the exact
   * text the caller is about to return, even if the on-disk file has drifted
   * from the indexed entry.
   */
  outgoingLinksFor(body: string): OutgoingLink[] {
    return extractWikilinkTargets(body).map((target) => {
      const hit = this.resolve(target);
      return {
        target,
        resolved: hit !== null,
        filename: hit?.filename ?? null,
        title: hit?.title ?? null,
      };
    });
  }

  /** Filenames of notes whose links currently resolve to `filename`. */
  backlinkFilenames(filename: Filename): Filename[] {
    return this.#backlinks.get(filename) ?? [];
  }

  /** Naive title+body substring search over the current snapshot. */
  search(query: string): SearchResult[] {
    return searchNotes(
      [...this.#entries.values()].map((e) => ({
        filename: e.filename,
        title: e.frontmatter.title,
        tags: e.frontmatter.tags,
        updated: e.frontmatter.updated,
        body: e.body,
      })),
      query,
    );
  }

  /** All tags with their note counts, alphabetical. */
  tagCounts(): TagCount[] {
    return [...this.#tags.entries()]
      .map(([tag, filenames]) => ({ tag, count: filenames.length }))
      .sort((a, b) => a.tag.localeCompare(b.tag));
  }

  /** Summaries of notes carrying `tag`, newest first. */
  notesForTag(tag: string): NoteSummary[] {
    const filenames = new Set(this.#tags.get(tag) ?? []);
    return this.list().filter((s) => filenames.has(s.filename));
  }

  #rebuildDerived(): void {
    this.#byTitleLower.clear();
    this.#backlinks.clear();
    this.#tags.clear();

    // Stable order so title/tag "first wins" is deterministic.
    const entries = [...this.#entries.values()].sort((a, b) =>
      a.filename.localeCompare(b.filename)
    );

    for (const entry of entries) {
      const titleKey = entry.frontmatter.title.trim().toLowerCase();
      if (titleKey !== "" && !this.#byTitleLower.has(titleKey)) {
        this.#byTitleLower.set(titleKey, entry.filename);
      }
      for (const tag of new Set(entry.frontmatter.tags)) {
        pushInto(this.#tags, tag, entry.filename);
      }
    }

    // Second pass: resolution needs the complete title map above.
    for (const entry of entries) {
      const seen = new Set<Filename>();
      for (const target of entry.outgoingTargets) {
        const hit = this.resolve(target);
        if (!hit || seen.has(hit.filename)) continue;
        seen.add(hit.filename);
        pushInto(this.#backlinks, hit.filename, entry.filename);
      }
    }
  }
}

function pushInto<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

function toEntry(filename: Filename, raw: string, mtime: number): IndexEntry {
  const parsed = parseNote(raw);
  const frontmatter = normalizeFrontmatter(parsed.frontmatter, {
    fallbackTitle: filenameToTitle(filename),
    now: new Date(mtime || Date.now()).toISOString(),
  });
  return {
    filename,
    frontmatter,
    outgoingTargets: extractWikilinkTargets(parsed.body),
    body: parsed.body,
    mtime,
  };
}

function ensureMd(name: string): string {
  return /\.md$/i.test(name) ? name : `${name}.md`;
}
