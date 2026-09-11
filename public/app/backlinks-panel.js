// @ts-check
/**
 * Backlinks Panel (system-overview.md §1) — a subcomponent of the Editor View.
 *
 * Pure render from a `backlinks` array the App Shell fetches. Collapsible;
 * clicking an entry emits `note-open` (`detail: { filename }`), which the shell
 * turns into navigation — same event the Note List View emits.
 */

import { el, emit } from "./ui.js";
import { icon } from "./icons.js";

/** @typedef {import("./api.js").Backlink} Backlink */

export class BacklinksPanel extends HTMLElement {
  /** @type {Backlink[]} */
  #backlinks = [];

  /** @param {Backlink[]} value */
  set backlinks(value) {
    this.#backlinks = value;
    this.#render();
  }

  get backlinks() {
    return this.#backlinks;
  }

  connectedCallback() {
    this.classList.add("backlinks-panel");
    this.#render();
  }

  #render() {
    const count = this.#backlinks.length;
    this.replaceChildren(
      el(
        "details",
        { open: count > 0 },
        el(
          "summary",
          {},
          icon("back"),
          el("span", { textContent: `Backlinks (${count})` }),
        ),
        count === 0
          ? el("p", { class: "empty", textContent: "No notes link here yet." })
          : el("ul", {}, ...this.#backlinks.map((b) => this.#renderItem(b))),
      ),
    );
  }

  /** @param {Backlink} bl */
  #renderItem(bl) {
    return el(
      "li",
      {},
      el("button", {
        class: "backlink-title",
        textContent: bl.title,
        onclick: () => emit(this, "note-open", { filename: bl.filename }),
      }),
      el("p", { class: "backlink-snippet", textContent: bl.snippet }),
    );
  }
}
