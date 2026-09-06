// @ts-check
/**
 * Backlinks Panel (system-overview.md §1) — a subcomponent of the Editor View.
 *
 * Pure render from a `backlinks` array the App Shell fetches. Collapsible;
 * clicking an entry emits `note-open` (`detail: { filename }`), which the shell
 * turns into navigation — same event the Note List View emits.
 */

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
    this.replaceChildren();
    const details = document.createElement("details");
    details.open = this.#backlinks.length > 0;

    const summary = document.createElement("summary");
    summary.textContent = `Backlinks (${this.#backlinks.length})`;
    details.append(summary);

    if (this.#backlinks.length === 0) {
      const empty = document.createElement("p");
      empty.className = "empty";
      empty.textContent = "No notes link here yet.";
      details.append(empty);
    } else {
      const ul = document.createElement("ul");
      for (const bl of this.#backlinks) {
        ul.append(this.#renderItem(bl));
      }
      details.append(ul);
    }

    this.append(details);
  }

  /** @param {Backlink} bl */
  #renderItem(bl) {
    const li = document.createElement("li");

    const open = document.createElement("button");
    open.className = "backlink-title";
    open.textContent = bl.title;
    open.addEventListener("click", () => {
      this.dispatchEvent(
        new CustomEvent("note-open", {
          detail: { filename: bl.filename },
          bubbles: true,
        }),
      );
    });

    const snippet = document.createElement("p");
    snippet.className = "backlink-snippet";
    snippet.textContent = bl.snippet;

    li.append(open, snippet);
    return li;
  }
}
