// @ts-check
/**
 * Note List View (system-overview.md §1) — pure render from fetched data.
 *
 * Takes a `notes` array (set by the App Shell) and renders the browser list.
 * It does no fetching of its own; it emits events and lets the shell act:
 *   - `note-new`    — user wants to create a note
 *   - `note-open`   — `detail: { filename }`
 *   - `note-delete` — `detail: { filename }`
 */

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
    this.replaceChildren();

    const newBtn = document.createElement("button");
    newBtn.className = "primary";
    newBtn.textContent = "New note";
    newBtn.addEventListener("click", () => this.#emit("note-new"));
    this.append(newBtn);

    if (this.#notes.length === 0) {
      const empty = document.createElement("p");
      empty.className = "empty";
      empty.textContent = "No notes yet.";
      this.append(empty);
      return;
    }

    const ul = document.createElement("ul");
    for (const note of this.#notes) {
      ul.append(this.#renderItem(note));
    }
    this.append(ul);
  }

  /** @param {NoteSummary} note */
  #renderItem(note) {
    const li = document.createElement("li");
    li.dataset.filename = note.filename;

    const open = document.createElement("button");
    open.className = "title";
    open.textContent = note.title;
    open.addEventListener(
      "click",
      () => this.#emit("note-open", { filename: note.filename }),
    );

    const tags = document.createElement("span");
    tags.className = "tags";
    tags.textContent = note.tags.join(", ");

    const del = document.createElement("button");
    del.className = "delete";
    del.textContent = "Delete";
    del.addEventListener("click", () => {
      if (confirm(`Delete "${note.title}"?`)) {
        this.#emit("note-delete", { filename: note.filename });
      }
    });

    li.append(open, tags, del);
    return li;
  }

  /**
   * @param {string} type
   * @param {Record<string, unknown>} [detail]
   */
  #emit(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true }));
  }
}
