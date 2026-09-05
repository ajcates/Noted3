/**
 * Frontmatter Parser (system-overview.md §1).
 *
 * Pure functions over strings: split a raw note file into its YAML frontmatter
 * and markdown body, normalize a partial/missing frontmatter block into a full
 * one, and serialize back to file text. No disk access lives here.
 *
 * Tolerance is deliberate (spec.md §11): a note may have been written by hand
 * or imported with no frontmatter, a bare title, or the wrong shape for
 * `tags`. Parsing never throws on that — it extracts what it can and leaves
 * the gaps for {@link normalizeFrontmatter} to fill.
 */

import { extract } from "@std/front-matter/yaml";
import { test as hasFrontmatter } from "@std/front-matter/test";
import { stringify as stringifyYaml } from "@std/yaml";
import type { Frontmatter, RawFrontmatter } from "./types.ts";

export interface ParsedNote {
  readonly frontmatter: RawFrontmatter;
  readonly body: string;
}

/**
 * Split raw note file text into frontmatter + body.
 *
 * If there is no `---` block the whole string is the body and `frontmatter`
 * is `{}`. Malformed YAML in the block is treated the same way rather than
 * throwing, so a bad edit can still be opened and repaired.
 */
export function parseNote(raw: string): ParsedNote {
  if (!hasFrontmatter(raw)) {
    return { frontmatter: {}, body: raw };
  }
  try {
    const { attrs, body } = extract(raw);
    return { frontmatter: coerceRaw(attrs), body };
  } catch {
    // Unparseable frontmatter block — keep the file openable.
    return { frontmatter: {}, body: raw };
  }
}

/**
 * Fill in every missing/blank frontmatter field.
 *
 * - `title` falls back to `fallbackTitle` (the caller passes a title derived
 *   from the filename).
 * - `tags` is coerced to a string array; anything else becomes `[]`.
 * - `created` / `updated` fall back to `now` (an ISO 8601 string), and
 *   `updated` is never earlier than `created`.
 */
export function normalizeFrontmatter(
  raw: RawFrontmatter,
  opts: { readonly fallbackTitle: string; readonly now: string },
): Frontmatter {
  const title = raw.title?.trim() || opts.fallbackTitle;
  const tags = normalizeTags(raw.tags);
  const created = isNonEmptyString(raw.created) ? raw.created : opts.now;
  const updatedRaw = isNonEmptyString(raw.updated) ? raw.updated : opts.now;
  const updated = updatedRaw < created ? created : updatedRaw;
  return { title, tags, created, updated };
}

/**
 * Serialize normalized frontmatter + body back to note file text.
 *
 * The body is written verbatim after a blank separator line. `parseNote`
 * discards leading newlines after the closing `---`, so this blank line is
 * cosmetic and `serializeNote` → `parseNote` round-trips the body exactly.
 */
export function serializeNote(frontmatter: Frontmatter, body: string): string {
  const yaml = stringifyYaml({
    title: frontmatter.title,
    tags: [...frontmatter.tags],
    created: frontmatter.created,
    updated: frontmatter.updated,
  }).trimEnd();
  return `---\n${yaml}\n---\n\n${body}`;
}

function coerceRaw(attrs: unknown): RawFrontmatter {
  if (typeof attrs !== "object" || attrs === null) return {};
  const record = attrs as Record<string, unknown>;
  const out: {
    title?: string;
    tags?: readonly string[];
    created?: string;
    updated?: string;
  } = {};
  if (typeof record.title === "string") out.title = record.title;
  const tags = normalizeTagsOrUndefined(record.tags);
  if (tags !== undefined) out.tags = tags;
  const created = toTimestampString(record.created);
  if (created !== undefined) out.created = created;
  const updated = toTimestampString(record.updated);
  if (updated !== undefined) out.updated = updated;
  return out;
}

function normalizeTags(value: unknown): readonly string[] {
  return normalizeTagsOrUndefined(value) ?? [];
}

function normalizeTagsOrUndefined(
  value: unknown,
): readonly string[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (Array.isArray(value)) {
    return value
      .filter((t): t is string => typeof t === "string")
      .map((t) => t.trim())
      .filter((t) => t.length > 0);
  }
  if (typeof value === "string") {
    return value.split(",").map((t) => t.trim()).filter((t) => t.length > 0);
  }
  return undefined;
}

/** YAML may parse an unquoted timestamp into a `Date`; keep everything as ISO strings. */
function toTimestampString(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim() !== "") return value.trim();
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }
  return undefined;
}

function isNonEmptyString(value: string | undefined): value is string {
  return typeof value === "string" && value.trim() !== "";
}
