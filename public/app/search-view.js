// @ts-check
/**
 * Search View (system-overview.md §1).
 *
 * A query box + results list. Debounces input and emits `search-query`
 * (`detail: { q }`); the App Shell runs the query and sets `.results`.
 * A result click emits `note-open` (`detail: { filename }`).
 */

import {
  el,
  emit,
  emptyState,
  renderNoteCard,
  renderToolbar,
  sectionRail,
} from "./ui.js";

/** @typedef {import("./api.js").SearchResult} SearchResult */

const DEBOUNCE_MS = 200;

export class SearchView extends HTMLElement {
  /** @type {SearchResult[]} */
  #results = [];
  #query = "";
  /** @type {import("./api.js").SearchScope} */
  #scope = "everything";
  /** @type {Record<string, "queued" | "synced" | "conflict">} */
  #syncStates = {};
  #queueCount = 0;
  /** @type {string | null} */
  #selectedFilename = null;
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  #debounce;
  /** @type {HTMLInputElement | null} */
  #input = null;
  /** @type {HTMLElement | null} */
  #list = null;

  /** @param {SearchResult[]} value */
  set results(value) {
    this.#results = value;
    this.#renderList();
  }

  /** @param {string} value */
  set query(value) {
    this.#query = value;
    if (this.#input) this.#input.value = value;
  }

  /** @param {import("./api.js").SearchScope} value */
  set scope(value) {
    this.#scope = value;
    if (this.isConnected) this.#renderChrome();
  }

  /** @param {Record<string, "queued" | "synced" | "conflict">} value */
  set syncStates(value) {
    this.#syncStates = value;
    if (this.isConnected) this.#renderList();
  }

  /** @param {number} value */
  set queueCount(value) {
    this.#queueCount = value;
    if (this.isConnected) this.#renderChrome();
  }

  /** @param {string | null} value */
  set selectedFilename(value) {
    this.#selectedFilename = value;
    if (this.isConnected) this.#renderList();
  }

  connectedCallback() {
    this.classList.add("search-view");

    this.#renderChrome();
    this.#input?.focus();
  }

  #renderChrome() {
    const hadFocus = this.#input === document.activeElement;

    this.#input = /** @type {HTMLInputElement} */ (el("input", {
      type: "search",
      placeholder: "Search your notes…",
      value: this.#query,
      oninput: () => {
        this.#query = this.#input?.value ?? "";
        clearTimeout(this.#debounce);
        this.#debounce = setTimeout(
          () =>
            emit(this, "search-query", {
              q: this.#input?.value ?? "",
              scope: this.#scope,
            }),
          DEBOUNCE_MS,
        );
      },
    }));
    this.#list = el("div", { class: "card-list" });

    const scopes = /** @type {const} */ ([
      ["everything", "Everything"],
      ["titles", "Titles"],
      ["tags", "Tags"],
      ["links", "Links"],
    ]);
    this.replaceChildren(
      el(
        "div",
        { class: "search-box" },
        this.#input,
        el(
          "div",
          { class: "scope-chips", ariaLabel: "Search scope" },
          ...scopes.map(([value, label]) =>
            el("button", {
              class: `scope-chip ${this.#scope === value ? "active" : ""}`,
              textContent: label,
              ariaPressed: String(this.#scope === value),
              onclick: () => {
                this.#scope = value;
                this.#renderChrome();
                emit(this, "search-query", {
                  q: this.#input?.value ?? this.#query,
                  scope: value,
                });
              },
            })
          ),
        ),
      ),
      this.#list,
      renderToolbar(this, { active: "search", queueCount: this.#queueCount }),
    );
    this.#renderList();
    if (hadFocus) this.#input.focus();
  }

  disconnectedCallback() {
    clearTimeout(this.#debounce);
  }

  #renderList() {
    if (!this.#list) return;
    const hasQuery = (this.#input?.value ?? "").trim() !== "";
    this.#list.replaceChildren(
      ...!hasQuery
        ? [emptyState(
          "search",
          "Find an idea",
          "Search titles, writing, tags, or links across your vault.",
        )]
        : this.#results.length === 0
        ? [
          sectionRail("Search", "0 matches"),
          emptyState(
            "search",
            "No matches",
            `Nothing matched “${this.#input?.value ?? ""}”.`,
            {
              label: "Create this note",
              onclick: () =>
                emit(this, "note-new", { title: this.#input?.value ?? "" }),
            },
          ),
        ]
        : [
          sectionRail(
            "Search",
            `${this.#results.length} ${
              this.#results.length === 1 ? "match" : "matches"
            }`,
          ),
          ...this.#results.map((r) => this.#renderItem(r)),
        ],
    );
  }

  /** @param {SearchResult} r */
  #renderItem(r) {
    return renderNoteCard(r, {
      onOpen: () => emit(this, "note-open", { filename: r.filename }),
      query: this.#input?.value ?? this.#query,
      snippet: r.snippet,
      syncState: this.#syncStates[r.filename] ?? "synced",
      selected: this.#selectedFilename === r.filename,
    });
  }
}
