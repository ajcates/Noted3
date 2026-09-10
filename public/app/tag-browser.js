// @ts-check
/**
 * Tag Browser (system-overview.md §1 — part of the browsing surface).
 *
 * One `#view` discriminated union drives the render:
 *   - `{ kind: "all", tags }`  → the full tag list; a tag click emits `tag-open`
 *   - `{ kind: "one", tag, notes }` → notes with one tag; a note click emits
 *     `note-open`, "All tags" emits `tags-all`
 */

import { el, emit, renderNoteCard } from "./ui.js";

/** @typedef {import("./api.js").TagCount} TagCount */
/** @typedef {import("./api.js").NoteSummary} NoteSummary */
/**
 * @typedef {{ kind: "all", tags: TagCount[] }
 *   | { kind: "one", tag: string, notes: NoteSummary[] }} TagView
 */

export class TagBrowser extends HTMLElement {
  /** @type {TagView} */
  #view = { kind: "all", tags: [] };

  /** @param {TagCount[]} tags */
  set tags(tags) {
    this.#view = { kind: "all", tags };
    this.#render();
  }

  /** @param {{ tag: string, notes: NoteSummary[] }} value */
  set forTag(value) {
    this.#view = { kind: "one", ...value };
    this.#render();
  }

  connectedCallback() {
    this.classList.add("tag-browser");
    this.#render();
  }

  #render() {
    this.replaceChildren(
      ...(this.#view.kind === "all"
        ? this.#renderAll(this.#view.tags)
        : this.#renderOne(this.#view.tag, this.#view.notes)),
    );
  }

  /** @param {TagCount[]} tags */
  #renderAll(tags) {
    if (tags.length === 0) {
      return [
        el("h2", { textContent: "Tags" }),
        el("p", { class: "empty", textContent: "No tags yet." }),
      ];
    }
    return [
      el("h2", { textContent: "Tags" }),
      el(
        "div",
        { class: "tag-list" },
        ...tags.map(({ tag, count }) =>
          el(
            "div",
            { class: "tag-row" },
            el("span", { class: "mark", textContent: "#" }),
            el("button", {
              class: "name",
              textContent: tag,
              onclick: () => emit(this, "tag-open", { tag }),
            }),
            el("span", { class: "count", textContent: String(count) }),
          )
        ),
      ),
    ];
  }

  /**
   * @param {string} tag
   * @param {NoteSummary[]} notes
   */
  #renderOne(tag, notes) {
    return [
      el("button", {
        class: "text-action",
        textContent: "← All tags",
        onclick: () => emit(this, "tags-all"),
      }),
      el("h2", { textContent: `#${tag}` }),
      notes.length === 0
        ? el("p", { class: "empty", textContent: "No notes with this tag." })
        : el(
          "div",
          { class: "card-list" },
          ...notes.map((note) =>
            renderNoteCard(note, {
              onOpen: () =>
                emit(this, "note-open", { filename: note.filename }),
            })
          ),
        ),
    ];
  }
}
