/**
 * Config Loader (system-overview.md §1).
 *
 * Reads `NOTES_DIR`, `PORT`, and `AUTH_TOKEN` from an environment and returns
 * a typed {@link Config}. Fails fast — the roadmap (M1) wants a boot-time
 * error if `NOTES_DIR` is missing or not a directory, so this deliberately
 * does one `stat` rather than staying purely env-in/config-out.
 */

import type { Config } from "./types.ts";

/** Minimal view of the environment, so tests can pass a plain object. */
export interface Env {
  get(key: string): string | undefined;
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

const DEFAULT_PORT = 8000;

/**
 * Resolve runtime config from `env`, verifying that `NOTES_DIR` points at an
 * existing directory.
 *
 * @throws {ConfigError} if `NOTES_DIR` is unset / not a directory, `PORT` is
 *   not a valid port number, or `AUTH_TOKEN` is unset or blank.
 */
export async function loadConfig(env: Env): Promise<Config> {
  const notesDir = env.get("NOTES_DIR")?.trim();
  if (!notesDir) {
    throw new ConfigError("NOTES_DIR is required");
  }

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

  const port = parsePort(env.get("PORT"));

  const authToken = env.get("AUTH_TOKEN")?.trim();
  if (!authToken) {
    throw new ConfigError("AUTH_TOKEN is required");
  }

  return { notesDir, port, authToken };
}

function parsePort(raw: string | undefined): number {
  if (raw === undefined || raw.trim() === "") return DEFAULT_PORT;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new ConfigError(`PORT must be an integer in 1..65535, got: ${raw}`);
  }
  return port;
}
