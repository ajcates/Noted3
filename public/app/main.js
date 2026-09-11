// @ts-check
/**
 * Client entry point: register the custom elements, then let `<app-shell>`
 * (already in index.html) take over. No framework, no bundler — this file is
 * loaded directly as an ES module.
 */

import * as api from "./api.js";
import { initialiseTheme } from "./preferences.js";
import { AppShell } from "./app-shell.js";
import { NoteList } from "./note-list.js";
import { NoteEditor } from "./note-editor.js";
import { BacklinksPanel } from "./backlinks-panel.js";
import { SearchView } from "./search-view.js";
import { TagBrowser } from "./tag-browser.js";
import { FolderView } from "./folder-view.js";
import { VaultSidebar } from "./vault-sidebar.js";

// M7 (notes/roadmap.md): `noted` opens the browser itself with the vault's
// auth token in the URL (`main.ts`'s onListen), so the app logs itself in
// instead of making you paste the token from the footer field every launch.
// Pulled out of the URL immediately and never left in the address bar/history.
const urlParams = new URLSearchParams(location.search);
const tokenFromUrl = urlParams.get("token");
if (tokenFromUrl) {
  api.setToken(tokenFromUrl);
  urlParams.delete("token");
  const query = urlParams.toString();
  history.replaceState(
    null,
    "",
    location.pathname + (query ? `?${query}` : "") + location.hash,
  );
}

initialiseTheme();

customElements.define("note-list", NoteList);
customElements.define("note-editor", NoteEditor);
customElements.define("backlinks-panel", BacklinksPanel);
customElements.define("search-view", SearchView);
customElements.define("tag-browser", TagBrowser);
customElements.define("folder-view", FolderView);
customElements.define("vault-sidebar", VaultSidebar);
// AppShell constructs the registered view elements above in class fields.
customElements.define("app-shell", AppShell);

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
