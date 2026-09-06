/**
 * M3 browser test (notes/development.md §4) — the Backlinks Panel.
 *
 * Goal proven: with note A linking to note B via `[[B]]`, opening B in the
 * app shows A in its backlinks panel with a context snippet, and clicking that
 * entry navigates to A.
 *
 * Playwright drives the system Chrome (`channel: "chrome"`); the server runs
 * in-process against a throwaway vault, serving the real `public/` shell.
 */

import { assert, assertStringIncludes } from "@std/assert";
import { fromFileUrl } from "@std/path";
import { type Browser, chromium } from "playwright";
import { createApp } from "../../src/router.ts";
import { NoteIndex } from "../../src/note-index.ts";

const TOKEN = "test-token";
const STATIC_DIR = fromFileUrl(new URL("../../public/", import.meta.url));

Deno.test({
  name: "backlinks panel lists linking notes and navigates to them",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const notesDir = await Deno.makeTempDir({ prefix: "noted-bl-" });
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

    let browser: Browser | undefined;
    try {
      browser = await chromium.launch({ channel: "chrome" });
      const context = await browser.newContext();
      await context.addInitScript(
        (token) => localStorage.setItem("noted.token", token),
        TOKEN,
      );
      const page = await context.newPage();
      await page.goto(base);

      // Note A links to B; B does not exist yet.
      await page.getByRole("button", { name: "New note" }).click();
      await page.locator("input.title").fill("Alpha");
      await page.locator("textarea").fill("See [[Beta]] for the plan.");
      await page.getByRole("button", { name: "Save" }).click();
      await page.locator("button.delete").waitFor();

      // Create B.
      await page.getByRole("button", { name: "Back" }).click();
      await page.getByRole("button", { name: "New note" }).click();
      await page.locator("input.title").fill("Beta");
      await page.locator("textarea").fill("The beta plan.");
      await page.getByRole("button", { name: "Save" }).click();
      await page.locator("button.delete").waitFor();

      // On Beta, the backlinks panel should show Alpha with a snippet.
      const panel = page.locator("backlinks-panel");
      await panel.getByRole("button", { name: "Alpha" }).waitFor();
      assertStringIncludes(await panel.innerText(), "See Beta for the plan.");

      // Clicking the backlink navigates to Alpha.
      await panel.getByRole("button", { name: "Alpha" }).click();
      await page.waitForFunction(() => location.hash === "#/note/alpha.md");
      assert(
        (await page.locator("input.title").inputValue()) === "Alpha",
        "editor should now show Alpha",
      );
      assertStringIncludes(
        await page.locator("textarea").inputValue(),
        "[[Beta]]",
      );
    } finally {
      await browser?.close();
      await server.shutdown();
      await Deno.remove(notesDir, { recursive: true });
    }
  },
});
