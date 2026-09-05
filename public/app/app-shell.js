// @ts-check
/**
 * App Shell / Router (system-overview.md §1).
 *
 * Owns the top bar (title + auth-token field + status line) and swaps the
 * active view based on `location.hash`:
 *   #/                     → note list
 *   #/new                  → editor for a new note
 *   #/note/<filename>      → editor for an existing note
 *
 * It is the only component that calls the API Client: child views emit
 * intent events, the shell performs the call and re-routes. Thin, mostly
 * delegates (system-overview.md §1).
 */

import * as api from "./api.js";
import { NoteList } from "./note-list.js";
import { NoteEditor } from "./note-editor.js";

export class AppShell extends HTMLElement {
  /** @type {HTMLElement} */
  #main = document.createElement("main");
  /** @type {HTMLElement} */
  #status = document.createElement("div");
  /** @type {HTMLInputElement} */
  #tokenInput = document.createElement("input");

  connectedCallback() {
    this.#renderChrome();
    globalThis.addEventListener("hashchange", this.#onHashChange);

    this.addEventListener("note-new", () => this.#go("#/new"));
    this.addEventListener(
      "note-open",
      (e) => this.#go(`#/note/${encodeURIComponent(detailStr(e, "filename"))}`),
    );
    this.addEventListener(
      "note-delete",
      (e) => this.#deleteNote(detailStr(e, "filename"), "#/"),
    );
    this.addEventListener("editor-back", () => this.#go("#/"));
    this.addEventListener(
      "editor-delete",
      (e) => this.#deleteNote(detailStr(e, "filename"), "#/"),
    );
    this.addEventListener(
      "editor-error",
      (e) => this.#setStatus(detailStr(e, "message"), true),
    );
    this.addEventListener("editor-save", (e) => this.#saveNote(e));

    if (location.hash === "") location.hash = "#/";
    else this.#route();
  }

  disconnectedCallback() {
    globalThis.removeEventListener("hashchange", this.#onHashChange);
  }

  #onHashChange = () => this.#route();

  #renderChrome() {
    const header = document.createElement("header");
    header.className = "shell-header";

    const h1 = document.createElement("h1");
    h1.textContent = "noted";

    const label = document.createElement("label");
    label.textContent = "token ";
    this.#tokenInput.type = "password";
    this.#tokenInput.value = api.getToken();
    this.#tokenInput.autocomplete = "off";
    this.#tokenInput.addEventListener("change", () => {
      api.setToken(this.#tokenInput.value.trim());
      this.#setStatus("Token saved.", false);
      this.#route();
    });
    label.append(this.#tokenInput);

    header.append(h1, label);
    this.#status.className = "shell-status";

    this.replaceChildren(header, this.#status, this.#main);
  }

  /** @param {string} hash */
  #go(hash) {
    if (location.hash === hash) this.#route();
    else location.hash = hash;
  }

  async #route() {
    this.#setStatus("", false);
    const hash = location.hash.replace(/^#/, "");

    try {
      if (hash === "/new") {
        this.#show(makeEditor(null));
        return;
      }
      const noteMatch = /^\/note\/(.+)$/.exec(hash);
      if (noteMatch) {
        const filename = decodeURIComponent(noteMatch[1] ?? "");
        const note = await api.getNote(filename);
        this.#show(makeEditor(note));
        return;
      }
      // default: the list
      const list = new NoteList();
      list.notes = await api.listNotes();
      this.#show(list);
    } catch (err) {
      this.#reportError(err);
    }
  }

  /** @param {HTMLElement} view */
  #show(view) {
    this.#main.replaceChildren(view);
  }

  /** @param {Event} e */
  async #saveNote(e) {
    const detail = /** @type {CustomEvent} */ (e).detail ?? {};
    const title = String(detail.title ?? "");
    const body = String(detail.body ?? "");
    const filename = detail.filename == null ? null : String(detail.filename);

    try {
      if (filename === null) {
        const created = await api.createNote({ title, body });
        this.#setStatus("Created.", false);
        this.#go(`#/note/${encodeURIComponent(created.filename)}`);
      } else {
        const updated = await api.updateNote(filename, { title, body });
        this.#show(makeEditor(updated));
        this.#setStatus("Saved.", false);
      }
    } catch (err) {
      this.#reportError(err);
    }
  }

  /**
   * @param {string} filename
   * @param {string} afterHash
   */
  async #deleteNote(filename, afterHash) {
    try {
      await api.deleteNote(filename);
      this.#setStatus("Deleted.", false);
      this.#go(afterHash);
    } catch (err) {
      this.#reportError(err);
    }
  }

  /** @param {unknown} err */
  #reportError(err) {
    if (err instanceof api.ApiError && err.status === 401) {
      this.#setStatus("Unauthorized — check the token field.", true);
    } else {
      const message = err instanceof Error ? err.message : String(err);
      this.#setStatus(message, true);
    }
  }

  /**
   * @param {string} message
   * @param {boolean} isError
   */
  #setStatus(message, isError) {
    this.#status.textContent = message;
    this.#status.style.color = isError ? "#b00020" : "#116329";
  }
}

/** @param {import("./api.js").NoteDetail | null} note */
function makeEditor(note) {
  const editor = new NoteEditor();
  editor.note = note;
  return editor;
}

/**
 * @param {Event} e
 * @param {string} key
 * @returns {string}
 */
function detailStr(e, key) {
  const detail = /** @type {CustomEvent} */ (e).detail ?? {};
  return String(detail[key] ?? "");
}
