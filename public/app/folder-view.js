// @ts-check

import { icon } from "./icons.js";
import {
  el,
  emit,
  emptyState,
  formatStamp,
  renderToolbar,
  sectionRail,
} from "./ui.js";
import { buildVaultTree, findFolder } from "./vault-tree.js";

/** @typedef {import("./api.js").NoteSummary} NoteSummary */

export class FolderView extends HTMLElement {
  /** @type {NoteSummary[]} */
  #notes = [];
  /** @type {string[]} */
  #folders = [];
  #path = "";
  #queueCount = 0;
  /** @type {Record<string, "queued" | "synced" | "conflict">} */
  #syncStates = {};
  /** @type {string | null} */
  #selectedFilename = null;

  /** @param {NoteSummary[]} value */
  set notes(value) {
    this.#notes = value;
    this.#render();
  }

  /** @param {string[]} value */
  set folders(value) {
    this.#folders = value;
    this.#render();
  }

  /** @param {string} value */
  set folderPath(value) {
    this.#path = value;
    this.#render();
  }

  /** @param {number} value */
  set queueCount(value) {
    this.#queueCount = value;
    if (this.isConnected) this.#render();
  }

  /** @param {Record<string, "queued" | "synced" | "conflict">} value */
  set syncStates(value) {
    this.#syncStates = value;
    if (this.isConnected) this.#render();
  }

  /** @param {string | null} value */
  set selectedFilename(value) {
    this.#selectedFilename = value;
    if (this.isConnected) this.#render();
  }

  connectedCallback() {
    this.classList.add("folder-view");
    this.#render();
  }

  #render() {
    const root = buildVaultTree(this.#notes, this.#folders);
    const folder = findFolder(root, this.#path);
    const title = this.#path === ""
      ? "Folders"
      : this.#path.split("/").at(-1) ?? "Folders";
    const contents = folder
      ? [
        ...folder.folders.map((child) => this.#renderFolder(child)),
        ...folder.notes.map((note) => this.#renderNote(note)),
      ]
      : [];

    this.replaceChildren(
      this.#renderBreadcrumbs(),
      el(
        "div",
        { class: "folder-heading" },
        sectionRail(
          title,
          folder
            ? `${folder.folders.length} ${
              folder.folders.length === 1 ? "folder" : "folders"
            } · ${folder.notes.length} ${
              folder.notes.length === 1 ? "note" : "notes"
            }`
            : "Folder not found",
        ),
        folder
          ? el(
            "button",
            {
              class: "secondary folder-add",
              onclick: () =>
                emit(this, "folder-create-request", {
                  parentPath: this.#path,
                }),
            },
            icon("plus"),
            el("span", { textContent: "New folder" }),
          )
          : null,
      ),
      contents.length > 0
        ? el("div", { class: "folder-list" }, ...contents)
        : emptyState(
          "notes",
          folder ? "This folder is empty" : "Folder not found",
          folder
            ? "There are no notes or folders here yet."
            : "This folder may have been moved or removed.",
        ),
      renderToolbar(this, { active: "folders", queueCount: this.#queueCount }),
    );
  }

  #renderBreadcrumbs() {
    /** @type {HTMLElement[]} */
    const crumbs = [this.#crumb("Folders", "")];
    let path = "";
    for (const segment of this.#path.split("/").filter(Boolean)) {
      path = path === "" ? segment : `${path}/${segment}`;
      crumbs.push(
        el("span", { class: "breadcrumb-separator", textContent: "/" }),
      );
      crumbs.push(this.#crumb(segment, path));
    }
    return el(
      "nav",
      { class: "folder-breadcrumbs", ariaLabel: "Folder path" },
      ...crumbs,
    );
  }

  /** @param {string} label @param {string} path */
  #crumb(label, path) {
    const current = path === this.#path;
    return el("a", {
      class: current ? "current" : "",
      href: folderHash(path),
      ariaCurrent: current ? "page" : null,
      textContent: label,
    });
  }

  /** @param {import("./vault-tree.js").FolderNode} folder */
  #renderFolder(folder) {
    return el(
      "div",
      { class: "folder-row" },
      el(
        "a",
        { class: "folder-open", href: folderHash(folder.path) },
        el("span", { class: "folder-mark" }, icon("folder")),
        el(
          "span",
          { class: "folder-copy" },
          el("strong", { textContent: folder.name }),
          el("small", {
            textContent: `${folder.noteCount} ${
              folder.noteCount === 1 ? "note" : "notes"
            }`,
          }),
        ),
        icon("chevron"),
      ),
      el(
        "button",
        {
          class: "icon-btn folder-rename",
          ariaLabel: `Rename ${folder.name}`,
          title: `Rename ${folder.name}`,
          onclick: () =>
            emit(this, "folder-rename-request", { path: folder.path }),
        },
        icon("edit"),
      ),
    );
  }

  /** @param {NoteSummary} note */
  #renderNote(note) {
    const state = this.#syncStates[note.filename] ?? "synced";
    return el(
      "button",
      {
        class: `folder-note-row sync-${state} ${
          this.#selectedFilename === note.filename ? "selected" : ""
        }`,
        dataset: { filename: note.filename },
        ariaCurrent: this.#selectedFilename === note.filename ? "page" : null,
        onclick: () => emit(this, "note-open", { filename: note.filename }),
      },
      el("span", { class: "note-status", ariaHidden: "true" }),
      icon("file"),
      el("span", { class: "folder-note-title", textContent: note.title }),
      el("span", { class: "stamp", textContent: formatStamp(note.updated) }),
    );
  }
}

/** @param {string} path */
export function folderHash(path) {
  return path === "" ? "#/folders" : `#/folder/${encodeURIComponent(path)}`;
}
