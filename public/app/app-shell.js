// @ts-check
/** App shell: routing, responsive workspace, overlays, and durable writes. */

import * as api from "./api.js";
import * as idbCache from "./idb-cache.js";
import * as writeQueue from "./write-queue.js";
import { SyncManager } from "./sync-manager.js";
import { icon } from "./icons.js";
import {
  clearDraft,
  getDraft,
  getPreferences,
  saveDraft,
  setPreferences,
} from "./preferences.js";
import { el, emptyState, skeletonList } from "./ui.js";
import { NoteList } from "./note-list.js";
import { NoteEditor } from "./note-editor.js";
import { SearchView } from "./search-view.js";
import { TagBrowser } from "./tag-browser.js";

export class AppShell extends HTMLElement {
  #main = el("main", { class: "workspace route-browse" });
  #browserPane = el("section", { class: "browser-pane" });
  #detailPane = el("section", { class: "detail-pane" });
  #status = el("div", {
    class: "shell-status",
    role: "status",
    ariaLive: "polite",
  });
  #overlayHost = el("div", { class: "overlay-host" });
  #mastheadLead = el("div", { class: "masthead-lead" });
  #mastheadActions = el("div", { class: "masthead-actions" });
  /** @type {HTMLInputElement} */
  #tokenInput = /** @type {HTMLInputElement} */ (el("input", {
    type: "password",
    autocomplete: "off",
    ariaLabel: "Authentication token",
  }));

  /** @type {string[]} */
  #noteTitles = [];
  #titlesLoaded = false;
  #searchQuery = "";
  /** @type {import("./api.js").SearchScope} */
  #searchScope = "everything";
  /** @type {import("./api.js").VaultMeta} */
  #meta = { vaultName: "Vault", noteCount: 0 };
  /** @type {Record<string, "queued" | "synced" | "conflict">} */
  #syncStates = {};
  #queueCount = 0;
  #lastBrowseHash = "#/";
  /** @type {Map<string, number>} */
  #scrollPositions = new Map();
  /** @type {Map<string, { id: number, timer: ReturnType<typeof setTimeout> }>} */
  #pendingDeletes = new Map();
  /** @type {HTMLElement | null} */
  #snackbar = null;
  /** @type {HTMLDialogElement | null} */
  #activeDialog = null;
  /** @type {(() => void) | null} */
  #afterDialogClose = null;
  /** @type {"forward" | "back" | "neutral"} */
  #routeDirection = "neutral";
  #routeGen = 0;
  #sync = new SyncManager();

  connectedCallback() {
    this.#renderChrome();
    globalThis.addEventListener("hashchange", this.#onHashChange);
    globalThis.addEventListener("popstate", this.#onPopState);
    globalThis.addEventListener("keydown", this.#onKeyDown);

    this.#sync.addEventListener("conflict", (event) => {
      const { filename } = /** @type {CustomEvent} */ (event).detail;
      this.#refreshQueueState();
      if (location.hash === `#/note/${encodeURIComponent(filename)}`) {
        this.#route();
      }
    });
    this.#sync.addEventListener("conflict-resolved", () => {
      this.#refreshQueueState();
      this.#route();
    });
    this.#sync.addEventListener("drained", () => this.#refreshQueueState());
    this.#sync.addEventListener("synced", (event) => {
      this.#titlesLoaded = false;
      const { entry } = /** @type {CustomEvent} */ (event).detail;
      if (entry.op === "update") {
        const openHash = `#/note/${encodeURIComponent(entry.filename)}`;
        if (location.hash === openHash) this.#route();
      } else if (
        entry.op === "delete" &&
        location.hash === `#/note/${encodeURIComponent(entry.filename)}`
      ) {
        this.#go(this.#lastBrowseHash, "back");
      }
    });

    /** @type {Record<string, (event: CustomEvent) => void>} */
    const on = {
      "note-new": (event) => this.#newNote(event.detail ?? {}),
      "note-open": (event) => this.#openNote(String(event.detail.filename)),
      "note-delete": (event) =>
        this.#deleteNote(String(event.detail.filename), this.#lastBrowseHash),
      "editor-back": () => this.#go(this.#lastBrowseHash, "back"),
      "editor-delete": (event) =>
        this.#deleteNote(String(event.detail.filename), this.#lastBrowseHash),
      "editor-error": (event) =>
        this.#setStatus(String(event.detail.message), true),
      "editor-save": (event) => this.#saveNote(event.detail),
      "editor-create-link": (event) =>
        this.#createLinkedNote(String(event.detail.title)),
      "editor-resolve-conflict": (event) =>
        this.#resolveConflict(
          String(event.detail.filename),
          event.detail.choice,
        ),
      "search-query": (event) =>
        this.#runSearch(String(event.detail.q), event.detail.scope),
      "tag-open": (event) =>
        this.#go(`#/tags/${encodeURIComponent(event.detail.tag)}`),
      "tags-all": () => this.#go("#/tags"),
      "queue-open": () => this.#openQueue(),
    };
    for (const [type, handler] of Object.entries(on)) {
      this.addEventListener(type, /** @type {EventListener} */ (handler));
    }

    this.#loadMeta();
    this.#refreshQueueState();
    this.#sync.drain();
    this.#sync.requestBackgroundSync();
    if (location.hash === "") location.hash = "#/";
    else this.#route();

    const params = new URLSearchParams(location.search);
    if (params.get("capture") === "1") {
      const title = params.get("title") ?? "";
      const text = [params.get("text"), params.get("url")]
        .filter(Boolean).join("\n\n");
      for (const key of ["capture", "title", "text", "url"]) params.delete(key);
      history.replaceState(
        null,
        "",
        location.pathname + (params.size ? `?${params}` : "") + location.hash,
      );
      setTimeout(() => this.#openCapture(title, text), 0);
    }
  }

  disconnectedCallback() {
    globalThis.removeEventListener("hashchange", this.#onHashChange);
    globalThis.removeEventListener("popstate", this.#onPopState);
    globalThis.removeEventListener("keydown", this.#onKeyDown);
  }

  #renderChrome() {
    this.#tokenInput.value = api.getToken();
    this.#mastheadActions.replaceChildren(
      el(
        "button",
        {
          class: "icon-btn",
          title: "Appearance and settings",
          ariaLabel: "Appearance and settings",
          onclick: () => this.#openThemePicker(),
        },
        icon("palette"),
      ),
    );
    const topbar = el(
      "header",
      { class: "app-topbar" },
      this.#mastheadLead,
      this.#mastheadActions,
    );
    this.#main.replaceChildren(this.#browserPane, this.#detailPane);
    this.replaceChildren(
      topbar,
      this.#status,
      this.#main,
      this.#overlayHost,
    );
    this.#updateMasthead("home");
  }

  #onHashChange = () => {
    if (this.#routeDirection === "neutral") this.#routeDirection = "back";
    this.#route();
  };

  #onPopState = () => {
    if (this.#activeDialog?.open) this.#activeDialog.close();
  };

  #onKeyDown = (/** @type {KeyboardEvent} */ event) => {
    if (!(event.metaKey || event.ctrlKey)) return;
    const key = event.key.toLowerCase();
    if (key === "k") {
      event.preventDefault();
      this.#go("#/search");
    } else if (key === "n") {
      event.preventDefault();
      this.#newNote({ forceEditor: true });
    } else if (key === "s") {
      const save = this.#detailPane.querySelector("button.save");
      if (save instanceof HTMLButtonElement) {
        event.preventDefault();
        save.click();
      }
    }
  };

  /** @param {string} hash @param {"forward" | "back" | "neutral"} [direction] */
  #go(hash, direction = "neutral") {
    this.#routeDirection = direction;
    if (location.hash === hash) this.#route();
    else location.hash = hash;
  }

  /** @param {string} filename */
  #openNote(filename) {
    const hash = location.hash || "#/";
    if (isBrowseHash(hash)) {
      this.#lastBrowseHash = hash;
      this.#scrollPositions.set(
        hash,
        Math.max(this.#browserPane.scrollTop, globalThis.scrollY),
      );
    }
    this.#go(`#/note/${encodeURIComponent(filename)}`, "forward");
  }

  async #route() {
    this.#main.dataset.direction = this.#routeDirection;
    this.#routeDirection = "neutral";
    const gen = ++this.#routeGen;
    const stale = () => gen !== this.#routeGen;
    this.#setStatus("", false);
    const hash = location.hash.replace(/^#/, "");
    try {
      if (hash === "/new") {
        await Promise.all([this.#ensureTitles(), this.#ensureBrowserPane()]);
        if (stale()) return;
        this.#showEditor(makeEditor(null, [], this.#noteTitles, "editing"));
        this.#updateMasthead("detail", "New note");
        return;
      }

      const noteMatch = /^\/note\/(.+)$/.exec(hash);
      if (noteMatch) {
        const filename = decodeURIComponent(noteMatch[1] ?? "");
        await Promise.all([this.#ensureTitles(), this.#ensureBrowserPane()]);
        const { note, backlinks, offline } = await this.#loadNote(filename);
        if (stale()) return;
        const state = this.#sync.getConflict(filename)
          ? "conflict"
          : this.#syncStates[filename] ?? "synced";
        const editor = makeEditor(note, backlinks, this.#noteTitles, state);
        editor.conflict = this.#sync.getConflict(filename);
        this.#showEditor(editor);
        this.#updateMasthead("detail", note.title);
        if (offline) {
          this.#setStatus("Offline — showing the cached copy.", false);
        }
        return;
      }

      if (hash === "/search") {
        this.#lastBrowseHash = "#/search";
        const view = new SearchView();
        view.query = this.#searchQuery;
        view.scope = this.#searchScope;
        this.#applyViewState(view);
        this.#showBrowse(view, "#/search");
        this.#updateMasthead("browse", "Search");
        if (this.#searchQuery.trim() !== "") {
          view.results = await api.search(this.#searchQuery, this.#searchScope);
          if (stale()) return;
        }
        return;
      }

      const tagMatch = /^\/tags\/(.+)$/.exec(hash);
      if (tagMatch) {
        const fullHash = `#/tags/${tagMatch[1]}`;
        this.#lastBrowseHash = fullHash;
        this.#showBrowseLoading();
        const tag = decodeURIComponent(tagMatch[1] ?? "");
        const notes = await api.getNotesByTag(tag);
        if (stale()) return;
        const view = new TagBrowser();
        view.forTag = { tag, notes: this.#withoutPendingDeletes(notes) };
        this.#applyViewState(view);
        this.#showBrowse(view, fullHash);
        this.#updateMasthead("browse", `#${tag}`);
        return;
      }

      if (hash === "/tags") {
        this.#lastBrowseHash = "#/tags";
        this.#showBrowseLoading();
        const tags = await api.getTags();
        if (stale()) return;
        const view = new TagBrowser();
        view.tags = tags;
        this.#applyViewState(view);
        this.#showBrowse(view, "#/tags");
        this.#updateMasthead("browse", "Tags");
        return;
      }

      this.#lastBrowseHash = "#/";
      this.#showBrowseLoading();
      const { summaries, offline } = await this.#loadNoteList();
      if (stale()) return;
      this.#setTitles(summaries);
      this.#meta.noteCount = summaries.length;
      this.#showBrowse(this.#makeList(summaries), "#/");
      this.#updateMasthead("home");
      if (offline) this.#setStatus("Offline — showing the cached copy.", false);
    } catch (error) {
      if (!stale()) {
        this.#reportError(error);
        this.#showViewError(error);
      }
    }
  }

  async #loadMeta() {
    try {
      this.#meta = await api.getVaultMeta();
      if ((location.hash || "#/") === "#/") this.#updateMasthead("home");
    } catch {
      // Optional chrome; the notes endpoint still gives a trustworthy count.
    }
  }

  /** @param {"home" | "browse" | "detail"} kind @param {string} [title] */
  #updateMasthead(kind, title = "") {
    if (kind === "home") {
      this.#mastheadLead.replaceChildren(
        el("a", { class: "wordmark", textContent: "noted", href: "#/" }),
        el(
          "span",
          { class: "vault-kicker" },
          el("span", {
            class: "vault-name",
            textContent: this.#meta.vaultName,
            title: this.#meta.vaultName,
          }),
          el("span", {
            class: "vault-count",
            textContent: `${this.#meta.noteCount} ${
              this.#meta.noteCount === 1 ? "note" : "notes"
            }`,
          }),
        ),
      );
      return;
    }
    this.#mastheadLead.replaceChildren(
      el(
        "button",
        {
          class: "icon-btn masthead-back",
          ariaLabel: "Back",
          onclick: () =>
            this.#go(
              kind === "detail" ? this.#lastBrowseHash : "#/",
              "back",
            ),
        },
        icon("back"),
      ),
      el("h1", { class: "context-title", textContent: title }),
    );
  }

  #showBrowseLoading() {
    this.#main.className = "workspace route-browse is-loading";
    this.#browserPane.replaceChildren(skeletonList());
    this.#detailPane.replaceChildren(
      emptyState("select", "Select a note", "Choose a note to read or edit."),
    );
  }

  /** @param {HTMLElement} view @param {string} hash */
  #showBrowse(view, hash) {
    this.#main.className = "workspace route-browse";
    this.#browserPane.replaceChildren(view);
    this.#detailPane.replaceChildren(
      emptyState("select", "Select a note", "Choose a note to read or edit."),
    );
    requestAnimationFrame(() => {
      const top = this.#scrollPositions.get(hash) ?? 0;
      this.#browserPane.scrollTop = top;
      globalThis.scrollTo({ top });
    });
  }

  /** @param {NoteEditor} editor */
  #showEditor(editor) {
    this.#main.className = "workspace route-detail";
    const selected = editor.note?.filename ?? null;
    const browseView = this.#browserPane.firstElementChild;
    if (
      browseView instanceof NoteList || browseView instanceof SearchView ||
      browseView instanceof TagBrowser
    ) browseView.selectedFilename = selected;
    this.#detailPane.replaceChildren(editor);
    requestAnimationFrame(() => globalThis.scrollTo({ top: 0 }));
  }

  async #ensureBrowserPane() {
    if (
      this.#browserPane.firstElementChild &&
      !this.#browserPane.querySelector(".skeleton-list")
    ) return;
    const { summaries } = await this.#loadNoteList();
    this.#setTitles(summaries);
    this.#browserPane.replaceChildren(this.#makeList(summaries));
  }

  /** @param {import("./api.js").NoteSummary[]} summaries */
  #makeList(summaries) {
    const list = new NoteList();
    list.notes = this.#withoutPendingDeletes(summaries);
    this.#applyViewState(list);
    return list;
  }

  /** @param {NoteList | SearchView | TagBrowser} view */
  #applyViewState(view) {
    view.syncStates = this.#syncStates;
    view.queueCount = this.#queueCount;
  }

  /** @param {import("./api.js").NoteSummary[]} notes */
  #withoutPendingDeletes(notes) {
    return notes.filter((note) => !this.#pendingDeletes.has(note.filename));
  }

  async #refreshQueueState() {
    try {
      const entries = await writeQueue.list();
      /** @type {Record<string, "queued" | "synced" | "conflict">} */
      const states = {};
      for (const entry of entries) {
        if (entry.op !== "create") states[entry.filename] = "queued";
      }
      for (const filename of this.#sync.conflictFilenames()) {
        states[filename] = "conflict";
      }
      this.#syncStates = states;
      this.#queueCount = entries.length;
      for (const view of this.#browserPane.children) {
        if (
          view instanceof NoteList || view instanceof SearchView ||
          view instanceof TagBrowser
        ) this.#applyViewState(view);
      }
      const editor = this.#detailPane.querySelector("note-editor");
      if (editor instanceof NoteEditor && editor.note) {
        editor.syncState = states[editor.note.filename] ?? "synced";
      }
    } catch {
      // IndexedDB can be unavailable in strict private modes.
    }
  }

  async #loadNoteList() {
    try {
      const summaries = this.#withoutPendingDeletes(await api.listNotes());
      await idbCache.putNotes(summaries);
      return { summaries, offline: false };
    } catch (error) {
      if (!isOffline(error)) throw error;
      return {
        summaries: this.#withoutPendingDeletes(await idbCache.getNotes()),
        offline: true,
      };
    }
  }

  /** @param {string} filename */
  async #loadNote(filename) {
    try {
      const [note, backlinks] = await Promise.all([
        api.getNote(filename),
        api.getBacklinks(filename),
      ]);
      await idbCache.putNote(note);
      return { note, backlinks, offline: false };
    } catch (error) {
      if (!isOffline(error)) throw error;
      const cached = await idbCache.getNote(filename);
      if (!cached) throw error;
      return { note: cached, backlinks: [], offline: true };
    }
  }

  async #ensureTitles() {
    if (!this.#titlesLoaded) this.#setTitles(await api.listNotes());
  }

  async #refreshTitles() {
    const summaries = await api.listNotes();
    this.#setTitles(summaries);
    this.#meta.noteCount = summaries.length;
  }

  /** @param {import("./api.js").NoteSummary[]} summaries */
  #setTitles(summaries) {
    this.#noteTitles = summaries.map((summary) => summary.title);
    this.#titlesLoaded = true;
  }

  /** @param {{ forceEditor?: boolean, title?: string, body?: string }} detail */
  #newNote(detail) {
    const mobile = matchMedia("(max-width: 48rem)").matches;
    if (mobile && !detail.forceEditor) {
      this.#openCapture(detail.title ?? "", detail.body ?? "");
    } else {
      if (detail.title || detail.body) {
        saveDraft("new", {
          title: detail.title ?? "",
          body: detail.body ?? "",
        });
      }
      this.#go("#/new", "forward");
    }
  }

  /** @param {string} title @param {string} body */
  #openCapture(title, body) {
    const existing = getDraft("capture");
    const titleInput = /** @type {HTMLInputElement} */ (el("input", {
      class: "capture-title",
      placeholder: "Title",
      value: title || existing?.title || "",
      ariaLabel: "Note title",
    }));
    const bodyInput = /** @type {HTMLTextAreaElement} */ (el("textarea", {
      class: "capture-body",
      placeholder: "Capture a thought…",
      value: body || existing?.body || "",
      ariaLabel: "Note text",
    }));
    const persist = () =>
      saveDraft("capture", { title: titleInput.value, body: bodyInput.value });
    titleInput.addEventListener("input", persist);
    bodyInput.addEventListener("input", persist);

    const dialog = /** @type {HTMLDialogElement} */ (el(
      "dialog",
      { class: "sheet capture-sheet" },
      el(
        "header",
        { class: "sheet-header" },
        el(
          "div",
          {},
          el("span", { class: "eyebrow", textContent: "Quick capture" }),
          el("h2", { textContent: "Catch the thought" }),
        ),
        el("button", {
          class: "icon-btn",
          ariaLabel: "Close",
          onclick: () => dialog.close(),
        }, icon("close")),
      ),
      titleInput,
      bodyInput,
      el(
        "div",
        { class: "sheet-actions" },
        el("button", {
          class: "text-action",
          textContent: "Keep writing",
          onclick: () => {
            saveDraft("new", {
              title: titleInput.value,
              body: bodyInput.value,
            });
            clearDraft("capture");
            this.#closeDialog(dialog, () => this.#go("#/new", "forward"));
          },
        }),
        el(
          "button",
          {
            class: "primary commit",
            onclick: () => {
              if (titleInput.value.trim() === "") {
                titleInput.focus();
                return;
              }
              const title = titleInput.value;
              const body = bodyInput.value;
              this.#closeDialog(
                dialog,
                () => this.#createNote(title, body, "capture"),
              );
            },
          },
          icon("check"),
          el("span", { textContent: "Save note" }),
        ),
      ),
    ));
    this.#showDialog(dialog);
    titleInput.focus();
  }

  /** @param {{ filename: string | null, title?: string, body?: string, updated?: string, draftId?: string }} detail */
  async #saveNote(detail) {
    const title = String(detail.title ?? "");
    const body = String(detail.body ?? "");
    const filename = detail.filename == null ? null : String(detail.filename);
    if (filename === null) {
      const editor = this.#detailPane.querySelector("note-editor");
      if (editor instanceof NoteEditor) editor.syncState = "queued";
      await this.#createNote(title, body, detail.draftId ?? "new");
      return;
    }
    try {
      const editor = this.#detailPane.querySelector("note-editor");
      if (editor instanceof NoteEditor) editor.syncState = "queued";
      await writeQueue.enqueue({
        op: "update",
        filename,
        title,
        body,
        baseUpdated: String(detail.updated ?? ""),
      });
      clearDraft(detail.draftId ?? filename);
      await this.#refreshQueueState();
      await this.#sync.drain();
      if (this.#sync.getConflict(filename)) {
        this.#route();
        return;
      }
      const stillQueued = (await writeQueue.list()).some((entry) =>
        entry.op === "update" && entry.filename === filename
      );
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
      this.#showEditor(
        makeEditor(updated, backlinks, this.#noteTitles, "synced"),
      );
      this.#setStatus("Saved.", false);
    } catch (error) {
      this.#reportError(error);
    }
  }

  /** @param {string} title @param {string} body @param {string} [draftId] */
  async #createNote(title, body, draftId = "new") {
    try {
      const created = await api.createNote({ title, body });
      clearDraft(draftId);
      await idbCache.putNote(created);
      await this.#refreshTitles();
      this.#setStatus("Created.", false);
      this.#go(`#/note/${encodeURIComponent(created.filename)}`, "forward");
    } catch (error) {
      if (!isOffline(error)) {
        this.#reportError(error);
        return;
      }
      await writeQueue.enqueue({ op: "create", title, body });
      clearDraft(draftId);
      await this.#refreshQueueState();
      this.#sync.requestBackgroundSync();
      this.#setStatus("Saved offline — will create when back online.", false);
      this.#go(this.#lastBrowseHash, "back");
    }
  }

  /** @param {string} title */
  async #createLinkedNote(title) {
    try {
      await api.createNote({ title });
      await this.#refreshTitles();
      this.#setStatus(`Created linked note "${title}".`, false);
    } catch (error) {
      this.#reportError(error);
    }
  }

  /** @param {string} query @param {import("./api.js").SearchScope} [scope] */
  async #runSearch(query, scope = this.#searchScope) {
    this.#searchQuery = query;
    this.#searchScope = scope;
    const view = this.#browserPane.querySelector("search-view");
    if (!(view instanceof SearchView)) return;
    try {
      view.results = query.trim() === "" ? [] : await api.search(query, scope);
    } catch (error) {
      this.#reportError(error);
    }
  }

  /** @param {string} filename @param {string} afterHash */
  async #deleteNote(filename, afterHash) {
    if (this.#pendingDeletes.has(filename)) return;
    try {
      const entry = await writeQueue.enqueue({ op: "delete", filename });
      const timer = setTimeout(
        () => this.#commitDelete(filename, entry.id),
        5_000,
      );
      this.#pendingDeletes.set(filename, { id: entry.id, timer });
      await idbCache.deleteNote(filename);
      this.#titlesLoaded = false;
      await this.#refreshQueueState();
      this.#showUndo(filename, entry.id);
      this.#go(afterHash, "back");
    } catch (error) {
      this.#reportError(error);
    }
  }

  /** @param {string} filename @param {number} id */
  async #commitDelete(filename, id) {
    if (this.#pendingDeletes.get(filename)?.id !== id) return;
    this.#pendingDeletes.delete(filename);
    await this.#sync.drain();
    await this.#refreshQueueState();
    if (isBrowseHash(location.hash)) this.#route();
  }

  /** @param {string} filename @param {number} id */
  #showUndo(filename, id) {
    this.#snackbar?.remove();
    const snackbar = el(
      "div",
      { class: "snackbar", role: "status" },
      el("span", { textContent: "Note moved out of the list." }),
      el("button", {
        class: "text-action",
        textContent: "Undo",
        onclick: async () => {
          const pending = this.#pendingDeletes.get(filename);
          if (!pending || pending.id !== id) return;
          clearTimeout(pending.timer);
          this.#pendingDeletes.delete(filename);
          await writeQueue.remove(id);
          snackbar.remove();
          await this.#refreshQueueState();
          this.#route();
        },
      }),
      el("span", { class: "snackbar-timer" }),
    );
    this.#snackbar = snackbar;
    this.#overlayHost.append(snackbar);
    setTimeout(() => snackbar.remove(), 5_200);
  }

  /** @param {string} filename @param {"mine" | "theirs"} choice */
  async #resolveConflict(filename, choice) {
    try {
      await this.#sync.resolveConflict(filename, choice);
      await this.#refreshTitles();
      clearDraft(filename);
      this.#setStatus(
        choice === "mine"
          ? "Your version was kept."
          : "Kept the server version.",
        false,
      );
      this.#route();
    } catch (error) {
      this.#reportError(error);
    }
  }

  async #openQueue() {
    const entries = await writeQueue.list();
    const dialog = /** @type {HTMLDialogElement} */ (el(
      "dialog",
      { class: "sheet queue-sheet" },
      this.#sheetHeader("Local first", "Sync queue", () => dialog.close()),
      entries.length === 0
        ? emptyState(
          "offline",
          "Everything is synced",
          "There are no pending changes.",
        )
        : el(
          "ul",
          { class: "queue-list" },
          ...entries.map((entry) => {
            const filename = "filename" in entry ? entry.filename : "";
            return el(
              "li",
              {},
              icon(
                this.#syncStates[filename] === "conflict"
                  ? "conflict"
                  : "queued",
              ),
              el(
                "div",
                {},
                el("strong", {
                  textContent: entry.op === "create" ? entry.title : filename,
                }),
                el("span", {
                  textContent: entry.op === "delete"
                    ? "Waiting to delete"
                    : "Waiting to sync",
                }),
              ),
            );
          }),
        ),
      entries.length > 0
        ? el(
          "button",
          {
            class: "primary retry-all",
            onclick: async () => {
              await this.#sync.drain();
              await this.#refreshQueueState();
              dialog.close();
            },
          },
          icon("retry"),
          el("span", { textContent: "Retry now" }),
        )
        : null,
    ));
    this.#showDialog(dialog);
  }

  #openThemePicker() {
    const selected = getPreferences().theme;
    this.#tokenInput.value = api.getToken();
    const themes = /** @type {const} */ ([
      ["system", "System", "Follow this device"],
      ["light", "Light", "Bright and clear"],
      ["dark", "Dark", "Low-light contrast"],
      ["paper", "Paper", "Warm, low-glare writing"],
    ]);
    const dialog = /** @type {HTMLDialogElement} */ (el(
      "dialog",
      { class: "sheet theme-sheet" },
      this.#sheetHeader("Appearance", "Choose a theme", () => dialog.close()),
      el(
        "div",
        { class: "theme-grid" },
        ...themes.map(([value, label, description]) =>
          el(
            "button",
            {
              class: `theme-option theme-${value} ${
                selected === value ? "active" : ""
              }`,
              ariaPressed: String(selected === value),
              onclick: () => {
                setPreferences({ theme: value });
                dialog.close();
              },
            },
            el(
              "span",
              { class: "theme-preview" },
              el("i", {}),
              el("i", {}),
              el("i", {}),
            ),
            el("strong", { textContent: label }),
            el("small", { textContent: description }),
          )
        ),
      ),
      el(
        "section",
        { class: "connection-panel" },
        el("span", { class: "eyebrow", textContent: "Connection" }),
        el("h3", { textContent: "Private vault access" }),
        el("p", {
          textContent:
            "Your token stays in this browser and is sent only to this Noted server.",
        }),
        el(
          "label",
          {},
          el("span", { textContent: "Authentication token" }),
          this.#tokenInput,
        ),
        el("button", {
          class: "secondary save-token",
          textContent: "Save connection",
          onclick: () => {
            api.setToken(this.#tokenInput.value.trim());
            this.#setStatus("Connection token saved.", false);
            dialog.close();
            this.#route();
          },
        }),
      ),
    ));
    this.#showDialog(dialog);
  }

  /** @param {HTMLDialogElement} dialog */
  #showDialog(dialog) {
    if (this.#activeDialog?.open) this.#activeDialog.close();
    this.#activeDialog = dialog;
    dialog.addEventListener("close", () => {
      const afterClose = this.#afterDialogClose;
      this.#afterDialogClose = null;
      if (this.#activeDialog === dialog) this.#activeDialog = null;
      dialog.remove();
      if (history.state?.notedOverlay) {
        if (afterClose) {
          globalThis.addEventListener("popstate", afterClose, { once: true });
        }
        history.back();
      } else {
        afterClose?.();
      }
    }, { once: true });
    this.#overlayHost.append(dialog);
    history.pushState(
      { ...history.state, notedOverlay: true },
      "",
      location.href,
    );
    dialog.showModal();
  }

  /** @param {HTMLDialogElement} dialog @param {() => void} afterClose */
  #closeDialog(dialog, afterClose) {
    this.#afterDialogClose = afterClose;
    dialog.close();
  }

  /** @param {string} eyebrow @param {string} title @param {() => void} close */
  #sheetHeader(eyebrow, title, close) {
    return el(
      "header",
      { class: "sheet-header" },
      el(
        "div",
        {},
        el("span", { class: "eyebrow", textContent: eyebrow }),
        el("h2", { textContent: title }),
      ),
      el(
        "button",
        { class: "icon-btn", ariaLabel: "Close", onclick: close },
        icon("close"),
      ),
    );
  }

  /** @param {unknown} error */
  #showViewError(error) {
    const message = error instanceof Error ? error.message : String(error);
    const state = emptyState(
      isOffline(error) ? "offline" : "search",
      isOffline(error) ? "You're offline" : "Something went wrong",
      message,
      { label: "Try again", onclick: () => this.#route() },
    );
    if (this.#main.classList.contains("route-detail")) {
      this.#detailPane.replaceChildren(state);
    } else {
      this.#browserPane.replaceChildren(state);
    }
  }

  /** @param {unknown} error */
  #reportError(error) {
    if (error instanceof api.ApiError && error.status === 401) {
      this.#setStatus("Unauthorized — check the connection in Settings.", true);
    } else {
      this.#setStatus(
        error instanceof Error ? error.message : String(error),
        true,
      );
    }
  }

  /** @param {string} message @param {boolean} isError */
  #setStatus(message, isError) {
    this.#status.textContent = message;
    this.#status.classList.toggle("is-error", isError && message !== "");
    this.#status.classList.toggle("is-ok", !isError && message !== "");
  }
}

/** @param {string} hash */
function isBrowseHash(hash) {
  return hash === "#/" || hash === "#/search" || hash.startsWith("#/tags");
}

/** @param {unknown} error */
function isOffline(error) {
  return error instanceof api.ApiError && error.status === 0;
}

/**
 * @param {import("./api.js").NoteDetail | null} note
 * @param {import("./api.js").Backlink[]} backlinks
 * @param {string[]} noteTitles
 * @param {"editing" | "queued" | "synced" | "conflict"} syncState
 */
function makeEditor(note, backlinks, noteTitles, syncState) {
  const editor = new NoteEditor();
  editor.note = note;
  editor.backlinks = backlinks;
  editor.noteTitles = noteTitles;
  editor.syncState = syncState;
  return editor;
}
