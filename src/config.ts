/**
 * Config Loader (system-overview.md §1).
 *
 * Reads `NOTES_DIR`, `PORT`, and `AUTH_TOKEN` from an environment and returns
 * a typed {@link Config}. Fails fast if `NOTES_DIR` is set but not a real
 * directory.
 *
 * M7 (`notes/roadmap.md`) changed what "unset" means for all three: `noted`
 * is meant to be launched from inside a vault with no config at all, so each
 * one now has a deterministic default instead of being required —
 * `NOTES_DIR` defaults to the current directory, `PORT` to a hash of its
 * absolute path ({@link derivePort} — same folder, same port, every time),
 * and `AUTH_TOKEN` to a token persisted per-vault outside `NOTES_DIR`
 * ({@link getOrCreateToken}, so it never ends up inside the git-backed vault).
 * An explicit env var still wins over all three defaults, so `deno task dev`
 * / `deno task start` / the test suite are unaffected.
 */

import { resolve } from "@std/path";
import type { Config } from "./types.ts";
import { derivePort } from "./derive-port.ts";
import { getOrCreateToken, resolveStateDir } from "./vault-state.ts";

/** Minimal view of the environment, so tests can pass a plain object. */
export interface Env {
  get(key: string): string | undefined;
  /** Defaults to `Deno.cwd()` in production; injectable for tests. */
  cwd(): string;
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

/**
 * Resolve runtime config from `env`. `NOTES_DIR`/`PORT`/`AUTH_TOKEN` each
 * fall back to a deterministic default when unset (see module doc); an
 * explicit env var always wins.
 *
 * @throws {ConfigError} if `NOTES_DIR` (given or defaulted) isn't a real
 *   directory, or `PORT` is given but not a valid port number.
 */
export async function loadConfig(env: Env): Promise<Config> {
  const notesDir = resolve(env.get("NOTES_DIR")?.trim() || env.cwd());

  let stat: Deno.FileInfo;
  try {
    stat = await Deno.stat(notesDir);
  } catch (cause) {
    if (cause instanceof Deno.errors.NotFound) {
      throw new ConfigError(`NOTES_DIR does not exist: ${notesDir}`);
    }
    throw new ConfigError(
      `NOTES_DIR could not be read: ${notesDir} (${(cause as Error).message})`,
    );
  }
  if (!stat.isDirectory) {
    throw new ConfigError(`NOTES_DIR is not a directory: ${notesDir}`);
  }

  const port = parsePort(env.get("PORT")) ?? derivePort(notesDir);

  const authToken = env.get("AUTH_TOKEN")?.trim() ||
    await getOrCreateToken(notesDir, resolveStateDir(env));

  return { notesDir, port, authToken };
}

/** `undefined` means "unset — use the derived default", not "use 8000". */
function parsePort(raw: string | undefined): number | undefined {
  if (raw === undefined || raw.trim() === "") return undefined;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new ConfigError(`PORT must be an integer in 1..65535, got: ${raw}`);
  }
  return port;
}
