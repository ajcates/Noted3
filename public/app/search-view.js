// @ts-check
/**
 * Search View (system-overview.md §1).
 *
 * A query box + results list. Debounces input and emits `search-query`
 * (`detail: { q }`); the App Shell runs the query and sets `.results`.
 * A result click emits `note-open` (`detail: { filename }`).
 */

import { el, emit } from "./ui.js";

/** @typedef {import("./api.js").SearchResult} SearchResult */

const DEBOUNCE_MS = 200;

export class SearchView extends HTMLElement {
  /** @type {SearchResult[]} */
  #results = [];
  #query = "";
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

  connectedCallback() {
    this.classList.add("search-view");

    this.#input = /** @type {HTMLInputElement} */ (el("input", {
      type: "search",
      placeholder: "Search notes…",
      value: this.#query,
      oninput: () => {
        clearTimeout(this.#debounce);
        this.#debounce = setTimeout(
          () => emit(this, "search-query", { q: this.#input?.value ?? "" }),
          DEBOUNCE_MS,
        );
      },
    }));
    this.#list = el("ul");

    this.replaceChildren(this.#input, this.#list);
    this.#renderList();
    this.#input.focus();
  }

  disconnectedCallback() {
    clearTimeout(this.#debounce);
  }

  #renderList() {
    if (!this.#list) return;
    const hasQuery = (this.#input?.value ?? "").trim() !== "";
    this.#list.replaceChildren(
      ...!hasQuery
        ? []
        : this.#results.length === 0
        ? [el("li", { class: "empty", textContent: "No matches." })]
        : this.#results.map((r) => this.#renderItem(r)),
    );
  }

  /** @param {SearchResult} r */
  #renderItem(r) {
    return el(
      "li",
      {},
      el("button", {
        class: "result-title",
        textContent: r.title,
        onclick: () => emit(this, "note-open", { filename: r.filename }),
      }),
      el("p", { class: "result-snippet", textContent: r.snippet }),
    );
  }
}
