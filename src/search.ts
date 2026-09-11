/**
 * Search Module (system-overview.md §1).
 *
 * A pure function over a snapshot of the In-Memory Index. Naive
 * case-insensitive substring matching over title + body is enough for a
 * personal vault (spec.md §9); a real inverted index is a later optimization.
 * Ranking: title matches before body-only matches, then newest first.
 */

import type { Filename, SearchResult, SearchScope } from "./types.ts";

export interface SearchableNote {
  readonly filename: Filename;
  readonly title: string;
  readonly tags: readonly string[];
  readonly updated: string;
  readonly excerpt: string;
  readonly backlinkCount: number;
  readonly body: string;
  readonly outgoingTargets: readonly string[];
}

export function searchNotes(
  notes: Iterable<SearchableNote>,
  rawQuery: string,
  scope: SearchScope = "everything",
): SearchResult[] {
  const query = rawQuery.trim().toLowerCase();
  if (query === "") return [];

  const ranked: { result: SearchResult; rank: number }[] = [];
  for (const note of notes) {
    const titleHit = note.title.toLowerCase().includes(query);
    const bodyIndex = note.body.toLowerCase().indexOf(query);
    const tagHit = note.tags.some((tag) => tag.toLowerCase().includes(query));
    const linkHit = note.outgoingTargets.some((target) =>
      target.toLowerCase().includes(query)
    );
    const matches = scope === "titles"
      ? titleHit
      : scope === "tags"
      ? tagHit
      : scope === "links"
      ? linkHit
      : titleHit || bodyIndex >= 0 || tagHit || linkHit;
    if (!matches) continue;

    ranked.push({
      rank: titleHit ? 0 : tagHit ? 1 : linkHit ? 2 : 3,
      result: {
        filename: note.filename,
        title: note.title,
        tags: note.tags,
        updated: note.updated,
        excerpt: note.excerpt,
        backlinkCount: note.backlinkCount,
        snippet: bodyIndex >= 0
          ? excerpt(note.body, bodyIndex, query.length)
          : firstLine(note.body),
      },
    });
  }

  ranked.sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank;
    return b.result.updated.localeCompare(a.result.updated);
  });
  return ranked.map((r) => r.result);
}

/** ~140 chars of `body` centered on the match, whitespace-collapsed. */
function excerpt(body: string, matchAt: number, matchLen: number): string {
  const radius = 70;
  const start = Math.max(0, matchAt - radius);
  const end = Math.min(body.length, matchAt + matchLen + radius);
  const slice = body.slice(start, end).replace(/\s+/g, " ").trim();
  return `${start > 0 ? "…" : ""}${slice}${end < body.length ? "…" : ""}`;
}

/** ~140 chars of `body`'s first non-blank line — the generic note-card excerpt. */
export function firstLine(body: string): string {
  const line = body.split(/\r?\n/).find((l) => l.trim() !== "") ?? "";
  return line.length > 140 ? `${line.slice(0, 139)}…` : line;
}
