// @ts-check
/**
 * CodeMirror 6 wiring for the Editor View (system-overview.md §1, spec.md §6).
 *
 * `createMarkdownEditor` returns a configured `EditorView` plus a `destroy`.
 * It bundles:
 *   - the markdown language + a highlight style (headings bigger, bold/italic,
 *     monospace code, quiet links);
 *   - **syntax de-emphasis** — markdown punctuation (`#`, `*`, `` ` ``, `>`,
 *     list bullets, link brackets/URLs) is hidden on every line except the one
 *     the cursor is on, where it shows dimmed;
 *   - a light `[[wikilink]]` accent (colour only — brackets stay visible);
 *   - **wikilink autocomplete** — typing `[[` opens a title-filtered list,
 *     with a "Create …" entry that fires `onCreateNote`.
 *
 * CodeMirror packages load as ES modules through the import map in index.html
 * (vendored under /vendor/codemirror/); `deno check` resolves the same names
 * to npm for types.
 */

import { EditorState, RangeSetBuilder } from "@codemirror/state";
import {
  Decoration,
  drawSelection,
  EditorView,
  keymap,
  ViewPlugin,
} from "@codemirror/view";
import {
  defaultKeymap,
  history,
  historyKeymap,
  indentWithTab,
} from "@codemirror/commands";
import {
  HighlightStyle,
  syntaxHighlighting,
  syntaxTree,
} from "@codemirror/language";
import { markdown } from "@codemirror/lang-markdown";
import { autocompletion, completionKeymap } from "@codemirror/autocomplete";
import { tags as t } from "@lezer/highlight";

const highlightStyle = HighlightStyle.define([
  { tag: t.heading1, fontSize: "1.5em", fontWeight: "700", lineHeight: "1.3" },
  { tag: t.heading2, fontSize: "1.3em", fontWeight: "700", lineHeight: "1.3" },
  { tag: [t.heading3, t.heading4, t.heading5, t.heading6], fontWeight: "700" },
  { tag: t.strong, fontWeight: "700" },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: t.strikethrough, textDecoration: "line-through" },
  {
    tag: [t.monospace],
    fontFamily: "var(--font-source, ui-monospace, monospace)",
    background: "var(--surface-container-high)",
  },
  { tag: t.link, color: "var(--primary)" },
  { tag: t.url, color: "var(--primary)" },
  { tag: t.quote, color: "var(--on-surface-variant)", fontStyle: "italic" },
  { tag: t.list, color: "var(--on-surface-variant)" },
]);

/**
 * Node names (from @lezer/markdown) that are pure syntax punctuation.
 * `LinkMark`/`URL` are deliberately left out: markdown links overlap the
 * `[[wikilink]]` syntax, and hiding one bracket of `[[…]]` looks broken —
 * wikilinks are handled by {@link wikilinkAccent} instead.
 */
const MARK_NODES = new Set([
  "HeaderMark",
  "QuoteMark",
  "ListMark",
  "EmphasisMark",
  "StrongEmphasisMark",
  "StrikethroughMark",
  "CodeMark",
]);

/**
 * Hide markdown punctuation everywhere except the cursor's line(s); dim it
 * there. Rebuilt whenever the doc, selection, or viewport changes.
 */
const deEmphasize = ViewPlugin.fromClass(
  class {
    /** @param {EditorView} view */
    constructor(view) {
      this.decorations = this.#build(view);
    }
    /** @param {import("@codemirror/view").ViewUpdate} update */
    update(update) {
      if (update.docChanged || update.selectionSet || update.viewportChanged) {
        this.decorations = this.#build(update.view);
      }
    }
    /** @param {EditorView} view */
    #build(view) {
      const activeLines = new Set();
      for (const r of view.state.selection.ranges) {
        activeLines.add(view.state.doc.lineAt(r.from).number);
        activeLines.add(view.state.doc.lineAt(r.to).number);
      }
      /** @type {RangeSetBuilder<Decoration>} */
      const builder = new RangeSetBuilder();
      for (const { from, to } of view.visibleRanges) {
        syntaxTree(view.state).iterate({
          from,
          to,
          enter: (node) => {
            if (!MARK_NODES.has(node.name)) return;
            const onActiveLine = activeLines.has(
              view.state.doc.lineAt(node.from).number,
            );
            let end = node.to;
            // Eat one trailing space so hidden "## " doesn't leave an indent.
            if (
              !onActiveLine &&
              (node.name === "HeaderMark" || node.name === "QuoteMark" ||
                node.name === "ListMark") &&
              view.state.doc.sliceString(end, end + 1) === " "
            ) {
              end += 1;
            }
            builder.add(
              node.from,
              end,
              onActiveLine
                ? Decoration.mark({ class: "cm-md-mark" })
                : Decoration.replace({}),
            );
          },
        });
      }
      return builder.finish();
    }
  },
  { decorations: (v) => v.decorations },
);

