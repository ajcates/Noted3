// @ts-check
/**
 * Client entry point: register the custom elements, then let `<app-shell>`
 * (already in index.html) take over. No framework, no bundler — this file is
 * loaded directly as an ES module.
 */

import { AppShell } from "./app-shell.js";
import { NoteList } from "./note-list.js";
import { NoteEditor } from "./note-editor.js";
import { BacklinksPanel } from "./backlinks-panel.js";
import { SearchView } from "./search-view.js";
import { TagBrowser } from "./tag-browser.js";

customElements.define("app-shell", AppShell);
customElements.define("note-list", NoteList);
customElements.define("note-editor", NoteEditor);
customElements.define("backlinks-panel", BacklinksPanel);
customElements.define("search-view", SearchView);
customElements.define("tag-browser", TagBrowser);

if (!document.querySelector("app-shell")) {
  document.body.append(new AppShell());
}

if ("serviceWorker" in navigator) {
  globalThis.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((cause) => {
      console.warn("service worker registration failed:", cause);
    });
  });
}
