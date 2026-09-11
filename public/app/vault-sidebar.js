// @ts-check

import { icon } from "./icons.js";
import { el, emit } from "./ui.js";
import { buildVaultTree } from "./vault-tree.js";
import { folderHash } from "./folder-view.js";

/** @typedef {import("./api.js").NoteSummary} NoteSummary */

export class VaultSidebar extends HTMLElement {
  /** @type {NoteSummary[]} */
  #notes = [];
  /** @type {string[]} */
  #folders = [];
  #activeHash = "#/";
  #vaultName = "Vault";
  #open = false;
  #desktop = matchMedia("(min-width: 56rem)");
  /** @type {Set<string>} */
  #expanded = new Set();

  /** @param {NoteSummary[]} value */
  set notes(value) {
    this.#notes = value;
    if (this.isConnected) this.#render();
  }

  /** @param {string[]} value */
  set folders(value) {
    this.#folders = value;
    if (this.isConnected) this.#render();
  }

  /** @param {string} value */
  set activeHash(value) {
    this.#activeHash = value || "#/";
    if (this.isConnected) this.#render();
  }

  /** @param {string} value */
  set vaultName(value) {
    this.#vaultName = value;
    if (this.isConnected) this.#render();
  }

  /** @param {boolean} value */
  set open(value) {
    this.#open = value;
    this.classList.toggle("open", value);
    this.#updateHidden();
  }

  connectedCallback() {
    this.#render();
    this.#desktop.addEventListener("change", this.#onLayoutChange);
    this.open = this.#open;
  }

  disconnectedCallback() {
    this.#desktop.removeEventListener("change", this.#onLayoutChange);
  }

  #onLayoutChange = () => this.#updateHidden();

  #updateHidden() {
    const hidden = !this.#open && !this.#desktop.matches;
    this.setAttribute("aria-hidden", String(hidden));
    this.inert = hidden;
  }

  #render() {
    const root = buildVaultTree(this.#notes, this.#folders);
    this.replaceChildren(
      el(
        "header",
        { class: "sidebar-header" },
        el(
          "div",
          {},
          el("span", { class: "eyebrow", textContent: "Vault" }),
          el("h2", { textContent: this.#vaultName }),
        ),
        el("button", {
          class: "icon-btn sidebar-close",
          ariaLabel: "Close navigation",
          onclick: () => emit(this, "sidebar-dismiss"),
        }, icon("close")),
      ),
      el(
        "nav",
        { class: "sidebar-primary", ariaLabel: "Vault navigation" },
        this.#navLink("home", "All notes", "#/"),
        this.#navLink("folder", "Folders", "#/folders", root.folders.length),
        this.#navLink("search", "Search", "#/search"),
        this.#navLink("tag", "Tags", "#/tags"),
      ),
      el(
        "section",
        { class: "sidebar-tree", ariaLabel: "Notes and folders" },
        el("span", { class: "sidebar-label", textContent: "Browse" }),
        ...root.folders.map((folder) => this.#renderFolder(folder, 0)),
        ...root.notes.map((note) => this.#renderNote(note, 0)),
        root.folders.length === 0 && root.notes.length === 0
          ? el("p", {
            class: "sidebar-empty",
            textContent: "No notes or folders yet",
          })
          : null,
      ),
    );
    this.classList.toggle("open", this.#open);
  }

  /** @param {"home" | "folder" | "search" | "tag"} iconName @param {string} label @param {string} href @param {number} [count] */
  #navLink(iconName, label, href, count) {
    const active = href === "#/folders"
      ? this.#activeHash === href || this.#activeHash.startsWith("#/folder/")
      : this.#activeHash === href;
    return el(
      "a",
      {
        class: `sidebar-nav-link ${active ? "active" : ""}`,
        href,
        ariaLabel: iconName === "search"
          ? "Find notes"
          : iconName === "tag"
          ? "Browse tags"
          : iconName === "folder"
          ? "Browse folders"
          : label,
        ariaCurrent: active ? "page" : null,
        onclick: () => emit(this, "sidebar-dismiss"),
      },
      icon(iconName),
      el("span", { textContent: label }),
      count === undefined ? null : el("small", { textContent: String(count) }),
    );
  }

  /** @param {import("./vault-tree.js").FolderNode} folder @param {number} depth @returns {HTMLElement} */
  #renderFolder(folder, depth) {
    const activeFolder = activeFolderFromHash(this.#activeHash);
    const activeNote = activeNoteFromHash(this.#activeHash);
    const containsActive = activeFolder === folder.path ||
      activeFolder.startsWith(`${folder.path}/`) ||
      activeNote.startsWith(`${folder.path}/`);
    const expanded = containsActive || this.#expanded.has(folder.path);
    return el(
      "div",
      { class: `sidebar-folder ${expanded ? "expanded" : ""}` },
      el(
        "div",
        { class: "sidebar-tree-row", style: `--tree-depth:${depth}` },
        el("button", {
          class: "tree-toggle",
          ariaLabel: `${expanded ? "Collapse" : "Expand"} ${folder.name}`,
          ariaExpanded: String(expanded),
          onclick: () => {
            if (expanded) this.#expanded.delete(folder.path);
            else this.#expanded.add(folder.path);
            this.#render();
          },
        }, icon("chevron")),
        el(
          "a",
          {
            class: activeFolder === folder.path ? "active" : "",
            href: folderHash(folder.path),
            ariaCurrent: activeFolder === folder.path ? "page" : null,
            onclick: () => emit(this, "sidebar-dismiss"),
          },
          icon("folder"),
          el("span", { textContent: folder.name }),
          el("small", { textContent: String(folder.noteCount) }),
        ),
      ),
      expanded
        ? el(
          "div",
          { class: "sidebar-children" },
          ...folder.folders.map((child) =>
            this.#renderFolder(child, depth + 1)
          ),
          ...folder.notes.map((note) => this.#renderNote(note, depth + 1)),
        )
        : null,
    );
  }

  /** @param {NoteSummary} note @param {number} depth */
  #renderNote(note, depth) {
    const active = activeNoteFromHash(this.#activeHash) === note.filename;
    return el(
      "a",
      {
        class: `sidebar-note ${active ? "active" : ""}`,
        style: `--tree-depth:${depth}`,
        href: `#/note/${encodeURIComponent(note.filename)}`,
        ariaCurrent: active ? "page" : null,
        title: note.title,
        onclick: () => emit(this, "sidebar-dismiss"),
      },
      icon("file"),
      el("span", { textContent: note.title }),
    );
  }
}

/** @param {string} hash */
function activeFolderFromHash(hash) {
  if (hash === "#/folders") return "";
  const match = /^#\/folder\/(.+)$/.exec(hash);
  return match ? decodeHashValue(match[1] ?? "") : "\0";
}

/** @param {string} hash */
function activeNoteFromHash(hash) {
  const match = /^#\/note\/(.+)$/.exec(hash);
  return match ? decodeHashValue(match[1] ?? "") : "\0";
}

/**
 * A malformed hand-written hash is inactive rather than breaking the tree.
 * @param {string} value
 */
function decodeHashValue(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return "\0";
  }
}
