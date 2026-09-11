// @ts-check
/**
 * Tag Browser (system-overview.md §1 — part of the browsing surface).
 *
 * One `#view` discriminated union drives the render:
 *   - `{ kind: "all", tags }`  → the full tag list; a tag click emits `tag-open`
 *   - `{ kind: "one", tag, notes }` → notes with one tag; a note click emits
 *     `note-open`, "All tags" emits `tags-all`
 */

import { icon } from "./icons.js";
import {
  el,
  emit,
  emptyState,
  renderNoteCard,
  renderToolbar,
  sectionRail,
} from "./ui.js";

/** @typedef {import("./api.js").TagCount} TagCount */
/** @typedef {import("./api.js").NoteSummary} NoteSummary */
/**
 * @typedef {{ kind: "all", tags: TagCount[] }
 *   | { kind: "one", tag: string, notes: NoteSummary[] }} TagView
 */

export class TagBrowser extends HTMLElement {
  /** @type {TagView} */
  #view = { kind: "all", tags: [] };
  /** @type {Record<string, "queued" | "synced" | "conflict">} */
  #syncStates = {};
  #queueCount = 0;
  /** @type {string | null} */
  #selectedFilename = null;

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

  /** @param {Record<string, "queued" | "synced" | "conflict">} value */
  set syncStates(value) {
    this.#syncStates = value;
    if (this.isConnected) this.#render();
  }

  /** @param {number} value */
  set queueCount(value) {
    this.#queueCount = value;
    if (this.isConnected) this.#render();
  }

  /** @param {string | null} value */
  set selectedFilename(value) {
    this.#selectedFilename = value;
    if (this.isConnected) this.#render();
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
      renderToolbar(this, { active: "tags", queueCount: this.#queueCount }),
    );
  }

  /** @param {TagCount[]} tags */
  #renderAll(tags) {
    if (tags.length === 0) {
      return [
        sectionRail("Tags", "0 tags"),
        emptyState(
          "tags",
          "No tags yet",
          "Add #tags in a note to build collections here.",
          { label: "Create a note", onclick: () => emit(this, "note-new") },
        ),
      ];
    }
    return [
      sectionRail(
        "Tags",
        `${tags.length} ${tags.length === 1 ? "tag" : "tags"}`,
      ),
      el(
        "div",
        { class: "tag-list" },
        ...tags.map(({ tag, count }) =>
          el(
            "div",
            { class: "tag-row" },
            el("span", { class: "mark" }, icon("tag")),
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
      el(
        "button",
        {
          class: "text-action",
          onclick: () => emit(this, "tags-all"),
        },
        icon("back"),
        el("span", { textContent: "All tags" }),
      ),
      sectionRail(
        `#${tag}`,
        `${notes.length} ${notes.length === 1 ? "note" : "notes"}`,
      ),
      notes.length === 0
        ? emptyState(
          "tags",
          "Nothing here",
          `No notes currently use #${tag}.`,
        )
        : el(
          "div",
          { class: "card-list" },
          ...notes.map((note) =>
            renderNoteCard(note, {
              onOpen: () =>
                emit(this, "note-open", { filename: note.filename }),
              syncState: this.#syncStates[note.filename] ?? "synced",
              selected: this.#selectedFilename === note.filename,
            })
          ),
        ),
    ];
  }
}
