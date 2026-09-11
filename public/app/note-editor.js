// @ts-check
/**
 * Editor View (system-overview.md §1).
 *
 * A title `<input>` plus a CodeMirror 6 instance for the body (M4 — replaces
 * the M2 textarea). Owns no persistence: it emits and the App Shell calls the
 * API:
 *   - `editor-back`
 *   - `editor-save`        — `detail: { filename: string | null, title, body, updated? }`
 *     (`updated` is this note's last-seen timestamp, for the Sync Manager's
 *     conflict check, M6 — absent for a brand-new note)
 *   - `editor-delete`      — `detail: { filename }`
 *   - `editor-create-link` — `detail: { title }` (autocomplete "Create …")
 *   - `editor-error`       — `detail: { message }`
 *   - `editor-resolve-conflict` — `detail: { filename, choice: "mine" | "theirs" }`
 *     (M6 — from the conflict banner's two buttons)
 *
 * The App Shell sets `.note` / `.backlinks` / `.noteTitles` / `.conflict`
 * before appending this element; those setters just store while
 * disconnected, and `connectedCallback` renders once.
 */

import { el, emit } from "./ui.js";
import { icon } from "./icons.js";
import { getDraft, saveDraft } from "./preferences.js";
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
  /** @type {HTMLElement | null} */
  #syncStatus = null;
  /** @type {"editing" | "queued" | "synced" | "conflict"} */
  #syncState = "synced";
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  #draftTimer;
  #draftId = "new";
  /** @type {{ entry: unknown, current: NoteDetail } | null} — set by the App
   * Shell when this note has a parked write-queue conflict (M6). */
  #conflict = null;

  /** @param {NoteDetail | null} value */
  set note(value) {
    this.#note = value;
    if (this.isConnected) this.#render();
  }

  get note() {
    return this.#note;
  }

  /** @param {{ entry: unknown, current: NoteDetail } | null} value */
  set conflict(value) {
    this.#conflict = value;
    if (this.isConnected) this.#render();
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

  /** @param {"editing" | "queued" | "synced" | "conflict"} value */
  set syncState(value) {
    this.#syncState = value;
    this.#updateSyncStatus();
  }

  connectedCallback() {
    this.classList.add("note-editor");
    this.#render();
    globalThis.visualViewport?.addEventListener("resize", this.#onViewport);
    this.#onViewport();
  }

  disconnectedCallback() {
    if (this.#syncState === "editing") this.#persistDraft();
    this.#editor?.destroy();
    this.#editor = null;
    clearTimeout(this.#draftTimer);
    globalThis.visualViewport?.removeEventListener("resize", this.#onViewport);
  }

  #onViewport = () => {
    const viewport = globalThis.visualViewport;
    const covered = viewport
      ? Math.max(
        0,
        globalThis.innerHeight - viewport.height - viewport.offsetTop,
      )
      : 0;
    this.style.setProperty("--keyboard-offset", `${covered}px`);
    this.classList.toggle("keyboard-open", covered > 100);
  };

  #render() {
    this.#editor?.destroy();
    this.#editor = null;
    this.#panel = null;
    this.#formatOpen = false;

    const note = this.#note;
    const draftId = note?.filename ?? "new";
    this.#draftId = draftId;
    const draft = getDraft(draftId);
    const hasRestoredDraft = draft !== null &&
      (draft.title !== (note?.title ?? "") ||
        draft.body !== (note?.body ?? ""));
    this.#titleInput = /** @type {HTMLInputElement} */ (el("input", {
      class: "title",
      type: "text",
      placeholder: "Title",
      value: hasRestoredDraft ? draft.title : note?.title ?? "",
      oninput: () => this.#onEdit(),
    }));

    const host = el("div", { class: "cm-host" });
    this.#formatMenuHost = el("div", {});
    this.#syncStatus = el("span", { class: "editor-sync-status" });
    this.#panel = note ? new BacklinksPanel() : null;
    if (this.#panel) this.#panel.backlinks = this.#backlinks;

    /** @type {(Node)[]} */
    const kids = [];
    if (note && this.#conflict) kids.push(this.#renderConflictBanner(note));
    if (hasRestoredDraft) {
      kids.push(el(
        "div",
        { class: "draft-notice", role: "status" },
        icon("queued"),
        el("span", { textContent: "Local draft restored" }),
      ));
    }
    kids.push(
      this.#titleInput,
      this.#renderFormatToolbar(),
      this.#formatMenuHost,
      host,
      this.#renderActions(note),
    );
    if (this.#panel) kids.push(this.#panel);
    this.replaceChildren(...kids);

    this.#editor = createMarkdownEditor({
      parent: host,
      doc: hasRestoredDraft ? draft.body : note?.body ?? "",
      getNoteTitles: () => this.#noteTitles,
      onCreateNote: (title) => emit(this, "editor-create-link", { title }),
      onChange: () => this.#onEdit(),
    });
    this.#updateSyncStatus();
  }

  #onEdit() {
    this.#syncState = "editing";
    this.#updateSyncStatus();
    clearTimeout(this.#draftTimer);
    this.#draftTimer = setTimeout(() => {
      this.#persistDraft();
    }, 120);
  }

  #persistDraft() {
    saveDraft(this.#draftId, {
      title: this.#titleInput?.value ?? "",
      body: this.#editor?.getValue() ?? "",
    });
  }

  #updateSyncStatus() {
    if (!this.#syncStatus) return;
    const labels = {
      editing: "Editing",
      queued: "Queued",
      synced: "Synced",
      conflict: "Conflict",
    };
    const iconName = this.#syncState === "conflict"
      ? "conflict"
      : this.#syncState === "synced"
      ? "check"
      : "queued";
    this.#syncStatus.className = `editor-sync-status ${this.#syncState}`;
    this.#syncStatus.replaceChildren(
      icon(iconName),
      el("span", { textContent: labels[this.#syncState] }),
    );
  }

  /** @param {NoteDetail} note */
  #renderConflictBanner(note) {
    return el(
      "div",
      { class: "conflict-banner" },
      el("p", {
        class: "conflict-message",
        textContent:
          "This note was saved from somewhere else while you were editing it.",
      }),
      el(
        "div",
        { class: "conflict-actions" },
        el("button", {
          class: "primary",
          textContent: "Keep mine",
          onclick: () =>
            emit(this, "editor-resolve-conflict", {
              filename: note.filename,
              choice: "mine",
            }),
        }),
        el("button", {
          class: "text-action",
          textContent: "Keep the other version",
          onclick: () =>
            emit(this, "editor-resolve-conflict", {
              filename: note.filename,
              choice: "theirs",
            }),
        }),
      ),
    );
  }

  #renderFormatToolbar() {
    return el(
      "div",
      { class: "format-toolbar" },
      el("button", {
        class: "icon-btn",
        title: "Format",
        onclick: () => this.#toggleFormatMenu(),
      }, icon("format")),
      el("button", {
        class: "icon-btn",
        title: "Undo",
        onclick: () => this.#editor?.undo(),
      }, icon("undo")),
      el("button", {
        class: "icon-btn",
        title: "Redo",
        onclick: () => this.#editor?.redo(),
      }, icon("redo")),
      el("span", { class: "format-spacer" }),
      this.#syncStatus,
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
      el(
        "button",
        {
          class: "primary save",
          onclick: () => this.#save(),
        },
        icon("check"),
        el("span", { textContent: "Save" }),
      ),
      note ? el("span", { class: "spacer" }) : null,
      note
        ? el(
          "button",
          {
            class: "delete",
            onclick: () =>
              emit(this, "editor-delete", { filename: note.filename }),
          },
          icon("trash"),
          el("span", { textContent: "Delete" }),
        )
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
      updated: this.#note?.updated,
      draftId: this.#note?.filename ?? "new",
    });
  }
}
