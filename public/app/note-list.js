// @ts-check
/**
 * Note List View (system-overview.md §1) — pure render from fetched data.
 *
 * Takes a `notes` array (set by the App Shell) and renders the browser list.
 * It does no fetching of its own; it emits and lets the shell act:
 *   - `note-new`    — user wants to create a note
 *   - `note-open`   — `detail: { filename }`
 *   - `note-delete` — `detail: { filename }`
 */

import { el, emit, formatStamp } from "./ui.js";

/** @typedef {import("./api.js").NoteSummary} NoteSummary */

export class NoteList extends HTMLElement {
  /** @type {NoteSummary[]} */
  #notes = [];

  /** @param {NoteSummary[]} value */
  set notes(value) {
    this.#notes = value;
    this.#render();
  }

  get notes() {
    return this.#notes;
  }

  connectedCallback() {
    this.classList.add("note-list");
    this.#render();
  }

  #render() {
    this.replaceChildren(
      el("button", {
        class: "primary",
        textContent: "New note",
        onclick: () => emit(this, "note-new"),
      }),
      this.#notes.length === 0
        ? el("p", { class: "empty", textContent: "No notes yet." })
        : el("ul", {}, ...this.#notes.map((n) => this.#renderItem(n))),
    );
  }

  /**
   * A snippet card (design notes §4.4): title, a short excerpt, then a
   * footer of tag chips, a backlink-count chip, and a timestamp.
   * @param {NoteSummary} note
   */
  #renderItem(note) {
    return el(
      "li",
      { class: "note-card", dataset: { filename: note.filename } },
      el("button", {
        class: "title",
        textContent: note.title,
        onclick: () => emit(this, "note-open", { filename: note.filename }),
      }),
      note.snippet
        ? el("p", { class: "snippet", textContent: note.snippet })
        : null,
      el(
        "footer",
        {},
        el(
          "span",
          { class: "chips" },
          ...note.tags.map((tag) =>
            el("button", {
              class: "tag-chip",
              textContent: `#${tag}`,
              onclick: () => emit(this, "tag-open", { tag }),
            })
          ),
          note.backlinkCount > 0
            ? el("span", {
              class: "chip relationship",
              textContent: `${note.backlinkCount} backlink${
                note.backlinkCount === 1 ? "" : "s"
              }`,
            })
            : null,
        ),
        el("time", {
          class: "stamp",
          dateTime: note.updated,
          textContent: formatStamp(note.updated),
        }),
      ),
      el("button", {
        class: "delete",
        textContent: "Delete",
        onclick: () => {
          if (confirm(`Delete "${note.title}"?`)) {
            emit(this, "note-delete", { filename: note.filename });
          }
        },
      }),
    );
  }
}
