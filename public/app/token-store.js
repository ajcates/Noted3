// @ts-check
/**
 * Token Store (system-overview.md §1) — the shared auth token, in IndexedDB.
 *
 * Not `localStorage`: a Service Worker's global scope can't reach it
 * (ISSUES.md, 2026-09-09), and M6's Sync Manager needs to authenticate its
 * own background-sync fetches without first waking a page. IndexedDB is
 * reachable from both, so the token lives here instead — a small dedicated
 * module (not folded into the API Client) so a future Service Worker can
 * import just this, not the whole fetch-wrapping surface of `api.js`.
 */

const DB_NAME = "noted";
const DB_VERSION = 1;
const STORE_NAME = "kv";
const TOKEN_KEY = "token";

/** @returns {Promise<IDBDatabase>} */
function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE_NAME)) {
        req.result.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * @param {IDBDatabase} db
 * @param {IDBTransactionMode} mode
 * @param {(store: IDBObjectStore) => IDBRequest} run
 * @returns {Promise<unknown>}
 */
function withStore(db, mode, run) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode);
    const req = run(tx.objectStore(STORE_NAME));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** @returns {Promise<string>} the saved bearer token, or `""` if none is set. */
export async function getToken() {
  try {
    const db = await openDb();
    const value = await withStore(db, "readonly", (s) => s.get(TOKEN_KEY));
    return typeof value === "string" ? value : "";
  } catch {
    return "";
  }
}

/** @param {string} token */
export async function setToken(token) {
  try {
    const db = await openDb();
    await withStore(db, "readwrite", (s) => s.put(token, TOKEN_KEY));
  } catch {
    // Private-mode / storage disabled — the app still works for this
    // session via the in-memory value the caller holds.
  }
}
