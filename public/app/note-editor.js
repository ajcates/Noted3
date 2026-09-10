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
 *
 * The App Shell sets `.note` / `.backlinks` / `.noteTitles` before appending
 * this element; those setters just store while disconnected, and
 * `connectedCallback` renders once.
 */

import { el, emit } from "./ui.js";
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
  /** @type {HTMLElement | null} — holds the format menu; re-rendered without
   * touching the CodeMirror instance, so toggling it doesn't lose focus,
   * selection, or undo history. */
  #formatMenuHost = null;
  #formatOpen = false;

  /** @param {NoteDetail | null} value */
  set note(value) {
    this.#note = value;
    if (this.isConnected) this.#render();
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
    this.#noteTitles = value; // read live by the completion source
  }

  connectedCallback() {
    this.classList.add("note-editor");
    this.#render();
  }

  disconnectedCallback() {
    this.#editor?.destroy();
    this.#editor = null;
  }

  #render() {
    this.#editor?.destroy();
    this.#editor = null;
    this.#panel = null;
    this.#formatOpen = false;

    const note = this.#note;
    this.#titleInput = /** @type {HTMLInputElement} */ (el("input", {
      class: "title",
      type: "text",
      placeholder: "Title",
      value: note?.title ?? "",
    }));

    const host = el("div", { class: "cm-host" });
    this.#formatMenuHost = el("div", {});
    this.#panel = note ? new BacklinksPanel() : null;
    if (this.#panel) this.#panel.backlinks = this.#backlinks;

    /** @type {(Node)[]} */
    const kids = [
      this.#titleInput,
      this.#renderFormatToolbar(),
      this.#formatMenuHost,
      host,
      this.#renderActions(note),
    ];
    if (this.#panel) kids.push(this.#panel);
    this.replaceChildren(...kids);

    this.#editor = createMarkdownEditor({
      parent: host,
      doc: note?.body ?? "",
      getNoteTitles: () => this.#noteTitles,
      onCreateNote: (title) => emit(this, "editor-create-link", { title }),
    });
  }

  #renderFormatToolbar() {
    return el(
      "div",
      { class: "format-toolbar" },
      el("button", {
        class: "icon-btn",
        textContent: "Aa",
        title: "Format",
        onclick: () => this.#toggleFormatMenu(),
      }),
      el("button", {
        class: "icon-btn",
        textContent: "↶",
        title: "Undo",
        onclick: () => this.#editor?.undo(),
      }),
      el("button", {
        class: "icon-btn",
        textContent: "↷",
        title: "Redo",
        onclick: () => this.#editor?.redo(),
      }),
    );
  }

  #toggleFormatMenu() {
    this.#formatOpen = !this.#formatOpen;
    this.#renderFormatMenu();
  }

  #renderFormatMenu() {
    if (!this.#formatMenuHost) return;
    if (!this.#formatOpen) {
      this.#formatMenuHost.replaceChildren();
      return;
    }

    /**
     * @param {string} label
     * @param {string} glyph
     * @param {() => void} onclick
     */
    const cell = (label, glyph, onclick) =>
      el(
        "button",
        { class: "format-cell", onclick },
        el("span", { class: "glyph", textContent: glyph }),
        el("span", { class: "label", textContent: label }),
      );
    /**
     * @param {string} label
     * @param {string} glyph
     * @param {() => void} onclick
     */
    const pill = (label, glyph, onclick) =>
      el(
        "button",
        { class: "format-pill", onclick },
        el("span", { class: "glyph", textContent: glyph }),
        el("span", { textContent: label }),
      );

    this.#formatMenuHost.replaceChildren(
      el(
        "div",
        { class: "format-menu" },
        el(
          "div",
          { class: "format-grid" },
          cell("Bold", "B", () => this.#editor?.toggleBold()),
          cell("Italic", "I", () => this.#editor?.toggleItalic()),
          cell("Strike", "S", () => this.#editor?.toggleStrike()),
          cell("Heading", "H2", () => this.#editor?.toggleHeading()),
          cell("List", "•—", () => this.#editor?.toggleList()),
          cell("Quote", "”", () => this.#editor?.toggleQuote()),
        ),
        el(
          "div",
          { class: "format-pillrow" },
          pill("Wikilink", "[[", () => this.#editor?.insertWikilink()),
          pill("Tag", "#", () => this.#editor?.insertTag()),
          pill("Code", "‹›", () => this.#editor?.insertCode()),
        ),
      ),
    );
  }

  /** @param {NoteDetail | null} note */
  #renderActions(note) {
    return el(
      "div",
      { class: "actions" },
      el("button", {
        class: "text-action",
        textContent: "← Back",
        onclick: () => emit(this, "editor-back"),
      }),
      el("button", {
        class: "primary save",
        textContent: "Save",
        onclick: () => this.#save(),
      }),
      note ? el("span", { class: "spacer" }) : null,
      note
        ? el("button", {
          class: "delete",
          textContent: "Delete",
          onclick: () => {
            if (confirm(`Delete "${note.title}"?`)) {
              emit(this, "editor-delete", { filename: note.filename });
            }
          },
        })
        : null,
    );
  }

  #save() {
    const title = this.#titleInput?.value.trim() ?? "";
    const body = this.#editor?.getValue() ?? "";
    if (title === "") {
      emit(this, "editor-error", { message: "A note needs a title." });
      this.#titleInput?.focus();
      return;
    }
    emit(this, "editor-save", {
      filename: this.#note?.filename ?? null,
      title,
      body,
    });
  }
}
