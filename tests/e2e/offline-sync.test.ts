/**
 * M6 end-to-end test (notes/development.md §4, spec.md §7).
 *
 * Goal being proven: the offline-first read/write path — Write Queue, IndexedDB
 * Cache, Sync Manager, and the conflict-resolution UI — actually works from a
 * real browser, not just in isolated unit tests of each module. Two scenarios:
 *
 *   1. Offline edit -> reconnect: an edit made while offline is queued, not
 *      lost, and lands on disk once the app is back online and syncs.
 *   2. Conflict -> resolve: a queued edit whose base `updated` has gone stale
 *      (another writer changed the note first) is parked as a conflict and
 *      surfaced in the editor, rather than silently overwriting or dropping
 *      either side; resolving with "Keep mine" forces the local edit through.
 *
 * Uses Playwright driving the system Chrome (`channel: "chrome"`), so no
 * browser download is needed. The server runs in-process against a throwaway
 * `NOTES_DIR`, serving the real `public/` shell (Service Worker included).
 */

import { assertStringIncludes } from "@std/assert";
import { fromFileUrl, join } from "@std/path";
import type { Browser } from "playwright";
import { createApp } from "../../src/router.ts";
import { NoteIndex } from "../../src/note-index.ts";
import { fillEditor, launchBrowser } from "./_support.ts";

const TOKEN = "test-token";
const STATIC_DIR = fromFileUrl(new URL("../../public/", import.meta.url));

Deno.test({
  name:
    "offline sync: a queued edit made offline lands on disk after reconnect",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const notesDir = await Deno.makeTempDir({ prefix: "noted-pw-" });
    const index = await NoteIndex.build(notesDir);
    const server = Deno.serve(
      { port: 0, onListen: () => {} },
      createApp({ notesDir, port: 0, authToken: TOKEN }, {
        index,
        staticDir: STATIC_DIR,
      }),
    );
    const { port } = server.addr as Deno.NetAddr;
    const base = `http://localhost:${port}`;
    const notePath = join(notesDir, "trip-plan.md");

    let browser: Browser | undefined;
    try {
      browser = await launchBrowser();
      const context = await browser.newContext();
      await context.addInitScript(
        (token) => localStorage.setItem("noted.token", token),
        TOKEN,
      );
      const page = await context.newPage();

      await page.goto(base);

      // --- create + open, online ---
      await page.getByRole("button", { name: "New note" }).click();
      await page.locator("input.title").fill("Trip Plan");
      await fillEditor(page, "day 1: arrive");
      await page.getByRole("button", { name: "Save" }).click();
      await page.locator("note-editor .actions button.delete").waitFor();

      // --- go offline and edit ---
      await context.setOffline(true);
      await fillEditor(page, "day 1: arrive\nday 2: hike");
      await page.getByRole("button", { name: "Save" }).click();
      await page.getByText("Saved offline").waitFor();

      // the edit must not have reached the server while offline
      assertStringIncludes(
        await Deno.readTextFile(notePath),
        "day 1: arrive",
      );

      // --- reconnect and let the app shell drain the write queue ---
      await context.setOffline(false);
      await page.reload();
      await page.getByText("day 2: hike", { exact: false }).waitFor({
        timeout: 10_000,
      });

      const synced = await Deno.readTextFile(notePath);
      assertStringIncludes(synced, "day 2: hike");
    } finally {
      await browser?.close();
      await server.shutdown();
      await Deno.remove(notesDir, { recursive: true });
    }
  },
});

Deno.test({
  name:
    "conflict resolution: a stale queued edit is parked and 'Keep mine' forces it through",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const notesDir = await Deno.makeTempDir({ prefix: "noted-pw-" });
    const index = await NoteIndex.build(notesDir);
    const server = Deno.serve(
      { port: 0, onListen: () => {} },
      createApp({ notesDir, port: 0, authToken: TOKEN }, {
        index,
        staticDir: STATIC_DIR,
      }),
    );
    const { port } = server.addr as Deno.NetAddr;
    const base = `http://localhost:${port}`;
    const notePath = join(notesDir, "conflict-note.md");

    let browser: Browser | undefined;
    try {
      browser = await launchBrowser();
      const context = await browser.newContext();
      await context.addInitScript(
        (token) => localStorage.setItem("noted.token", token),
        TOKEN,
      );
      const page = await context.newPage();

      await page.goto(base);

      // --- create + open, online ---
      await page.getByRole("button", { name: "New note" }).click();
      await page.locator("input.title").fill("Conflict Note");
      await fillEditor(page, "original body");
      await page.getByRole("button", { name: "Save" }).click();
      await page.locator("note-editor .actions button.delete").waitFor();

      // --- go offline and queue a local edit ---
      await context.setOffline(true);
      await fillEditor(page, "my offline edit");
      await page.getByRole("button", { name: "Save" }).click();
      await page.getByText("Saved offline").waitFor();

      // --- a second writer changes the note server-side in the meantime
      // (a direct request from outside the browser's offline context —
      // omitting `updated` force-overwrites, same as any other client that
      // doesn't know about the conflict protocol) ---
      const putRes = await fetch(`${base}/api/notes/conflict-note.md`, {
        method: "PUT",
        headers: {
          authorization: `Bearer ${TOKEN}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ body: "someone else's edit" }),
      });
      if (!putRes.ok) throw new Error(`setup PUT failed: ${putRes.status}`);

      // --- reconnect: the queued edit's base `updated` is now stale, so the
      // drain should park it as a conflict instead of overwriting ---
      await context.setOffline(false);
      await page.reload();
      await page.getByText("Keep mine").waitFor({ timeout: 10_000 });
      await page.getByText("Keep the other version").waitFor();

      // the server must still show the second writer's edit — not silently
      // clobbered by the stale queued one
      assertStringIncludes(
        await Deno.readTextFile(notePath),
        "someone else's edit",
      );

      // --- resolve by keeping mine: forces the local edit through ---
      await page.getByRole("button", { name: "Keep mine" }).click();
      await page.getByText("Keep mine").waitFor({ state: "detached" });

      assertStringIncludes(
        await Deno.readTextFile(notePath),
        "my offline edit",
      );
    } finally {
      await browser?.close();
      await server.shutdown();
      await Deno.remove(notesDir, { recursive: true });
    }
  },
});
