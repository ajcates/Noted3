// @ts-check
/**
 * Editor View (system-overview.md §1).
 *
 * A plain title input + `<textarea>` for the body (CodeMirror replaces the
 * textarea in M4). Owns no persistence — it emits and the App Shell calls the
 * API:
 *   - `editor-back`
 *   - `editor-save`   — `detail: { filename: string | null, title, body }`
 *                       (`filename` is `null` for a new note)
 *   - `editor-delete` — `detail: { filename }`
 */

import { BacklinksPanel } from "./backlinks-panel.js";

/** @typedef {import("./api.js").NoteDetail} NoteDetail */
/** @typedef {import("./api.js").Backlink} Backlink */

export class NoteEditor extends HTMLElement {
  /** @type {NoteDetail | null} */
  #note = null;
  /** @type {Backlink[]} */
  #backlinks = [];

  /** @type {HTMLInputElement | null} */
  #titleInput = null;
  /** @type {HTMLTextAreaElement | null} */
  #bodyInput = null;
  /** @type {BacklinksPanel | null} */
  #panel = null;

  /** @param {NoteDetail | null} value */
  set note(value) {
    this.#note = value;
    this.#render();
  }

  get note() {
    return this.#note;
  }

  /** @param {Backlink[]} value */
  set backlinks(value) {
    this.#backlinks = value;
    if (this.#panel) this.#panel.backlinks = value;
  }

  connectedCallback() {
    this.classList.add("note-editor");
    this.#render();
  }

  #render() {
    this.replaceChildren();
    const isNew = this.#note === null;

    const title = document.createElement("input");
    title.className = "title";
    title.type = "text";
    title.placeholder = "Title";
    title.value = this.#note?.title ?? "";
    this.#titleInput = title;

    const body = document.createElement("textarea");
    body.placeholder = "Write in markdown…";
    body.value = this.#note?.body ?? "";
    this.#bodyInput = body;

    const actions = document.createElement("div");
    actions.className = "actions";

    const back = document.createElement("button");
    back.textContent = "Back";
    back.addEventListener("click", () => this.#emit("editor-back"));

    const save = document.createElement("button");
    save.className = "primary save";
    save.textContent = "Save";
    save.addEventListener("click", () => this.#save());

    actions.append(back, save);

    if (!isNew) {
      const spacer = document.createElement("span");
      spacer.className = "spacer";
      const del = document.createElement("button");
      del.className = "delete";
      del.textContent = "Delete";
      del.addEventListener("click", () => {
        const note = this.#note;
        if (note && confirm(`Delete "${note.title}"?`)) {
          this.#emit("editor-delete", { filename: note.filename });
        }
      });
      actions.append(spacer, del);
    }

    this.append(title, body, actions);

    // Backlinks only make sense for a note that exists.
    if (!isNew) {
      const panel = new BacklinksPanel();
      panel.backlinks = this.#backlinks;
      this.#panel = panel;
      this.append(panel);
    } else {
      this.#panel = null;
    }
  }

  #save() {
    const title = this.#titleInput?.value.trim() ?? "";
    const body = this.#bodyInput?.value ?? "";
    if (title === "") {
      this.#emit("editor-error", { message: "A note needs a title." });
      this.#titleInput?.focus();
      return;
    }
    this.#emit("editor-save", {
      filename: this.#note?.filename ?? null,
      title,
      body,
    });
  }

  /**
   * @param {string} type
   * @param {Record<string, unknown>} [detail]
   */
  #emit(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true }));
  }
}
