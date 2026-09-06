// @ts-check
/**
 * Editor View (system-overview.md §1).
 *
 * A title `<input>` plus a CodeMirror 6 instance for the body (M4 — replaces
 * the M2 textarea). Owns no persistence: it emits and the App Shell calls the
 * API:
 *   - `editor-back`
 *   - `editor-save`        — `detail: { filename: string | null, title, body }`
 *   - `editor-delete`      — `detail: { filename }`
 *   - `editor-create-link` — `detail: { title }` (autocomplete "Create …")
 *   - `editor-error`       — `detail: { message }`
 */

import { createMarkdownEditor } from "./codemirror-setup.js";
import { BacklinksPanel } from "./backlinks-panel.js";

/** @typedef {import("./api.js").NoteDetail} NoteDetail */
/** @typedef {import("./api.js").Backlink} Backlink */

export class NoteEditor extends HTMLElement {
  /** @type {NoteDetail | null} */
  #note = null;
  /** @type {Backlink[]} */
  #backlinks = [];
  /** @type {string[]} — note titles offered by `[[` autocomplete */
  #noteTitles = [];

  /** @type {HTMLInputElement | null} */
  #titleInput = null;
  /** @type {ReturnType<typeof createMarkdownEditor> | null} */
  #editor = null;
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

  /** @param {string[]} value */
  set noteTitles(value) {
    this.#noteTitles = value;
  }

  connectedCallback() {
    this.classList.add("note-editor");
    // The App Shell sets `.note` before appending us, which already rendered.
    if (this.childElementCount === 0) this.#render();
  }

  disconnectedCallback() {
    this.#editor?.destroy();
    this.#editor = null;
  }

  #render() {
    this.#editor?.destroy();
    this.#editor = null;
    this.replaceChildren();
    const isNew = this.#note === null;

    const title = document.createElement("input");
    title.className = "title";
    title.type = "text";
    title.placeholder = "Title";
    title.value = this.#note?.title ?? "";
    this.#titleInput = title;

    const host = document.createElement("div");
    host.className = "cm-host";

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

    this.append(title, host, actions);

    this.#editor = createMarkdownEditor({
      parent: host,
      doc: this.#note?.body ?? "",
      getNoteTitles: () => this.#noteTitles,
      onCreateNote: (t) => this.#emit("editor-create-link", { title: t }),
    });

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
    const body = this.#editor?.getValue() ?? "";
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
