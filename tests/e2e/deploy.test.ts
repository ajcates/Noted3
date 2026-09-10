/**
 * M7 end-to-end test (notes/development.md §4, notes/roadmap.md M7).
 *
 * Goal being proven: `noted` needs no config to run from inside a vault
 * directory — `derivePort` gives the same folder a stable port every time
 * and different folders (almost always) different ones, `vault-state`
 * persists an auth token per vault outside `NOTES_DIR`, `loadConfig` wires
 * both defaults together (while still letting an explicit env var win), and
 * `git-backup` turns a vault into a git repo and commits writes to it.
 */

import { assert, assertEquals, assertNotEquals } from "@std/assert";
import { join } from "@std/path";
import { derivePort } from "../../src/derive-port.ts";
import { getOrCreateToken, resolveStateDir } from "../../src/vault-state.ts";
import { loadConfig } from "../../src/config.ts";
import { ensureRepo, scheduleBackup } from "../../src/git-backup.ts";
import { pickOpener } from "../../src/open-browser.ts";

Deno.test("derivePort: same path always gets the same port", () => {
  const path = "/home/ajcates/example";
  assertEquals(derivePort(path), derivePort(path));
});

Deno.test("derivePort: different paths (usually) get different ports", () => {
  const a = derivePort("/home/ajcates/example");
  const b = derivePort("/home/ajcates/otherexample");
  assertNotEquals(a, b);
});

Deno.test("derivePort: always lands in the safe range", () => {
  const paths = [
    "/",
    "/a",
    "/home/ajcates/example",
    "C:\\Users\\ajcates\\notes",
    "a".repeat(500),
  ];
  for (const path of paths) {
    const port = derivePort(path);
    assert(port >= 20_000 && port < 65_000, `${port} out of range for ${path}`);
  }
});

Deno.test("vault-state: creates and then reuses the same token", async () => {
  const stateDir = await Deno.makeTempDir({ prefix: "noted-state-" });
  try {
    const first = await getOrCreateToken("/some/vault", stateDir);
    const second = await getOrCreateToken("/some/vault", stateDir);
    assertEquals(first, second);
    assert(first.length > 0);
  } finally {
    await Deno.remove(stateDir, { recursive: true });
  }
});

Deno.test("vault-state: different vaults get different tokens", async () => {
  const stateDir = await Deno.makeTempDir({ prefix: "noted-state-" });
  try {
    const a = await getOrCreateToken("/vault/a", stateDir);
    const b = await getOrCreateToken("/vault/b", stateDir);
    assertNotEquals(a, b);
  } finally {
    await Deno.remove(stateDir, { recursive: true });
  }
});

Deno.test("resolveStateDir: joins HOME with .noted/vaults", () => {
  const dir = resolveStateDir({
    get: (k) => k === "HOME" ? "/home/ajcates" : undefined,
  });
  assertEquals(dir, join("/home/ajcates", ".noted", "vaults"));
});

Deno.test("loadConfig: defaults NOTES_DIR to cwd, PORT to derivePort, AUTH_TOKEN to a persisted one", async () => {
  const notesDir = await Deno.makeTempDir({ prefix: "noted-cfg-" });
  const home = await Deno.makeTempDir({ prefix: "noted-home-" });
  try {
    const env = {
      get: (k: string) => k === "HOME" ? home : undefined,
      cwd: () => notesDir,
    };
    const config = await loadConfig(env);
    assertEquals(config.notesDir, await Deno.realPath(notesDir));
    assertEquals(config.port, derivePort(await Deno.realPath(notesDir)));
    assert(config.authToken.length > 0);

    // Re-loading from the same cwd/home must return the same token, so a
    // restart doesn't log the browser out (same origin, same token expected).
    const again = await loadConfig(env);
    assertEquals(again.authToken, config.authToken);
  } finally {
    await Deno.remove(notesDir, { recursive: true });
    await Deno.remove(home, { recursive: true });
  }
});

Deno.test("loadConfig: explicit env vars still win over every default", async () => {
  const notesDir = await Deno.makeTempDir({ prefix: "noted-cfg-" });
  const otherDir = await Deno.makeTempDir({ prefix: "noted-cfg-other-" });
  const home = await Deno.makeTempDir({ prefix: "noted-home-" });
  try {
    const values: Record<string, string> = {
      NOTES_DIR: notesDir,
      PORT: "9123",
      AUTH_TOKEN: "explicit-token",
      HOME: home,
    };
    const config = await loadConfig({
      get: (k) => values[k],
      cwd: () => otherDir,
    });
    assertEquals(config.notesDir, await Deno.realPath(notesDir));
    assertEquals(config.port, 9123);
    assertEquals(config.authToken, "explicit-token");
  } finally {
    await Deno.remove(notesDir, { recursive: true });
    await Deno.remove(otherDir, { recursive: true });
    await Deno.remove(home, { recursive: true });
  }
});

Deno.test("pickOpener: picks the right command per OS", () => {
  assertEquals(pickOpener("darwin", "http://x").cmd, "open");
  assertEquals(pickOpener("windows", "http://x").cmd, "cmd");
  assertEquals(pickOpener("linux", "http://x").cmd, "xdg-open");
  assert(pickOpener("windows", "http://x").args.includes("http://x"));
});

async function gitAvailable(): Promise<boolean> {
  try {
    return (await new Deno.Command("git", { args: ["--version"] }).output())
      .success;
  } catch {
    return false;
  }
}

Deno.test({
  name:
    "git-backup: ensureRepo inits a repo and scheduleBackup commits a write",
  ignore: !(await gitAvailable()),
  async fn() {
    const notesDir = await Deno.makeTempDir({ prefix: "noted-git-" });
    try {
      assert(await ensureRepo(notesDir));
      const gitDir = await Deno.stat(join(notesDir, ".git"));
      assert(gitDir.isDirectory);

      await Deno.writeTextFile(join(notesDir, "note.md"), "hello");
      scheduleBackup(notesDir, "noted: save note.md");

      // scheduleBackup is fire-and-forget; give its chained commit a moment.
      for (let i = 0; i < 50; i++) {
        const log = await new Deno.Command("git", {
          args: ["log", "--oneline"],
          cwd: notesDir,
        }).output();
        if (new TextDecoder().decode(log.stdout).trim().length > 0) break;
        await new Promise((r) => setTimeout(r, 20));
      }

      const log = await new Deno.Command("git", {
        args: ["log", "--oneline"],
        cwd: notesDir,
      }).output();
      const lines = new TextDecoder().decode(log.stdout).trim();
      assert(lines.includes("save note.md"), `unexpected git log: ${lines}`);
    } finally {
      await Deno.remove(notesDir, { recursive: true });
    }
  },
});

Deno.test({
  name: "git-backup: a directory that never called ensureRepo gets no commits",
  ignore: !(await gitAvailable()),
  async fn() {
    const notesDir = await Deno.makeTempDir({ prefix: "noted-git-unready-" });
    try {
      scheduleBackup(notesDir, "should be a no-op");
      await new Promise((r) => setTimeout(r, 50));
      const gitDirExists = await Deno.stat(join(notesDir, ".git")).then(
        () => true,
        () => false,
      );
      assert(!gitDirExists);
    } finally {
      await Deno.remove(notesDir, { recursive: true });
    }
  },
});
