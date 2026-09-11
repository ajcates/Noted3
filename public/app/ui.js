// @ts-check
/**
 * Tiny DOM helpers shared by every view component. No framework — just enough
 * to keep `#render()` methods declarative instead of a wall of
 * `document.createElement` + property assignment + `append`.
 */

import { icon } from "./icons.js";

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
 * Text with case-insensitive query matches wrapped in `<mark>`.
 * @param {string} value
 * @param {string} query
 * @returns {DocumentFragment}
 */
export function highlightedText(value, query) {
  const fragment = document.createDocumentFragment();
  const needle = query.trim();
  if (needle === "") {
    fragment.append(value);
    return fragment;
  }
  const lower = value.toLocaleLowerCase();
  const lowerNeedle = needle.toLocaleLowerCase();
  let cursor = 0;
  for (;;) {
    const at = lower.indexOf(lowerNeedle, cursor);
    if (at < 0) break;
    fragment.append(value.slice(cursor, at));
    fragment.append(
      el("mark", { textContent: value.slice(at, at + needle.length) }),
    );
    cursor = at + needle.length;
  }
  fragment.append(value.slice(cursor));
  return fragment;
}

/** @param {string} title @param {string} detail */
export function sectionRail(title, detail) {
  return el(
    "header",
    { class: "section-rail" },
    el("h2", { textContent: title }),
    el("span", { class: "section-detail", textContent: detail }),
  );
}

/**
 * Branded illustration + recovery/action copy for an otherwise blank view.
 * @param {"notes" | "search" | "tags" | "offline" | "select"} kind
 * @param {string} title
 * @param {string} message
 * @param {{ label: string, onclick: () => void } | null} [action]
 */
export function emptyState(kind, title, message, action = null) {
  return el(
    "section",
    { class: `empty-state empty-${kind}` },
    el(
      "div",
      { class: "empty-art", "aria-hidden": "true" },
      el("span", { class: "empty-sheet" }),
      el("span", { class: "empty-orbit" }),
      el("span", { class: "empty-spark" }),
    ),
    el("h3", { textContent: title }),
    el("p", { textContent: message }),
    action
      ? el("button", {
        class: "primary empty-action",
        textContent: action.label,
        onclick: action.onclick,
      })
      : null,
  );
}

/** @param {number} [count] */
export function skeletonList(count = 4) {
  return el(
    "div",
    { class: "card-list skeleton-list", ariaLabel: "Loading notes" },
    ...Array.from({ length: count }, () =>
      el(
        "div",
        { class: "note-card skeleton-card" },
        el("span", { class: "skeleton-line wide" }),
        el("span", { class: "skeleton-line" }),
        el("span", { class: "skeleton-line short" }),
      )),
  );
}

/**
 * The docked bottom bar + FAB shared by every browsing view (Note List,
 * Search, Tag Browser): a Tags shortcut on the left, the one committing
 * action ("New note") on the right. `target` is whatever should carry the
 * emitted `note-new` event (usually `this`).
 * @param {EventTarget} target
 * @param {{ active?: "home" | "search" | "tags", queueCount?: number }} [options]
 */
export function renderToolbar(target, options = {}) {
  /**
   * @param {"home" | "search" | "tags"} name
   * @param {string} label
   * @param {string} href
   */
  const navItem = (name, label, href) =>
    el(
      "a",
      {
        class: `bottom-nav-item ${options.active === name ? "active" : ""}`,
        href,
        ariaLabel: label,
      },
      icon(name === "tags" ? "tag" : name),
      el("span", { textContent: label }),
    );
  return el(
    "div",
    { class: "toolbar" },
    el(
      "nav",
      { ariaLabel: "Primary" },
      navItem("home", "Notes", "#/"),
      navItem("search", "Search", "#/search"),
      navItem("tags", "Tags", "#/tags"),
    ),
    options.queueCount
      ? el(
        "button",
        {
          class: "queue-button",
          ariaLabel: `${options.queueCount} queued change${
            options.queueCount === 1 ? "" : "s"
          }`,
          onclick: () => emit(target, "queue-open"),
        },
        icon("queued"),
        el("span", { textContent: String(options.queueCount) }),
      )
      : null,
    el(
      "button",
      {
        class: "fab-new",
        onclick: () => emit(target, "note-new"),
        ariaLabel: "New note",
      },
      icon("edit"),
      el("span", { textContent: "New" }),
    ),
  );
}

/**
 * The shared note-card look (design-checklist.md `1a`/field-guide
 * `.note-card`): Fraunces title, plain-text excerpt, a tag chip + backlink
 * chip, and a mono updated stamp. Used by the Note List and the Tag Browser's
 * per-tag list so a note reads the same wherever it's listed.
 * @param {import("./api.js").NoteSummary} note
 * @param {{ onOpen: () => void, syncState?: "queued" | "synced" | "conflict", query?: string, snippet?: string, selected?: boolean }} handlers
 */
export function renderNoteCard(
  note,
  {
    onOpen,
    syncState = "synced",
    query = "",
    snippet = note.excerpt,
    selected = false,
  },
) {
  /** @type {HTMLElement[]} */
  const chips = [];
  const [firstTag] = note.tags;
  if (firstTag) {
    chips.push(
      el(
        "span",
        { class: "chip tertiary" },
        highlightedText(`#${firstTag}`, query),
      ),
    );
  }
  if (note.tags.length > 1) {
    chips.push(el("span", {
      class: "chip outline more-tags",
      textContent: `+${note.tags.length - 1}`,
    }));
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
    {
      class: `note-card sync-${syncState} ${selected ? "selected" : ""}`,
      onclick: onOpen,
      ariaCurrent: selected ? "page" : null,
    },
    el("h4", {}, highlightedText(note.title, query)),
    snippet === ""
      ? null
      : el("p", { class: "snippet" }, highlightedText(snippet, query)),
    el(
      "div",
      { class: "meta-row" },
      el("div", { class: "chips" }, ...chips),
      el(
        "div",
        { class: "card-state" },
        syncState === "synced" ? null : el(
          "span",
          {
            class: `sync-badge ${syncState}`,
            title: syncState === "conflict"
              ? "Needs attention"
              : "Waiting to sync",
          },
          icon(syncState === "conflict" ? "conflict" : "queued"),
          el("span", {
            textContent: syncState === "conflict" ? "Conflict" : "Queued",
          }),
        ),
        el("span", { class: "stamp", textContent: formatStamp(note.updated) }),
      ),
    ),
  );
}
