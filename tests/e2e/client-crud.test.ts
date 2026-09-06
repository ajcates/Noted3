/**
 * M2 end-to-end test (notes/development.md §4).
 *
 * Goal being proven: from a real browser, a user can create a note, edit it,
 * and delete it through the app shell — and each action lands on disk as the
 * matching `.md` file. Exercises the whole M2 stack: static file serving, the
 * API Client, the Note List View, and the Editor View.
 *
 * Uses Playwright driving the system Chrome (`channel: "chrome"`), so no
 * browser download is needed. The server runs in-process against a throwaway
 * `NOTES_DIR`, serving the real `public/` shell.
 */

import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { fromFileUrl, join } from "@std/path";
import { exists } from "@std/fs";
import { type Browser, chromium } from "playwright";
import { createApp } from "../../src/router.ts";
import { NoteIndex } from "../../src/note-index.ts";
import { fillEditor } from "./_support.ts";

const TOKEN = "test-token";
const STATIC_DIR = fromFileUrl(new URL("../../public/", import.meta.url));

Deno.test({
  name: "client: create, edit, and delete a note from a real browser",
  // Playwright owns a browser subprocess + sockets it tears down itself.
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
      browser = await chromium.launch({ channel: "chrome" });
      const context = await browser.newContext();
      // Provide the auth token the way a returning user would have it.
      await context.addInitScript(
        (token) => localStorage.setItem("noted.token", token),
        TOKEN,
      );
      const page = await context.newPage();
      page.on("dialog", (d) => d.accept()); // auto-confirm the delete prompt

      await page.goto(base);

      // --- create ---
      await page.getByRole("button", { name: "New note" }).click();
      await page.locator("input.title").fill("Trip Plan");
      await fillEditor(page, "day 1: arrive\nday 2: hike");
      await page.getByRole("button", { name: "Save" }).click();

      // after create, the shell routes to the saved note (Delete now shows)
      await page.locator("button.delete").waitFor();
      const created = await Deno.readTextFile(notePath);
      assertStringIncludes(created, "title: Trip Plan");
      assertStringIncludes(created, "day 2: hike");

      // --- edit ---
      await fillEditor(page, "day 1: arrive\nday 2: hike\nday 3: depart");
      await page.getByRole("button", { name: "Save" }).click();
      await page.getByText("Saved.").waitFor();
      assertStringIncludes(await Deno.readTextFile(notePath), "day 3: depart");

      // --- back to the list ---
      await page.getByRole("button", { name: "Back" }).click();
      await page.getByRole("button", { name: "Trip Plan" }).waitFor();

      // --- delete from the list ---
      await page
        .locator("li", { hasText: "Trip Plan" })
        .getByRole("button", { name: "Delete" })
        .click();
      await page.getByRole("button", { name: "Trip Plan" }).waitFor({
        state: "detached",
      });
      assertEquals(await exists(notePath), false);

      // list is back to just the seeded welcome note (none here) -> empty state
      await page.getByText("No notes yet.").waitFor();
      assert(true);
    } finally {
      await browser?.close();
      await server.shutdown();
      await Deno.remove(notesDir, { recursive: true });
    }
  },
});
