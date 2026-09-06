/**
 * Markdown / Wikilink Parser (system-overview.md §1).
 *
 * Pure functions, one shared `markdown-it` instance with a custom inline rule
 * for `[[wikilink]]` (and `[[target|alias]]`) syntax:
 *
 *   - {@link extractWikilinkTargets} — the de-duplicated target list a note
 *     contributes to the In-Memory Index.
 *   - {@link renderMarkdown} — body → HTML, with each wikilink rendered as a
 *     resolved or unresolved `<a class="wikilink">` (the caller supplies the
 *     resolver, so resolution always reflects the current index).
 *   - {@link rewriteWikilinkTarget} — retarget links when a note is renamed
 *     (spec.md §4).
 *   - {@link firstWikilinkSnippet} — a line of context for the backlinks panel.
 *
 * Because extraction runs through `markdown-it`'s tokenizer, `[[x]]` inside a
 * code span or fenced code block is correctly ignored.
 */

import MarkdownIt from "markdown-it";
import type Token from "markdown-it/lib/token.mjs";
import type StateInline from "markdown-it/lib/rules_inline/state_inline.mjs";
import type Renderer from "markdown-it/lib/renderer.mjs";
import { ensureExt, stripExt } from "./filename.ts";

type RuleInline = (state: StateInline, silent: boolean) => boolean;
type RenderRule = NonNullable<Renderer["rules"][string]>;

export interface WikilinkRef {
  /** Text inside `[[…]]` before any `|alias`, trimmed. */
  readonly target: string;
  /** Text after `|`, trimmed; `""` when absent. */
  readonly alias: string;
}

/** What a resolver returns for a target that points at a real note. */
export interface ResolvedTarget {
  readonly filename: string;
  readonly title: string;
}

export type WikilinkResolver = (target: string) => ResolvedTarget | null;

const OPEN = 0x5b; // "["

const md: MarkdownIt = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: false,
});

const wikilinkRule: RuleInline = (state, silent) => {
  const { src, pos } = state;
  if (src.charCodeAt(pos) !== OPEN || src.charCodeAt(pos + 1) !== OPEN) {
    return false;
  }
  const close = src.indexOf("]]", pos + 2);
  if (close < 0) return false;
  const inner = src.slice(pos + 2, close);
  if (inner.includes("[[") || inner.includes("\n") || inner.trim() === "") {
    return false;
  }
  if (!silent) {
    const ref = splitTarget(inner);
    const token = state.push("wikilink", "", 0);
    token.meta = ref;
    token.content = inner;
  }
  state.pos = close + 2;
  return true;
};

const renderWikilink: RenderRule = (tokens, idx, _options, env) => {
  const { target, alias } = tokens[idx]!.meta as WikilinkRef;
  const resolver = (env as { resolve?: WikilinkResolver }).resolve;
  const resolved = resolver ? resolver(target) : null;
  const label = md.utils.escapeHtml(alias || target);

  if (resolved) {
    const href = `#/note/${encodeURIComponent(resolved.filename)}`;
    return `<a class="wikilink" href="${href}" data-filename="${
      md.utils.escapeHtml(resolved.filename)
    }">${label}</a>`;
  }
  const href = `#/new?title=${encodeURIComponent(target)}`;
  return `<a class="wikilink unresolved" href="${href}" data-target="${
    md.utils.escapeHtml(target)
  }">${label}</a>`;
};

md.inline.ruler.before("link", "wikilink", wikilinkRule);
md.renderer.rules.wikilink = renderWikilink;

/** Render a note body to HTML. `resolve` decides which wikilinks are live. */
export function renderMarkdown(
  body: string,
  resolve: WikilinkResolver,
): string {
  return md.render(body, { resolve });
}

/**
 * Every distinct wikilink target in `body`, in first-seen order. Targets
 * inside code are ignored (tokenizer-based). Used to build the link graph.
 */
export function extractWikilinkTargets(body: string): string[] {
  const seen = new Set<string>();
  for (const ref of walkWikilinks(body)) {
    if (!seen.has(ref.target)) seen.add(ref.target);
  }
  return [...seen];
}

/**
 * Replace wikilink targets that name `fromTarget` (either `name` or
 * `name.md`) with `toTarget`, preserving any `|alias`. Operates on raw text,
 * so — unlike extraction — it does not skip code spans; that trade-off is
 * noted in ISSUES.md and is acceptable for the rename path.
 *
 * @returns the new body and how many links changed.
 */
export function rewriteWikilinkTarget(
  body: string,
  fromTarget: string,
  toTarget: string,
): { body: string; changed: number } {
  const fromBare = stripExt(fromTarget).toLowerCase();
  let changed = 0;

  const next = body.replace(/\[\[([^\]\n]+)\]\]/g, (whole, inner: string) => {
    const pipe = inner.indexOf("|");
    const rawTarget = (pipe >= 0 ? inner.slice(0, pipe) : inner).trim();
    const aliasPart = pipe >= 0 ? inner.slice(pipe) : "";
    const bare = stripExt(rawTarget).toLowerCase();
    if (bare !== fromBare) return whole;
    changed++;
    const keepsExt = /\.md$/i.test(rawTarget);
    return `[[${
      keepsExt ? ensureExt(toTarget) : stripExt(toTarget)
    }${aliasPart}]]`;
  });

  return { body: next, changed };
}

/**
 * A one-line context snippet around the first wikilink in `body` whose target
 * satisfies `matches`, for the backlinks panel. Falls back to the first
 * non-empty line when no such link is found on its own line.
 */
export function firstWikilinkSnippet(
  body: string,
  matches: (target: string) => boolean,
): string {
  const lines = body.split(/\r?\n/);
  for (const line of lines) {
    for (const ref of walkWikilinksInLine(line)) {
      if (matches(ref.target)) return collapse(deBracket(line));
    }
  }
  const firstLine = lines.find((l) => l.trim() !== "");
  return firstLine ? collapse(deBracket(firstLine)) : "";
}

// --- internals -------------------------------------------------------------

function walkWikilinks(body: string): WikilinkRef[] {
  const refs: WikilinkRef[] = [];
  collectWikilinkTokens(md.parse(body, {}), refs);
  return refs;
}

function collectWikilinkTokens(tokens: Token[], out: WikilinkRef[]): void {
  for (const token of tokens) {
    if (token.type === "wikilink" && token.meta) {
      out.push(token.meta as WikilinkRef);
    }
    if (token.children) collectWikilinkTokens(token.children, out);
  }
}

/** Cheap regex scan of a single line — only used for snippet matching. */
function walkWikilinksInLine(line: string): WikilinkRef[] {
  const refs: WikilinkRef[] = [];
  for (const m of line.matchAll(/\[\[([^\]\n]+)\]\]/g)) {
    refs.push(splitTarget(m[1]!));
  }
  return refs;
}

function splitTarget(inner: string): WikilinkRef {
  const pipe = inner.indexOf("|");
  return {
    target: (pipe >= 0 ? inner.slice(0, pipe) : inner).trim(),
    alias: pipe >= 0 ? inner.slice(pipe + 1).trim() : "",
  };
}

/** `[[Target|Alias]]` → `Alias`, `[[Target]]` → `Target`, for readable snippets. */
function deBracket(text: string): string {
  return text.replace(/\[\[([^\]\n]+)\]\]/g, (_whole, inner: string) => {
    const pipe = inner.indexOf("|");
    return (pipe >= 0 ? inner.slice(pipe + 1) : inner).trim();
  });
}

function collapse(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > 160 ? `${flat.slice(0, 157)}…` : flat;
}
