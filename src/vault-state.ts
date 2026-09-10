/**
 * Vault State (M7, `notes/roadmap.md`) — per-vault auth token persistence.
 *
 * `noted` is launched with no config from inside a vault directory, so it
 * needs a stable `AUTH_TOKEN` across restarts (same origin → same
 * `localStorage`, per `public/app/api.js` — a token that changed every run
 * would log the browser out each time). The token lives *outside*
 * `NOTES_DIR` — that directory is now a git-backed vault (`src/git-backup.ts`),
 * and a secret has no business inside something that gets committed.
 *
 * One JSON file per vault, named by a hash of its absolute path, under a
 * caller-supplied state directory (normally `~/.noted/vaults/`, resolved by
 * {@link resolveStateDir}).
 */

import { join } from "@std/path";

/** Minimal view of the environment, so tests can pass a plain object. */
export interface HomeEnv {
  get(key: string): string | undefined;
}

export class VaultStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VaultStateError";
  }
}

/** `~/.noted/vaults` — `HOME` on Unix, `USERPROFILE` on Windows. */
export function resolveStateDir(env: HomeEnv): string {
  const home = env.get("HOME") ?? env.get("USERPROFILE");
  if (!home) {
    throw new VaultStateError(
      "cannot resolve a home directory (HOME/USERPROFILE unset) to store the vault token",
    );
  }
  return join(home, ".noted", "vaults");
}

interface VaultStateFile {
  readonly notesDir: string;
  readonly token: string;
  readonly createdAt: string;
}

async function hashPath(absPath: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(absPath),
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Return the token for `notesDirAbs` (an already-resolved absolute path),
 * creating and persisting a new random one under `stateDir` on first use.
 */
export async function getOrCreateToken(
  notesDirAbs: string,
  stateDir: string,
): Promise<string> {
  const path = join(stateDir, `${await hashPath(notesDirAbs)}.json`);

  try {
    const existing = JSON.parse(
      await Deno.readTextFile(path),
    ) as VaultStateFile;
    if (typeof existing.token === "string" && existing.token.length > 0) {
      return existing.token;
    }
  } catch (cause) {
    if (!(cause instanceof Deno.errors.NotFound)) throw cause;
  }

  const state: VaultStateFile = {
    notesDir: notesDirAbs,
    token: randomToken(),
    createdAt: new Date().toISOString(),
  };
  await Deno.mkdir(stateDir, { recursive: true });

  // Same atomic-write pattern as `file-store.ts`: temp file + rename, so a
  // crash mid-write can't corrupt the token file, and a concurrent
  // `getOrCreateToken` for the same vault can't observe a half-written one.
  const tmp = join(stateDir, `.${crypto.randomUUID()}.tmp`);
  try {
    await Deno.writeTextFile(tmp, JSON.stringify(state, null, 2) + "\n");
    await Deno.rename(tmp, path);
  } catch (cause) {
    await Deno.remove(tmp).catch(() => {});
    throw cause;
  }
  return state.token;
}
