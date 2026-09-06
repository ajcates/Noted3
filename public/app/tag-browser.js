// @ts-check
/**
 * Tag Browser (system-overview.md §1 — part of the Note List / browsing).
 *
 * Two modes, driven by which setter the App Shell calls:
 *   - `tags`    → the full tag list; a tag click emits `tag-open` (`{ tag }`)
 *   - `forTag`  → `{ tag, notes }` for one tag; a note click emits `note-open`,
 *                 "All tags" emits `tags-all`
 */

/** @typedef {import("./api.js").TagCount} TagCount */
/** @typedef {import("./api.js").NoteSummary} NoteSummary */

export class TagBrowser extends HTMLElement {
  /** @type {TagCount[] | null} */
  #tags = null;
  /** @type {{ tag: string, notes: NoteSummary[] } | null} */
  #forTag = null;

  /** @param {TagCount[]} value */
  set tags(value) {
    this.#tags = value;
    this.#forTag = null;
    this.#render();
  }

  /** @param {{ tag: string, notes: NoteSummary[] }} value */
  set forTag(value) {
    this.#forTag = value;
    this.#tags = null;
    this.#render();
  }

  connectedCallback() {
    this.classList.add("tag-browser");
    this.#render();
  }

  #render() {
    this.replaceChildren();
    if (this.#forTag) this.#renderForTag(this.#forTag);
    else this.#renderTagList(this.#tags ?? []);
  }

  /** @param {TagCount[]} tags */
  #renderTagList(tags) {
    const h = document.createElement("h2");
    h.textContent = "Tags";
    this.append(h);

    if (tags.length === 0) {
      const p = document.createElement("p");
      p.className = "empty";
      p.textContent = "No tags yet.";
      this.append(p);
      return;
    }

    const ul = document.createElement("ul");
    for (const { tag, count } of tags) {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.className = "tag-chip";
      btn.textContent = `#${tag}`;
      btn.addEventListener("click", () => this.#emit("tag-open", { tag }));
      const n = document.createElement("span");
      n.className = "tag-count";
      n.textContent = String(count);
      li.append(btn, n);
      ul.append(li);
    }
    this.append(ul);
  }

  /** @param {{ tag: string, notes: NoteSummary[] }} value */
  #renderForTag({ tag, notes }) {
    const back = document.createElement("button");
    back.textContent = "← All tags";
    back.addEventListener("click", () => this.#emit("tags-all"));

    const h = document.createElement("h2");
    h.textContent = `#${tag}`;
    this.append(back, h);

    if (notes.length === 0) {
      const p = document.createElement("p");
      p.className = "empty";
      p.textContent = "No notes with this tag.";
      this.append(p);
      return;
    }

    const ul = document.createElement("ul");
    for (const note of notes) {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.className = "result-title";
      btn.textContent = note.title;
      btn.addEventListener(
        "click",
        () => this.#emit("note-open", { filename: note.filename }),
      );
      li.append(btn);
      ul.append(li);
    }
    this.append(ul);
  }

  /**
   * @param {string} type
   * @param {Record<string, unknown>} [detail]
   */
  #emit(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true }));
  }
}
