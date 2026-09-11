// @ts-check
/**
 * Sync Manager (system-overview.md §1, spec.md §7).
 *
 * Drains the Write Queue against the API — immediately after a write is
 * queued if online, and on reconnect (the `online` window event) or a
 * Background Sync `sync` event relayed from the Service Worker (best-effort;
 * not every browser supports Background Sync, so `online` is the
 * cross-browser fallback, not an afterthought). Owns conflict detection: a
 * `PUT` that 409s is never silently retried or resolved — it's parked until
 * {@link SyncManager#resolveConflict} is called (by the conflict-resolution
 * UI), and the drain loop skips it on every pass until then.
 *
 * Emits `CustomEvent`s so the App Shell can react without polling:
 *   - `synced`   — `detail: { entry }` — one queued write applied
 *   - `conflict` — `detail: { filename, entry, current }` — a queued update's
 *     `updated` is stale; `current` is the server's copy right now
 *   - `conflict-resolved` — `detail: { filename }`
 *   - `drained`  — a full pass finished (queue may still be non-empty if a
 *     conflict is parked or the network failed partway through)
 */

import * as api from "./api.js";
import * as writeQueue from "./write-queue.js";
import * as idbCache from "./idb-cache.js";

export class SyncManager extends EventTarget {
  #draining = false;
  /** @type {Map<string, { entry: import("./write-queue.js").UpdateOp, current: import("./api.js").NoteDetail }>} */
  #conflicts = new Map();

  constructor() {
    super();
    globalThis.addEventListener("online", () => this.drain());
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener("message", (event) => {
        if (event.data?.type === "sync") this.drain();
      });
    }
  }

  /** The parked conflict for `filename`, if any — the App Shell reads this
   * to decide whether to render the conflict prompt over the editor.
   * @param {string} filename
   */
  getConflict(filename) {
    return this.#conflicts.get(filename) ?? null;
  }

  /** Filenames currently parked for explicit user conflict resolution. */
  conflictFilenames() {
    return [...this.#conflicts.keys()];
  }

  /** Best-effort Background Sync registration; a no-op where unsupported
   * (the `online` listener above still covers reconnect). */
  async requestBackgroundSync() {
    try {
      if (!("serviceWorker" in navigator)) return;
      const reg = /** @type {any} */ (await navigator.serviceWorker.ready);
      await reg.sync?.register("noted-write-queue");
    } catch {
      // Unsupported (no Background Sync API) or registration failed — fine,
      // `online` is the fallback.
    }
  }

  /** Call after enqueueing a write; attempts a drain right away if online. */
  kick() {
    if (navigator.onLine) this.drain();
  }

  /** Walk the Write Queue in FIFO order, applying each entry. Stops (without
   * throwing) at the first network failure — offline, try again next
   * trigger — but keeps going past a parked conflict so one stuck update
   * doesn't block e.g. a queued delete of a different note. */
  async drain() {
    if (this.#draining) return;
    this.#draining = true;
    try {
      const entries = await writeQueue.list();
      for (const entry of entries) {
        if (entry.op === "update" && this.#conflicts.has(entry.filename)) {
          continue; // parked — wait for resolveConflict
        }
        const outcome = await this.#apply(entry);
        if (outcome === "applied") {
          await writeQueue.remove(entry.id);
          this.dispatchEvent(new CustomEvent("synced", { detail: { entry } }));
        } else if (outcome === "network-error") {
          break;
        }
        // "conflict": already parked + event dispatched in #apply; move on.
      }
    } finally {
      this.#draining = false;
      this.dispatchEvent(new CustomEvent("drained"));
    }
  }

  /**
   * @param {import("./write-queue.js").QueuedWrite} entry
   * @returns {Promise<"applied" | "conflict" | "network-error">}
   */
  async #apply(entry) {
    try {
      if (entry.op === "create") {
        const created = await api.createNote({
          title: entry.title,
          body: entry.body,
        });
        await idbCache.putNote(created);
        return "applied";
      }
      if (entry.op === "delete") {
        await api.deleteNote(entry.filename);
        await idbCache.deleteNote(entry.filename);
        return "applied";
      }

      const result = await api.putNoteForSync(entry.filename, {
        title: entry.title,
        body: entry.body,
        tags: entry.tags,
        updated: entry.baseUpdated,
      });
      if (!result.ok && result.conflict) {
        this.#conflicts.set(entry.filename, { entry, current: result.current });
        this.dispatchEvent(
          new CustomEvent("conflict", {
            detail: {
              filename: entry.filename,
              entry,
              current: result.current,
            },
          }),
        );
        return "conflict";
      }
      if (!result.ok) return "network-error"; // some other HTTP failure
      await idbCache.putNote(result.note);
      return "applied";
    } catch (cause) {
      if (cause instanceof api.ApiError && cause.status === 0) {
        return "network-error"; // offline
      }
      throw cause; // a real bug, not a connectivity issue — don't swallow it
    }
  }

  /**
   * Resolve a parked conflict.
   * - `"mine"` reapplies the queued edit on top of the server's current
   *   `updated`, forcing it through, then clears the queue entry.
   * - `"theirs"` discards the queued edit and adopts the server's copy.
   * @param {string} filename
   * @param {"mine" | "theirs"} choice
   * @returns {Promise<import("./api.js").NoteDetail>} the note's resulting state
   */
  async resolveConflict(filename, choice) {
    const parked = this.#conflicts.get(filename);
    if (!parked) throw new Error(`no parked conflict for ${filename}`);
    const { entry, current } = parked;

    if (choice === "theirs") {
      await writeQueue.remove(entry.id);
      await idbCache.putNote(current);
      this.#conflicts.delete(filename);
      this.dispatchEvent(
        new CustomEvent("conflict-resolved", { detail: { filename } }),
      );
      return current;
    }

    const result = await api.putNoteForSync(filename, {
      title: entry.title,
      body: entry.body,
      tags: entry.tags,
      updated: current.updated,
    });
    if (!result.ok) {
      // Someone else wrote again in the meantime — re-park against the new
      // current state rather than silently dropping the user's choice.
      if (result.conflict) {
        this.#conflicts.set(filename, { entry, current: result.current });
      }
      throw new Error("could not apply — conflict again, try once more");
    }
    await writeQueue.remove(entry.id);
    await idbCache.putNote(result.note);
    this.#conflicts.delete(filename);
    this.dispatchEvent(
      new CustomEvent("conflict-resolved", { detail: { filename } }),
    );
    return result.note;
  }
}