/** Colour `[[wikilink]]` spans (brackets stay visible). */
const wikilinkAccent = ViewPlugin.fromClass(
  class {
    /** @param {EditorView} view */
    constructor(view) {
      this.decorations = this.#build(view);
    }
    /** @param {import("@codemirror/view").ViewUpdate} update */
    update(update) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = this.#build(update.view);
      }
    }
    /** @param {EditorView} view */
    #build(view) {
      /** @type {RangeSetBuilder<Decoration>} */
      const builder = new RangeSetBuilder();
      for (const { from, to } of view.visibleRanges) {
        const text = view.state.doc.sliceString(from, to);
        for (const m of text.matchAll(/\[\[[^\]\n]+\]\]/g)) {
          builder.add(
            from + m.index,
            from + m.index + m[0].length,
            Decoration.mark({ class: "cm-wikilink" }),
          );
        }
      }
      return builder.finish();
    }
  },
  { decorations: (v) => v.decorations },
);

/**
 * A `[[`-triggered completion source: existing titles plus a "Create …" entry.
 * @param {() => string[]} getNoteTitles
 * @param {(title: string) => void} onCreateNote
 * @returns {import("@codemirror/autocomplete").CompletionSource}
 */
function wikilinkCompletion(getNoteTitles, onCreateNote) {
  /** @param {import("@codemirror/autocomplete").CompletionContext} context */
  return (context) => {
    const open = context.matchBefore(/\[\[[^\]\n]*/);
    if (!open) return null;
    const queryFrom = open.from + 2;
    const typed = context.state.sliceDoc(queryFrom, context.pos).trim();

    const titles = getNoteTitles();
    /** @type {import("@codemirror/autocomplete").Completion[]} */
    const options = titles.map((title) => ({
      label: title,
      type: "text",
      apply: `${title}]]`,
    }));

    const exists = titles.some((x) => x.toLowerCase() === typed.toLowerCase());
    if (typed !== "" && !exists) {
      options.push({
        label: `Create "${typed}"`,
        type: "keyword",
        apply: (view, _completion, from, to) => {
          view.dispatch({ changes: { from, to, insert: `${typed}]]` } });
          onCreateNote(typed);
        },
      });
    }

    return { from: queryFrom, options, validFor: /^[^\]\n]*$/ };
  };
}

/**
 * @param {{
 *   parent: HTMLElement,
 *   doc: string,
 *   getNoteTitles: () => string[],
 *   onCreateNote: (title: string) => void,
 * }} opts
 * @returns {{ view: EditorView, getValue: () => string, destroy: () => void }}
 */
export function createMarkdownEditor(opts) {
  const view = new EditorView({
    parent: opts.parent,
    state: EditorState.create({
      doc: opts.doc,
      extensions: [
        history(),
        drawSelection(),
        EditorView.lineWrapping,
        // completionKeymap first so Enter/Tab accept a completion before the
        // default Enter inserts a newline.
        keymap.of([
          ...completionKeymap,
          ...defaultKeymap,
          ...historyKeymap,
          indentWithTab,
        ]),
        markdown(),
        syntaxHighlighting(highlightStyle),
        deEmphasize,
        wikilinkAccent,
        autocompletion({
          override: [wikilinkCompletion(opts.getNoteTitles, opts.onCreateNote)],
        }),
        EditorView.theme({
          "&": {
            // 16px min — anything smaller makes iOS Safari zoom the page on
            // focus (same guard as the form inputs in styles.css).
            fontSize: "1rem",
          },
          ".cm-content": {
            fontFamily: "var(--font-source, ui-monospace, monospace)",
            padding: "0.75rem",
            minHeight: "18rem",
            caretColor: "var(--primary)",
          },
          ".cm-md-mark": { opacity: "0.4" },
          ".cm-wikilink": { color: "var(--primary)" },
          ".cm-selectionBackground": {
            backgroundColor: "var(--primary-container) !important",
          },
          "&.cm-focused": {
            outline: "2px solid var(--primary)",
            outlineOffset: "-1px",
          },
        }),
      ],
    }),
  });

  return {
    view,
    getValue: () => view.state.doc.toString(),
    destroy: () => view.destroy(),
  };
}
