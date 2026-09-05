// @ts-check
/**
 * Client entry point: register the custom elements, then let `<app-shell>`
 * (already in index.html) take over. No framework, no bundler — this file is
 * loaded directly as an ES module.
 */

import { AppShell } from "./app-shell.js";
import { NoteList } from "./note-list.js";
import { NoteEditor } from "./note-editor.js";

customElements.define("app-shell", AppShell);
customElements.define("note-list", NoteList);
customElements.define("note-editor", NoteEditor);

if (!document.querySelector("app-shell")) {
  document.body.append(new AppShell());
}
