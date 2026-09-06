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
import { el } from "./ui.js";
import { NoteList } from "./note-list.js";
import { NoteEditor } from "./note-editor.js";
import { SearchView } from "./search-view.js";
import { TagBrowser } from "./tag-browser.js";

/** @type {Array<[label: string, hash: string, icon: string]>} */
const NAV = [
  ["Notes", "#/", "🗒"],
  ["Search", "#/search", "🔍"],
  ["Tags", "#/tags", "🏷"],
];

export class AppShell extends HTMLElement {
  #main = el("main");
  #status = el("div", { class: "shell-status" });
  /** @type {HTMLInputElement} */
  #tokenInput = /** @type {HTMLInputElement} */ (el("input", {
    type: "password",
    autocomplete: "off",
  }));

  /** @type {string[]} — cached note titles for `[[` autocomplete */
  #noteTitles = [];
  #titlesLoaded = false;
  /** @type {string} — last search query, kept across navigation */
  #searchQuery = "";

  connectedCallback() {
    this.#renderChrome();
    globalThis.addEventListener("hashchange", this.#onHashChange);

    /** @type {Record<string, (e: CustomEvent) => void>} */
    const on = {
      "note-new": () => this.#go("#/new"),
      "note-open": (e) =>
        this.#go(`#/note/${encodeURIComponent(e.detail.filename)}`),
      "note-delete": (e) => this.#deleteNote(e.detail.filename, "#/"),
      "editor-back": () => this.#go("#/"),
      "editor-delete": (e) => this.#deleteNote(e.detail.filename, "#/"),
      "editor-error": (e) => this.#setStatus(String(e.detail.message), true),
      "editor-save": (e) => this.#saveNote(e.detail),
      "editor-create-link": (e) =>
        this.#createLinkedNote(String(e.detail.title)),
      "search-query": (e) => this.#runSearch(String(e.detail.q)),
      "tag-open": (e) => this.#go(`#/tags/${encodeURIComponent(e.detail.tag)}`),
      "tags-all": () => this.#go("#/tags"),
    };
    for (const [type, handler] of Object.entries(on)) {
      this.addEventListener(type, /** @type {EventListener} */ (handler));
    }

    if (location.hash === "") location.hash = "#/";
    else this.#route();
  }

  disconnectedCallback() {
    globalThis.removeEventListener("hashchange", this.#onHashChange);
  }

  #onHashChange = () => this.#route();

  #renderChrome() {
    this.#tokenInput.value = api.getToken();
    this.#tokenInput.addEventListener("change", () => {
      api.setToken(this.#tokenInput.value.trim());
      this.#setStatus("Token saved.", false);
      this.#route();
    });

    const header = el(
      "header",
      { class: "shell-header" },
      el("h1", { textContent: "noted" }),
      el(
        "nav",
        {},
        ...NAV.map(([label, hash]) =>
          el("a", { textContent: label, href: hash })
        ),
      ),
      el("label", { textContent: "token " }, this.#tokenInput),
    );
    // M3 compact-width Navigation Bar (spec.md §12) — replaces the header's
    // inline nav row below the 600px compact/medium breakpoint (styles.css),
    // since a horizontal nav row crowds a phone-width top bar. Same
    // destinations, same hash links; #route() keeps `data-section` current
    // so CSS alone can show which one is active in either nav.
    const bottomNav = el(
      "nav",
      { class: "bottom-nav" },
      ...NAV.map(([label, hash, icon]) =>
        el(
          "a",
          { class: "nav-item", href: hash },
          el("span", { class: "nav-icon", "aria-hidden": "true" }, icon),
          el("span", { class: "nav-label" }, label),
        )
      ),
    );
    this.replaceChildren(header, this.#status, this.#main, bottomNav);
  }

  /** @param {string} hash */
  #go(hash) {
    if (location.hash === hash) this.#route();
    else location.hash = hash;
  }

  async #route() {
    this.#setStatus("", false);
    const hash = location.hash.replace(/^#/, "");
    this.dataset.section = hash.startsWith("/tags")
      ? "tags"
      : hash === "/search"
      ? "search"
      : "notes";

    try {
      if (hash === "/new") {
        await this.#ensureTitles();
        this.#show(makeEditor(null, [], this.#noteTitles));
        return;
      }

      const noteMatch = /^\/note\/(.+)$/.exec(hash);
      if (noteMatch) {
        const filename = decodeURIComponent(noteMatch[1] ?? "");
        await this.#ensureTitles();
        const [note, backlinks] = await Promise.all([
          api.getNote(filename),
          api.getBacklinks(filename),
        ]);
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
        const view = new TagBrowser();
        view.forTag = { tag, notes: await api.getNotesByTag(tag) };
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
      this.#setTitles(summaries);
      const list = new NoteList();
      list.notes = summaries;
      this.#show(list);
    } catch (err) {
      this.#reportError(err);
    }
  }

  /** Warm the autocomplete title cache once (arriving straight at a note URL). */
  async #ensureTitles() {
    if (!this.#titlesLoaded) this.#setTitles(await api.listNotes());
  }

  /** Refresh the title cache — after a create/rename/update changed the set. */
  async #refreshTitles() {
    this.#setTitles(await api.listNotes());
  }

  /** @param {import("./api.js").NoteSummary[]} summaries */
  #setTitles(summaries) {
    this.#noteTitles = summaries.map((s) => s.title);
    this.#titlesLoaded = true;
  }

  /** @param {HTMLElement} view */
  #show(view) {
    this.#main.replaceChildren(view);
  }

  /** @param {{ filename: string | null, title?: string, body?: string }} detail */
  async #saveNote(detail) {
    const title = String(detail.title ?? "");
    const body = String(detail.body ?? "");
    const filename = detail.filename == null ? null : String(detail.filename);

    try {
      if (filename === null) {
        const created = await api.createNote({ title, body });
        await this.#refreshTitles();
        this.#setStatus("Created.", false);
        this.#go(`#/note/${encodeURIComponent(created.filename)}`);
      } else {
        const updated = await api.updateNote(filename, { title, body });
        const backlinks = await api.getBacklinks(filename);
        await this.#refreshTitles();
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
      this.#titlesLoaded = false; // set shrank; refresh lazily on next need
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
      this.#setStatus(err instanceof Error ? err.message : String(err), true);
    }
  }

  /**
   * @param {string} message
   * @param {boolean} isError
   */
  #setStatus(message, isError) {
    this.#status.textContent = message;
    this.#status.classList.toggle("is-error", isError);
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
