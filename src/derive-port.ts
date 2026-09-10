/**
 * Deterministic per-directory port (M7, `notes/roadmap.md`).
 *
 * `noted` is meant to be launched from any vault directory with no config —
 * so the port it listens on is derived from the vault's absolute path
 * instead of always defaulting to one fixed number. Running it from the same
 * directory always gets the same port back; a different directory almost
 * always gets a different one (FNV-1a isn't collision-free, so two distinct
 * paths could in principle hash to the same port — see `ISSUES.md`).
 */

const MIN_PORT = 20_000;
/** Exclusive upper bound — keeps the range comfortably clear of ephemeral/registered ports. */
const MAX_PORT = 65_000;
const RANGE = MAX_PORT - MIN_PORT;

/** 32-bit FNV-1a hash. Pure, deterministic across platforms and Deno versions. */
function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Map an absolute path to a stable port in `[MIN_PORT, MAX_PORT)`.
 *
 * Callers should normalize/resolve the path first (e.g. `Deno.realPath` or at
 * least an absolute, trailing-slash-stripped form) — two different spellings
 * of the same directory otherwise hash to different ports.
 */
export function derivePort(absPath: string): number {
  return MIN_PORT + (fnv1a(absPath) % RANGE);
}
