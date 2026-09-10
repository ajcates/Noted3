// @ts-check
/**
 * Tiny DOM helpers shared by every view component. No framework — just enough
 * to keep `#render()` methods declarative instead of a wall of
 * `document.createElement` + property assignment + `append`.
 */

/**
 * Build an element.
 *
 * `props` keys: `class` → className; `dataset` → an object merged into
 * `el.dataset`; `onclick` / `oninput` / … → an `addEventListener`; anything
 * else is set as a property when the element has one, otherwise an attribute.
 * A `null`/`undefined`/`false` value skips the key. `null`/`undefined`
 * children are skipped.
 *
 * @param {string} tag
 * @param {Record<string, unknown>} [props]
 * @param {...(Node | string | null | undefined)} children
 * @returns {HTMLElement}
 */
export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  const anyNode = /** @type {Record<string, unknown>} */ (
    /** @type {unknown} */ (node)
  );
  for (const [key, value] of Object.entries(props)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === "class") {
      node.className = String(value);
    } else if (key === "dataset" && typeof value === "object") {
      Object.assign(node.dataset, value);
    } else if (key.startsWith("on") && typeof value === "function") {
      node.addEventListener(
        key.slice(2).toLowerCase(),
        /** @type {EventListener} */ (value),
      );
    } else if (key in node) {
      anyNode[key] = value;
    } else {
      node.setAttribute(key, String(value));
    }
  }
  for (const child of children) {
    if (child !== null && child !== undefined) node.append(child);
  }
  return node;
}

/**
 * Dispatch a bubbling `CustomEvent` — the one way view components talk to the
 * App Shell.
 * @param {EventTarget} node
 * @param {string} type
 * @param {Record<string, unknown>} [detail]
 */
export function emit(node, type, detail) {
  node.dispatchEvent(new CustomEvent(type, { detail, bubbles: true }));
}

/**
 * A short, legible timestamp — today's notes get a time, older ones a date.
 * Not full relative-time ("2h ago"); that needs a live-updating clock this
 * app doesn't have yet.
 * @param {string} iso
 */
export function formatStamp(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay
    ? d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
    : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * The shared note-card look (design-checklist.md `1a`/field-guide
 * `.note-card`): Fraunces title, plain-text excerpt, a tag chip + backlink
 * chip, and a mono updated stamp. Used by the Note List and the Tag Browser's
 * per-tag list so a note reads the same wherever it's listed.
 * @param {import("./api.js").NoteSummary} note
 * @param {{ onOpen: () => void }} handlers
 */
export function renderNoteCard(note, { onOpen }) {
  /** @type {HTMLElement[]} */
  const chips = [];
  const [firstTag] = note.tags;
  if (firstTag) {
    chips.push(
      el("span", { class: "chip tertiary", textContent: `#${firstTag}` }),
    );
  }
  if (note.backlinkCount > 0) {
    chips.push(el("span", {
      class: "chip secondary",
      textContent: `${note.backlinkCount} backlink${
        note.backlinkCount === 1 ? "" : "s"
      }`,
    }));
  }

  return el(
    "button",
    { class: "note-card", onclick: onOpen },
    el("h4", { textContent: note.title }),
    note.excerpt === ""
      ? null
      : el("p", { class: "snippet", textContent: note.excerpt }),
    el(
      "div",
      { class: "meta-row" },
      el("div", { class: "chips" }, ...chips),
      el("span", { class: "stamp", textContent: formatStamp(note.updated) }),
    ),
  );
}
