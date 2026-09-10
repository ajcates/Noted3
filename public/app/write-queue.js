// @ts-check
/**
 * Write Queue (system-overview.md §1, spec.md §7).
 *
 * A durable, IndexedDB-backed log of pending mutations. The one hard rule
 * (system-overview.md's "Data that must survive a crash" note): every
 * mutation is written here *before* any network attempt, so a save made
 * offline — or one that fires just as the connection drops — is never
 * silently lost. Its own database (`noted-write-queue`), separate from the
 * IndexedDB Cache: this is the one store in the client that's a real source
 * of truth (an unsynced edit), not a disposable cache.
 *
 * Three op shapes, FIFO by auto-incrementing `id`:
 *   - `create` — a new note (no server filename yet; the Sync Manager
 *     assigns one on successful drain)
 *   - `update` — `filename` + whichever fields changed, plus `baseUpdated`
 *     (the client's last-seen `updated`) so the server can detect a
 *     conflict instead of silently overwriting (spec.md §7)
 *   - `delete` — `filename`
 */

const DB_NAME = "noted-write-queue";
const DB_VERSION = 1;
const STORE = "queue";

/**
 * @typedef {{ title: string, body: string }} CreateInput
 * @typedef {{ filename: string, title?: string, body?: string, tags?: string[], baseUpdated: string }} UpdateInput
 * @typedef {{ filename: string }} DeleteInput
 *
 * @typedef {{ id: number, op: "create", queuedAt: string } & CreateInput} CreateOp
 * @typedef {{ id: number, op: "update", queuedAt: string } & UpdateInput} UpdateOp
 * @typedef {{ id: number, op: "delete", queuedAt: string } & DeleteInput} DeleteOp
 * @typedef {CreateOp | UpdateOp | DeleteOp} QueuedWrite
 */

/** @type {Promise<IDBDatabase> | null} */
let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id", autoIncrement: true });
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
 * @param {IDBTransactionMode} mode
 * @returns {Promise<IDBObjectStore>}
 */
async function store(mode) {
  const db = await openDb();
  return db.transaction(STORE, mode).objectStore(STORE);
}

/**
 * Append a mutation. Resolves once it's durably written — callers should
 * `await` this *before* attempting the network call, not after.
 * @param {{ op: "create" } & CreateInput
 *   | { op: "update" } & UpdateInput
 *   | { op: "delete" } & DeleteInput} entry
 * @returns {Promise<QueuedWrite>}
 */
export async function enqueue(entry) {
  const s = await store("readwrite");
  const withMeta = { ...entry, queuedAt: new Date().toISOString() };
  const id = await promisify(
    /** @type {IDBRequest<number>} */ (s.add(withMeta)),
  );
  return /** @type {QueuedWrite} */ ({ ...withMeta, id });
}

/** All pending writes, oldest first (drain order). @returns {Promise<QueuedWrite[]>} */
export async function list() {
  const s = await store("readonly");
  return promisify(/** @type {IDBRequest<QueuedWrite[]>} */ (s.getAll()));
}

/** Drop an entry once it's been successfully applied to the server.
 * @param {number} id */
export async function remove(id) {
  const s = await store("readwrite");
  await promisify(s.delete(id));
}
