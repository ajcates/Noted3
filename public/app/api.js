// @ts-check
/**
 * API Client (system-overview.md §1).
 *
 * The one place the client talks to the server — every view goes through
 * these functions, never `fetch` directly. Plain functions, no class needed.
 * The shared auth token (spec.md §11) lives in IndexedDB (`token-store.js`,
 * not `localStorage` — see that file's header) and is attached to every
 * request here.
 */

export { getToken, setToken } from "./token-store.js";
import { getToken } from "./token-store.js";

export class ApiError extends Error {
  /**
   * @param {number} status
   * @param {string} message
   */
  constructor(status, message) {
    super(message);
    this.name = "ApiError";
    /** @type {number} */
    this.status = status;
  }
}

/**
 * @typedef {{ filename: string, title: string, tags: string[], updated: string, snippet: string, backlinkCount: number }} NoteSummary
 * @typedef {{ target: string, resolved: boolean, filename: string | null, title: string | null }} OutgoingLink
 * @typedef {NoteSummary & { created: string, body: string, links: OutgoingLink[], html: string }} NoteDetail
 * @typedef {{ filename: string, title: string, snippet: string }} Backlink
 * @typedef {NoteSummary} SearchResult
 * @typedef {{ tag: string, count: number }} TagCount
 */

/**
 * @param {string} path
 * @param {RequestInit} [init]
 * @returns {Promise<unknown>}
 */
async function request(path, init = {}) {
  /** @type {Record<string, string>} */
  const headers = { authorization: `Bearer ${await getToken()}` };
  if (init.body !== undefined) headers["content-type"] = "application/json";

  let res;
  try {
    res = await fetch(path, {
      ...init,
      headers: { ...headers, ...init.headers },
    });
  } catch (cause) {
    throw new ApiError(0, `network error: ${String(cause)}`);
  }

  if (res.status === 204) return null;

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const message = data && typeof data.error === "string"
      ? data.error
      : `${res.status} ${res.statusText}`;
    throw new ApiError(res.status, message);
  }
  return data;
}

/** @returns {Promise<NoteSummary[]>} */
export async function listNotes() {
  return /** @type {NoteSummary[]} */ (await request("/api/notes"));
}

/**
 * @param {string} filename
 * @returns {Promise<NoteDetail>}
 */
export async function getNote(filename) {
  return /** @type {NoteDetail} */ (
    await request(`/api/notes/${encodeURIComponent(filename)}`)
  );
}

/**
 * @param {{ title: string, body?: string }} input
 * @returns {Promise<NoteDetail>}
 */
export async function createNote(input) {
  return /** @type {NoteDetail} */ (
    await request("/api/notes", { method: "POST", body: JSON.stringify(input) })
  );
}

/**
 * @param {string} filename
 * @param {{ title?: string, body?: string, tags?: string[] }} patch
 * @returns {Promise<NoteDetail>}
 */
export async function updateNote(filename, patch) {
  return /** @type {NoteDetail} */ (
    await request(`/api/notes/${encodeURIComponent(filename)}`, {
      method: "PUT",
      body: JSON.stringify(patch),
    })
  );
}

/**
 * @param {string} filename
 * @returns {Promise<void>}
 */
export async function deleteNote(filename) {
  await request(`/api/notes/${encodeURIComponent(filename)}`, {
    method: "DELETE",
  });
}

/**
 * @param {string} filename
 * @returns {Promise<Backlink[]>}
 */
export async function getBacklinks(filename) {
  return /** @type {Backlink[]} */ (
    await request(`/api/notes/${encodeURIComponent(filename)}/backlinks`)
  );
}

/**
 * @param {string} q
 * @returns {Promise<SearchResult[]>}
 */
export async function search(q) {
  return /** @type {SearchResult[]} */ (
    await request(`/api/search?q=${encodeURIComponent(q)}`)
  );
}

/** @returns {Promise<TagCount[]>} */
export async function getTags() {
  return /** @type {TagCount[]} */ (await request("/api/tags"));
}

/**
 * @param {string} tag
 * @returns {Promise<NoteSummary[]>}
 */
export async function getNotesByTag(tag) {
  return /** @type {NoteSummary[]} */ (
    await request(`/api/tags/${encodeURIComponent(tag)}`)
  );
}
