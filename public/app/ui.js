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
