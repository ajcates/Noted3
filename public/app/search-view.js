// @ts-check
/**
 * Search View (system-overview.md §1).
 *
 * A query box + results list. Debounces input and emits `search-query`
 * (`detail: { q }`); the App Shell runs the query and sets `.results`.
 * A result click emits `note-open` (`detail: { filename }`).
 */

import { el, emit, formatStamp } from "./ui.js";

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
      ariaLabel: "Search notes",
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

    // The native <search> landmark (not just a styling hook) — this is
    // genuinely the page's search region, not a div that looks like one.
    this.replaceChildren(el("search", {}, this.#input, this.#list));
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
    const query = this.#input?.value ?? this.#query;
    return el(
      "li",
      {},
      el(
        "button",
        {
          class: "result-title",
          onclick: () => emit(this, "note-open", { filename: r.filename }),
        },
        ...highlightMatches(r.title, query),
      ),
      el(
        "p",
        { class: "result-snippet" },
        ...highlightMatches(r.snippet, query),
      ),
      el(
        "footer",
        {},
        r.backlinkCount > 0
          ? el("span", {
            class: "chip relationship",
            textContent: `${r.backlinkCount} backlink${
              r.backlinkCount === 1 ? "" : "s"
            }`,
          })
          : null,
        el("time", {
          class: "stamp",
          dateTime: r.updated,
          textContent: formatStamp(r.updated),
        }),
      ),
    );
  }
}

/**
 * Split `text` into plain-text and `<mark>` pieces around every
 * case-insensitive occurrence of `query` — "search always tells you how it
 * knew" (design notes §4.15). `<mark>` because this is genuinely marked
 * text, not a styling hook — a styled `<span>` would say the same thing to
 * the eye and nothing to a screen reader or the DOM.
 * @param {string} text
 * @param {string} query
 * @returns {(string | HTMLElement)[]}
 */
function highlightMatches(text, query) {
  const needle = query.trim().toLowerCase();
  if (needle === "") return [text];

  const lower = text.toLowerCase();
  /** @type {(string | HTMLElement)[]} */
  const parts = [];
  let i = 0;
  for (let at = lower.indexOf(needle); at >= 0; at = lower.indexOf(needle, i)) {
    if (at > i) parts.push(text.slice(i, at));
    parts.push(el("mark", { textContent: text.slice(at, at + needle.length) }));
    i = at + needle.length;
  }
  parts.push(text.slice(i));
  return parts;
}
