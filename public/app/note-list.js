// @ts-check
/**
 * Note List View (system-overview.md §1) — pure render from fetched data.
 *
 * Takes a `notes` array (set by the App Shell) and renders the browser list.
 * It does no fetching of its own; it emits and lets the shell act:
 *   - `note-new`    — user wants to create a note
 *   - `note-open`   — `detail: { filename }`
 *   - `note-delete` — `detail: { filename }`
 */

import { icon } from "./icons.js";
import { getPreferences, setPreferences } from "./preferences.js";
import {
  el,
  emit,
  emptyState,
  renderNoteCard,
  renderToolbar,
  sectionRail,
} from "./ui.js";

/** @typedef {import("./api.js").NoteSummary} NoteSummary */

export class NoteList extends HTMLElement {
  /** @type {NoteSummary[]} */
  #notes = [];
  /** @type {Record<string, "queued" | "synced" | "conflict">} */
  #syncStates = {};
  #queueCount = 0;
  /** @type {string | null} */
  #selectedFilename = null;

  /** @param {NoteSummary[]} value */
  set notes(value) {
    this.#notes = value;
    this.#render();
  }

  get notes() {
    return this.#notes;
  }

  /** @param {Record<string, "queued" | "synced" | "conflict">} value */
  set syncStates(value) {
    this.#syncStates = value;
    if (this.isConnected) this.#render();
  }

  /** @param {number} value */
  set queueCount(value) {
    this.#queueCount = value;
    if (this.isConnected) this.#render();
  }

  /** @param {string | null} value */
  set selectedFilename(value) {
    this.#selectedFilename = value;
    if (this.isConnected) this.#render();
  }

  connectedCallback() {
    this.classList.add("note-list");
    this.#render();
  }

  #render() {
    const prefs = getPreferences();
    const notes = [...this.#notes].sort((a, b) => {
      if (prefs.sort === "title") return a.title.localeCompare(b.title);
      if (prefs.sort === "backlinks") {
        return b.backlinkCount - a.backlinkCount ||
          b.updated.localeCompare(a.updated);
      }
      return b.updated.localeCompare(a.updated);
    });
    this.classList.toggle("compact", prefs.density === "compact");
    this.replaceChildren(
      this.#renderHeader(notes.length, prefs.sort, prefs.density),
      notes.length === 0
        ? emptyState(
          "notes",
          "A quiet vault",
          "Create your first note and start connecting ideas.",
          {
            label: "Create your first note",
            onclick: () => emit(this, "note-new"),
          },
        )
        : el(
          "div",
          { class: "card-list" },
          ...notes.map((n) => this.#renderItem(n)),
        ),
      renderToolbar(this, { active: "home", queueCount: this.#queueCount }),
    );
  }

  /** @param {number} count @param {import("./preferences.js").SortOrder} sort @param {import("./preferences.js").Density} density */
  #renderHeader(count, sort, density) {
    const select = /** @type {HTMLSelectElement} */ (el(
      "select",
      {
        ariaLabel: "Sort notes",
        onchange: (/** @type {Event} */ event) => {
          const value =
            /** @type {HTMLSelectElement} */ (event.currentTarget).value;
          setPreferences({
            sort: /** @type {import("./preferences.js").SortOrder} */ (value),
          });
          this.#render();
        },
      },
      el("option", { value: "updated", textContent: "Recently updated" }),
      el("option", { value: "title", textContent: "Title A–Z" }),
      el("option", { value: "backlinks", textContent: "Most linked" }),
    ));
    select.value = sort;
    return el(
      "div",
      { class: "browser-heading" },
      sectionRail("Notes", `${count} ${count === 1 ? "note" : "notes"}`),
      el(
        "div",
        { class: "list-controls" },
        el("label", { class: "sort-control" }, icon("sort"), select),
        el(
          "button",
          {
            class: `density-toggle ${density === "compact" ? "active" : ""}`,
            ariaLabel: density === "compact"
              ? "Use comfortable cards"
              : "Use compact cards",
            title: density === "compact"
              ? "Comfortable cards"
              : "Compact cards",
            onclick: () => {
              setPreferences({
                density: density === "compact" ? "comfortable" : "compact",
              });
              this.#render();
            },
          },
          icon("layout"),
        ),
      ),
    );
  }

  /** @param {NoteSummary} note */
  #renderItem(note) {
    const actions = /** @type {HTMLDetailsElement} */ (el(
      "details",
      { class: "card-actions" },
      el("summary", { ariaLabel: `Actions for ${note.title}` }, icon("more")),
      el(
        "div",
        { class: "card-menu" },
        el(
          "button",
          {
            class: "menu-action delete",
            onclick: () =>
              emit(this, "note-delete", { filename: note.filename }),
          },
          icon("trash"),
          el("span", { textContent: "Delete" }),
        ),
      ),
    ));
    const row = el(
      "div",
      { class: "note-row", dataset: { filename: note.filename } },
      renderNoteCard(note, {
        onOpen: () => emit(this, "note-open", { filename: note.filename }),
        syncState: this.#syncStates[note.filename] ?? "synced",
        selected: this.#selectedFilename === note.filename,
      }),
      actions,
    );
    let startX = 0;
    let startY = 0;
    row.addEventListener("pointerdown", (event) => {
      startX = event.clientX;
      startY = event.clientY;
    });
    row.addEventListener("pointerup", (event) => {
      const dx = event.clientX - startX;
      const dy = event.clientY - startY;
      if (dx < -72 && Math.abs(dx) > Math.abs(dy) * 1.5) actions.open = true;
    });
    return row;
  }
}
