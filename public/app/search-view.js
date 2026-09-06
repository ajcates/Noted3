// @ts-check
/**
 * Search View (system-overview.md §1).
 *
 * A query box + results list. Debounces input and emits `search-query`
 * (`detail: { q }`); the App Shell runs the query and sets `.results`.
 * A result click emits `note-open` (`detail: { filename }`).
 */

/** @typedef {import("./api.js").SearchResult} SearchResult */

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

    const input = document.createElement("input");
    input.type = "search";
    input.placeholder = "Search notes…";
    input.value = this.#query;
    input.addEventListener("input", () => {
      globalThis.clearTimeout(this.#debounce);
      this.#debounce = globalThis.setTimeout(() => {
        this.dispatchEvent(
          new CustomEvent("search-query", {
            detail: { q: input.value },
            bubbles: true,
          }),
        );
      }, 200);
    });
    this.#input = input;

    const list = document.createElement("ul");
    this.#list = list;

    this.replaceChildren(input, list);
    this.#renderList();
    input.focus();
  }

  #renderList() {
    if (!this.#list) return;
    this.#list.replaceChildren();

    if (this.#input && this.#input.value.trim() === "") return;
    if (this.#results.length === 0) {
      const empty = document.createElement("li");
      empty.className = "empty";
      empty.textContent = "No matches.";
      this.#list.append(empty);
      return;
    }

    for (const r of this.#results) {
      const li = document.createElement("li");

      const open = document.createElement("button");
      open.className = "result-title";
      open.textContent = r.title;
      open.addEventListener("click", () => {
        this.dispatchEvent(
          new CustomEvent("note-open", {
            detail: { filename: r.filename },
            bubbles: true,
          }),
        );
      });

      const snippet = document.createElement("p");
      snippet.className = "result-snippet";
      snippet.textContent = r.snippet;

      li.append(open, snippet);
      this.#list.append(li);
    }
  }
}
