// @ts-check
/**
 * App Shell / Router (system-overview.md §1).
 *
 * Owns the top bar (title + nav + auth-token field + status line) and swaps
 * the active view based on `location.hash`:
 *   #/                 → note list
 *   #/new              → editor for a new note
 *   #/note/<filename>  → editor for an existing note (+ backlinks panel)
 *   #/search           → search view
 *   #/tags             → all tags
 *   #/tags/<tag>       → notes with that tag
 *
 * It is the only component that calls the API Client: child views emit intent
 * events, the shell performs the call and re-routes.
 */

import * as api from "./api.js";
import { NoteList } from "./note-list.js";
import { NoteEditor } from "./note-editor.js";
import { SearchView } from "./search-view.js";
import { TagBrowser } from "./tag-browser.js";

export class AppShell extends HTMLElement {
  /** @type {HTMLElement} */
  #main = document.createElement("main");
  /** @type {HTMLElement} */
  #status = document.createElement("div");
  /** @type {HTMLInputElement} */
  #tokenInput = document.createElement("input");
  /** @type {string[]} — cached note titles for `[[` autocomplete */
  #noteTitles = [];
  /** @type {string} — last search query, kept across navigation */
  #searchQuery = "";

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
    this.addEventListener(
      "editor-create-link",
      (e) => this.#createLinkedNote(detailStr(e, "title")),
    );
    this.addEventListener(
      "search-query",
      (e) => this.#runSearch(detailStr(e, "q")),
    );
    this.addEventListener(
      "tag-open",
      (e) => this.#go(`#/tags/${encodeURIComponent(detailStr(e, "tag"))}`),
    );
    this.addEventListener("tags-all", () => this.#go("#/tags"));

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

    const nav = document.createElement("nav");
    /** @type {Array<[string, string]>} */
    const navLinks = [["Notes", "#/"], ["Search", "#/search"], [
      "Tags",
      "#/tags",
    ]];
    for (const [label, hash] of navLinks) {
      const a = document.createElement("a");
      a.textContent = label;
      a.href = hash;
      nav.append(a);
    }

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

    header.append(h1, nav, label);
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
        await this.#refreshTitles();
        this.#show(makeEditor(null, [], this.#noteTitles));
        return;
      }

      const noteMatch = /^\/note\/(.+)$/.exec(hash);
      if (noteMatch) {
        const filename = decodeURIComponent(noteMatch[1] ?? "");
        const [note, backlinks, summaries] = await Promise.all([
          api.getNote(filename),
          api.getBacklinks(filename),
          api.listNotes(),
        ]);
        this.#noteTitles = summaries.map((s) => s.title);
        this.#show(makeEditor(note, backlinks, this.#noteTitles));
        return;
      }

      if (hash === "/search") {
        const view = new SearchView();
        view.query = this.#searchQuery;
        this.#show(view);
        if (this.#searchQuery.trim() !== "") {
          view.results = await api.search(this.#searchQuery);
        }
        return;
      }

      const tagMatch = /^\/tags\/(.+)$/.exec(hash);
      if (tagMatch) {
        const tag = decodeURIComponent(tagMatch[1] ?? "");
        const notes = await api.getNotesByTag(tag);
        const view = new TagBrowser();
        view.forTag = { tag, notes };
        this.#show(view);
        return;
      }

      if (hash === "/tags") {
        const view = new TagBrowser();
        view.tags = await api.getTags();
        this.#show(view);
        return;
      }

      // default: the note list
      const summaries = await api.listNotes();
      this.#noteTitles = summaries.map((s) => s.title);
      const list = new NoteList();
      list.notes = summaries;
      this.#show(list);
    } catch (err) {
      this.#reportError(err);
    }
  }

  async #refreshTitles() {
    this.#noteTitles = (await api.listNotes()).map((s) => s.title);
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
        const [backlinks, summaries] = await Promise.all([
          api.getBacklinks(filename),
          api.listNotes(),
        ]);
        this.#noteTitles = summaries.map((s) => s.title);
        this.#show(makeEditor(updated, backlinks, this.#noteTitles));
        this.#setStatus("Saved.", false);
      }
    } catch (err) {
      this.#reportError(err);
    }
  }

  /** @param {string} title */
  async #createLinkedNote(title) {
    try {
      await api.createNote({ title });
      await this.#refreshTitles();
      this.#setStatus(`Created linked note "${title}".`, false);
    } catch (err) {
      this.#reportError(err);
    }
  }

  /** @param {string} q */
  async #runSearch(q) {
    this.#searchQuery = q;
    const view = this.#main.querySelector("search-view");
    if (!(view instanceof SearchView)) return;
    try {
      view.results = q.trim() === "" ? [] : await api.search(q);
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

/**
 * @param {import("./api.js").NoteDetail | null} note
 * @param {import("./api.js").Backlink[]} [backlinks]
 * @param {string[]} [noteTitles]
 */
function makeEditor(note, backlinks = [], noteTitles = []) {
  const editor = new NoteEditor();
  editor.note = note;
  editor.backlinks = backlinks;
  editor.noteTitles = noteTitles;
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
