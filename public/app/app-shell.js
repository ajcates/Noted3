// @ts-check
/**
 * App Shell / Router (system-overview.md §1).
 *
 * Owns the top bar (title + nav), the status line, and a footer (auth-token
 * field); swaps the active view based on `location.hash`:
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
import * as idbCache from "./idb-cache.js";
import * as writeQueue from "./write-queue.js";
import { SyncManager } from "./sync-manager.js";
import { el } from "./ui.js";
import { NoteList } from "./note-list.js";
import { NoteEditor } from "./note-editor.js";
import { SearchView } from "./search-view.js";
import { TagBrowser } from "./tag-browser.js";

/** @type {Array<[label: string, glyph: string, hash: string]>} */
const NAV = [["Search", "⌕", "#/search"], ["Tags", "#", "#/tags"]];

export class AppShell extends HTMLElement {
  #main = el("main");
  #status = el("div", { class: "shell-status" });
  /** @type {HTMLAnchorElement[]} */
  #navLinks = [];
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

  #sync = new SyncManager();

  connectedCallback() {
    this.#renderChrome();
    globalThis.addEventListener("hashchange", this.#onHashChange);

    this.#sync.addEventListener("conflict", (e) => {
      const { filename } = /** @type {CustomEvent} */ (e).detail;
      // Only re-render if the conflicted note is the one currently open —
      // navigating away and back re-reads getConflict() from #route().
      if (location.hash === `#/note/${encodeURIComponent(filename)}`) {
        this.#route();
      }
    });
    this.#sync.addEventListener("conflict-resolved", (e) => {
      const { filename } = /** @type {CustomEvent} */ (e).detail;
      if (location.hash === `#/note/${encodeURIComponent(filename)}`) {
        this.#route();
      }
    });
    this.#sync.addEventListener("synced", (e) => {
      this.#titlesLoaded = false; // a queued write landed; refresh lazily
      const { entry } = /** @type {CustomEvent} */ (e).detail;
      if (entry.op === "create") return;
      const openHash = `#/note/${encodeURIComponent(entry.filename)}`;
      if (location.hash !== openHash) return;
      if (entry.op === "delete") {
        this.#go("#/"); // the open note no longer exists server-side
      } else {
        // A background sync just applied this note's update — refresh it,
        // otherwise the editor keeps showing the `updated` from before the
        // sync, and the *next* save would spuriously conflict against the
        // very write that just landed.
        this.#route();
      }
    });
    this.#sync.drain(); // pick up anything left queued from a prior session
    this.#sync.requestBackgroundSync();

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
      "editor-resolve-conflict": (e) =>
        this.#resolveConflict(String(e.detail.filename), e.detail.choice),
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

    this.#navLinks = NAV.map((
      [label, glyph, hash],
    ) => /** @type {HTMLAnchorElement} */ (el("a", {
      class: "icon-btn",
      textContent: glyph,
      title: label,
      href: hash,
    })));

    const topbar = el(
      "header",
      { class: "app-topbar" },
      el("a", { class: "wordmark", textContent: "noted", href: "#/" }),
      el("nav", {}, ...this.#navLinks),
    );
    const footer = el(
      "footer",
      { class: "app-footer" },
      el("span", { textContent: "token" }),
      this.#tokenInput,
    );
    this.replaceChildren(topbar, this.#status, this.#main, footer);
  }

  /** Highlight the nav icon whose route prefixes the current hash. */
  #updateNavActive() {
    const hash = location.hash.replace(/^#/, "");
    for (const link of this.#navLinks) {
      const target = (link.getAttribute("href") ?? "").replace(/^#/, "");
      link.classList.toggle(
        "active",
        hash === target || hash.startsWith(`${target}/`),
      );
    }
  }

  /** @param {string} hash */
  #go(hash) {
    if (location.hash === hash) this.#route();
    else location.hash = hash;
  }

  /** Bumped on every `#route()` call; an in-flight call whose generation has
   * fallen behind the latest one discards its result instead of showing it.
   * Without this, two overlapping routes (e.g. a hash change immediately
   * followed by a write that also re-routes) can resolve out of order and
   * the *older* one's stale data clobbers the newer one's — caught during
   * M6 testing: Back → Delete in quick succession could leave a just-
   * deleted note "reappearing" in the list. */
  #routeGen = 0;

  async #route() {
    const gen = ++this.#routeGen;
    const stale = () => gen !== this.#routeGen;

    this.#setStatus("", false);
    this.#updateNavActive();
    const hash = location.hash.replace(/^#/, "");

    try {
      if (hash === "/new") {
        await this.#ensureTitles();
        if (stale()) return;
        this.#show(makeEditor(null, [], this.#noteTitles));
        return;
      }

      const noteMatch = /^\/note\/(.+)$/.exec(hash);
      if (noteMatch) {
        const filename = decodeURIComponent(noteMatch[1] ?? "");
        await this.#ensureTitles();
        const { note, backlinks, offline } = await this.#loadNote(filename);
        if (stale()) return;
        const editor = makeEditor(note, backlinks, this.#noteTitles);
        editor.conflict = this.#sync.getConflict(filename);
        this.#show(editor);
        if (offline) {
          this.#setStatus("Offline — showing the cached copy.", false);
        }
        return;
      }

      if (hash === "/search") {
        const view = new SearchView();
        view.query = this.#searchQuery;
        this.#show(view);
        if (this.#searchQuery.trim() !== "") {
          const results = await api.search(this.#searchQuery);
          if (stale()) return;
          view.results = results;
        }
        return;
      }

      const tagMatch = /^\/tags\/(.+)$/.exec(hash);
      if (tagMatch) {
        const tag = decodeURIComponent(tagMatch[1] ?? "");
        const notes = await api.getNotesByTag(tag);
        if (stale()) return;
        const view = new TagBrowser();
        view.forTag = { tag, notes };
        this.#show(view);
        return;
      }

      if (hash === "/tags") {
        const tags = await api.getTags();
        if (stale()) return;
        const view = new TagBrowser();
        view.tags = tags;
        this.#show(view);
        return;
      }

      // default: the note list
      const { summaries, offline } = await this.#loadNoteList();
      if (stale()) return;
      this.#setTitles(summaries);
      const list = new NoteList();
      list.notes = summaries;
      this.#show(list);
      if (offline) this.#setStatus("Offline — showing the cached copy.", false);
    } catch (err) {
      if (!stale()) this.#reportError(err);
    }
  }

  /** @returns {Promise<{ summaries: import("./api.js").NoteSummary[], offline: boolean }>} */
  async #loadNoteList() {
    try {
      const summaries = await api.listNotes();
      await idbCache.putNotes(summaries);
      return { summaries, offline: false };
    } catch (err) {
      if (!isOffline(err)) throw err;
      return { summaries: await idbCache.getNotes(), offline: true };
    }
  }

  /**
   * @param {string} filename
   * @returns {Promise<{ note: import("./api.js").NoteDetail, backlinks: import("./api.js").Backlink[], offline: boolean }>}
   */
  async #loadNote(filename) {
    try {
      const [note, backlinks] = await Promise.all([
        api.getNote(filename),
        api.getBacklinks(filename),
      ]);
      await idbCache.putNote(note);
      return { note, backlinks, offline: false };
    } catch (err) {
      if (!isOffline(err)) throw err;
      const cached = await idbCache.getNote(filename);
      if (!cached) throw err; // never opened while online — nothing to fall back to
      return { note: cached, backlinks: [], offline: true };
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

  /** @param {{ filename: string | null, title?: string, body?: string, updated?: string }} detail */
  async #saveNote(detail) {
    const title = String(detail.title ?? "");
    const body = String(detail.body ?? "");
    const filename = detail.filename == null ? null : String(detail.filename);

    if (filename === null) {
      await this.#createNote(title, body);
      return;
    }

    // Edits to an existing note go through the Write Queue *unconditionally*,
    // before any network attempt (system-overview.md's durability guarantee)
    // — an edit made offline, or one that fires just as the connection
    // drops, is never silently lost.
    try {
      await writeQueue.enqueue({
        op: "update",
        filename,
        title,
        body,
        baseUpdated: String(detail.updated ?? ""),
      });
      await this.#sync.drain();

      if (this.#sync.getConflict(filename)) {
        this.#route(); // the conflict listener would also catch this, but
        return; // route() now so the prompt shows without waiting on the event loop
      }

      const stillQueued = (await writeQueue.list())
        .some((e) => e.op === "update" && e.filename === filename);
      if (stillQueued) {
        this.#setStatus("Saved offline — will sync when back online.", false);
        return;
      }

      const [updated, backlinks] = await Promise.all([
        api.getNote(filename),
        api.getBacklinks(filename),
      ]);
      await idbCache.putNote(updated);
      await this.#refreshTitles();
      this.#show(makeEditor(updated, backlinks, this.#noteTitles));
      this.#setStatus("Saved.", false);
    } catch (err) {
      this.#reportError(err);
    }
  }

  /**
   * @param {string} title
   * @param {string} body
   */
  async #createNote(title, body) {
    // Unlike an edit, a new note has no filename yet to queue an update
    // against — try the network directly first (the common case resolves
    // instantly on a local server) and only fall back to the Write Queue if
    // that fails, since there's no note to navigate to until it's created.
    try {
      const created = await api.createNote({ title, body });
      await idbCache.putNote(created);
      await this.#refreshTitles();
      this.#setStatus("Created.", false);
      this.#go(`#/note/${encodeURIComponent(created.filename)}`);
    } catch (err) {
      if (!isOffline(err)) {
        this.#reportError(err);
        return;
      }
      await writeQueue.enqueue({ op: "create", title, body });
      this.#sync.requestBackgroundSync();
      this.#setStatus("Saved offline — will create when back online.", false);
      this.#go("#/");
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
   * Deletes don't participate in the conflict flow (spec.md §7 covers
   * edits, not deletes) — queue it, remove it from the visible cache right
   * away, and let the Sync Manager apply it server-side whenever it can.
   * @param {string} filename
   * @param {string} afterHash
   */
  async #deleteNote(filename, afterHash) {
    try {
      await writeQueue.enqueue({ op: "delete", filename });
      await idbCache.deleteNote(filename);
      this.#titlesLoaded = false; // set shrank; refresh lazily on next need
      // Awaited, unlike a plain "kick": the very next step re-lists notes
      // from the network (if online) — without waiting here, that re-fetch
      // can race the queued delete and still show the note that was just
      // "deleted".
      await this.#sync.drain();
      this.#sync.requestBackgroundSync();
      this.#setStatus("Deleted.", false);
      this.#go(afterHash);
    } catch (err) {
      this.#reportError(err);
    }
  }

  /**
   * @param {string} filename
   * @param {"mine" | "theirs"} choice
   */
  async #resolveConflict(filename, choice) {
    try {
      await this.#sync.resolveConflict(filename, choice);
      await this.#refreshTitles();
      this.#setStatus(
        choice === "mine"
          ? "Your version was kept."
          : "Kept the server's version.",
        false,
      );
      this.#route();
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
    this.#status.classList.toggle("is-error", isError && message !== "");
    this.#status.classList.toggle("is-ok", !isError && message !== "");
  }
}

/** True for the network-error `ApiError` `request()` throws when `fetch`
 * itself fails (offline) — status `0`, distinct from any real HTTP status
 * the server could return.
 * @param {unknown} err */
function isOffline(err) {
  return err instanceof api.ApiError && err.status === 0;
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
