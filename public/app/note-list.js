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

import { el, emit, renderNoteCard } from "./ui.js";

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
      this.#notes.length === 0
        ? el("p", { class: "empty", textContent: "No notes yet." })
        : el(
          "div",
          { class: "card-list" },
          ...this.#notes.map((n) => this.#renderItem(n)),
        ),
      el(
        "div",
        { class: "toolbar" },
        el(
          "nav",
          {},
          el("a", { class: "icon-btn", href: "#/tags", textContent: "#" }),
        ),
        el("button", {
          class: "fab-new",
          textContent: "✎ New note",
          onclick: () => emit(this, "note-new"),
        }),
      ),
    );
  }

  /** @param {NoteSummary} note */
  #renderItem(note) {
    return el(
      "div",
      { dataset: { filename: note.filename } },
      renderNoteCard(note, {
        onOpen: () => emit(this, "note-open", { filename: note.filename }),
      }),
      el(
        "div",
        { class: "note-row-actions" },
        el("button", {
          class: "text-action delete",
          textContent: "Delete",
          onclick: () => {
            if (confirm(`Delete "${note.title}"?`)) {
              emit(this, "note-delete", { filename: note.filename });
            }
          },
        }),
      ),
    );
  }
}
