/**
 * Search Module (system-overview.md §1).
 *
 * A pure function over a snapshot of the In-Memory Index. Naive
 * case-insensitive substring matching over title + body is enough for a
 * personal vault (spec.md §9); a real inverted index is a later optimization.
 * Ranking: title matches before body-only matches, then newest first.
 */

import type { Filename, SearchResult } from "./types.ts";

export interface SearchableNote {
  readonly filename: Filename;
  readonly title: string;
  readonly tags: readonly string[];
  readonly updated: string;
  readonly body: string;
}

export function searchNotes(
  notes: Iterable<SearchableNote>,
  rawQuery: string,
): SearchResult[] {
  const query = rawQuery.trim().toLowerCase();
  if (query === "") return [];

  const ranked: { result: SearchResult; titleHit: boolean }[] = [];
  for (const note of notes) {
    const titleHit = note.title.toLowerCase().includes(query);
    const bodyIndex = note.body.toLowerCase().indexOf(query);
    if (!titleHit && bodyIndex < 0) continue;

    ranked.push({
      titleHit,
      result: {
        filename: note.filename,
        title: note.title,
        tags: note.tags,
        updated: note.updated,
        snippet: bodyIndex >= 0
          ? excerpt(note.body, bodyIndex, query.length)
          : firstLine(note.body),
      },
    });
  }

  ranked.sort((a, b) => {
    if (a.titleHit !== b.titleHit) return a.titleHit ? -1 : 1;
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

function firstLine(body: string): string {
  const line = body.split(/\r?\n/).find((l) => l.trim() !== "") ?? "";
  return line.length > 140 ? `${line.slice(0, 139)}…` : line;
}
