/**
 * M4 browser test (notes/development.md §4) — the `[[` wikilink autocomplete.
 *
 * Goal proven: typing `[[` in the CodeMirror editor opens a title-filtered
 * completion list; picking an existing title inserts `[[Title]]`; picking the
 * "Create …" entry inserts the link AND creates the note (a new `.md` file
 * appears on disk).
 *
 * Playwright drives the system Chrome; the server runs in-process against a
 * throwaway vault serving the real `public/` shell (CodeMirror vendored under
 * public/vendor/).
 */

import { assert, assertStringIncludes } from "@std/assert";
import { fromFileUrl, join } from "@std/path";
import { exists } from "@std/fs";
import { type Browser, chromium } from "playwright";
import { createApp } from "../../src/router.ts";
import { NoteIndex } from "../../src/note-index.ts";
import { readEditor } from "./_support.ts";

const TOKEN = "test-token";
const STATIC_DIR = fromFileUrl(new URL("../../public/", import.meta.url));

Deno.test({
  name: "wikilink autocomplete: pick an existing title, and create a new note",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const notesDir = await Deno.makeTempDir({ prefix: "noted-ac-" });
    const index = await NoteIndex.build(notesDir);
    const server = Deno.serve(
      { port: 0, onListen: () => {} },
      createApp({
        notesDir,
        port: 0,
        authToken: TOKEN,
        themePath: "/nonexistent-theme.yaml",
      }, {
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

      // Seed a target note through the UI.
      await page.getByRole("button", { name: "New note" }).click();
      await page.locator("input.title").fill("Reading List");
      await page.getByRole("button", { name: "Save" }).click();
      await page.locator("button.delete").waitFor();

      // New note whose body will link out.
      await page.getByRole("button", { name: "Back" }).click();
      await page.getByRole("button", { name: "New note" }).click();
      await page.locator("input.title").fill("Journal");

      const editor = page.locator(".cm-content");
      const tooltip = page.locator(".cm-tooltip-autocomplete");

      // --- pick an existing title ---
      await editor.click();
      await page.keyboard.type("today I added to [[Rea");
      await tooltip.getByText("Reading List").waitFor();
      await tooltip.locator("li", { hasText: "Reading List" }).click();
      assertStringIncludes(await readEditor(page), "[[Reading List]]");

      // --- "Create …" path ---
      await editor.click();
      await page.keyboard.press("End");
      await page.keyboard.type(" and started [[Fresh Idea");
      await tooltip.getByText('Create "Fresh Idea"').waitFor();
      await tooltip.locator("li", { hasText: "Create" }).click();

      assertStringIncludes(await readEditor(page), "[[Fresh Idea]]");
      await page.getByText('Created linked note "Fresh Idea".').waitFor();
      assert(
        await exists(join(notesDir, "fresh-idea.md")),
        "the 'Create' entry should have created fresh-idea.md on disk",
      );
    } finally {
      await browser?.close();
      await server.shutdown();
      await Deno.remove(notesDir, { recursive: true });
    }
  },
});
