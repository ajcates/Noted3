// @ts-check
/**
 * IndexedDB Cache (system-overview.md §1, spec.md §7).
 *
 * A local copy of the note list plus recently-opened note bodies, so the
 * app has something to render with no connection. Direct IndexedDB, no
 * wrapper library (techstack.md) — just enough of a promise wrapper to keep
 * callers from touching `IDBRequest` directly. This is a cache: nothing
 * here is a source of truth, and every store can be dropped and rebuilt
 * from the next successful fetch.
 *
 * Two object stores, both keyed by `filename`:
 *   - `notes`  — the full `GET /api/notes` list (replaced wholesale on every
 *     successful fetch)
 *   - `bodies` — one entry per note that's actually been opened (`NoteDetail`,
 *     upserted on every successful `GET /api/notes/:filename`)
 */

const DB_NAME = "noted";
const DB_VERSION = 1;
const NOTES_STORE = "notes";
const BODIES_STORE = "bodies";

/** @typedef {import("./api.js").NoteSummary} NoteSummary */
/** @typedef {import("./api.js").NoteDetail} NoteDetail */

/** @type {Promise<IDBDatabase> | null} */
let dbPromise = null;

/** Lazily open (and upgrade) the database once; every call shares the same open connection. */
function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(NOTES_STORE)) {
        db.createObjectStore(NOTES_STORE, { keyPath: "filename" });
      }
      if (!db.objectStoreNames.contains(BODIES_STORE)) {
        db.createObjectStore(BODIES_STORE, { keyPath: "filename" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

/**
 * @template T
 * @param {IDBRequest<T>} req
 * @returns {Promise<T>}
 */
function promisify(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * @param {string} storeName
 * @param {IDBTransactionMode} mode
 * @returns {Promise<IDBObjectStore>}
 */
async function store(storeName, mode) {
  const db = await openDb();
  return db.transaction(storeName, mode).objectStore(storeName);
}

/**
 * Replace the cached note list wholesale — the list is small enough (a
 * personal vault, spec.md §9) that a full replace on every successful fetch
 * is simpler and cheaper to reason about than a diff.
 * @param {readonly NoteSummary[]} summaries
 */
export async function putNotes(summaries) {
  const s = await store(NOTES_STORE, "readwrite");
  await promisify(s.clear());
  for (const summary of summaries) s.put(summary);
}

/** @returns {Promise<NoteSummary[]>} */
export async function getNotes() {
  const s = await store(NOTES_STORE, "readonly");
  return promisify(/** @type {IDBRequest<NoteSummary[]>} */ (s.getAll()));
}

/** @param {NoteDetail} detail */
export async function putNote(detail) {
  const s = await store(BODIES_STORE, "readwrite");
  s.put(detail);
}

/**
 * @param {string} filename
 * @returns {Promise<NoteDetail | null>}
 */
export async function getNote(filename) {
  const s = await store(BODIES_STORE, "readonly");
  const result = await promisify(
    /** @type {IDBRequest<NoteDetail | undefined>} */ (s.get(filename)),
  );
  return result ?? null;
}

/** Drop a note from both stores — after a delete, or a create/rename that
 * invalidates a cached filename.
 * @param {string} filename
 */
export async function deleteNote(filename) {
  const notes = await store(NOTES_STORE, "readwrite");
  notes.delete(filename);
  const bodies = await store(BODIES_STORE, "readwrite");
  bodies.delete(filename);
}
