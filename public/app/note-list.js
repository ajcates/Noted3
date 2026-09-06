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

import { el, emit } from "./ui.js";

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

  /** @param {NoteSummary} note */
  #renderItem(note) {
    return el(
      "li",
      { dataset: { filename: note.filename } },
      el("button", {
        class: "title",
        textContent: note.title,
        onclick: () => emit(this, "note-open", { filename: note.filename }),
      }),
      el("span", { class: "tags", textContent: note.tags.join(", ") }),
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
