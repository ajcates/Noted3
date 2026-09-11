import { assertEquals } from "@std/assert";
import { fromFileUrl, join } from "@std/path";
import type { Browser } from "playwright";
import { createApp } from "../../src/router.ts";
import { NoteIndex } from "../../src/note-index.ts";
import { launchBrowser } from "./_support.ts";
import {
  buildVaultTree,
  findFolder,
  folderName,
  noteFolder,
} from "../../public/app/vault-tree.js";

const TOKEN = "test-token";
const STATIC_DIR = fromFileUrl(new URL("../../public/", import.meta.url));

Deno.test("folder tree groups, sorts, and counts nested note paths", () => {
  const summary = (
    filename: string,
    title: string,
  ): import("../../public/app/api.js").NoteSummary => ({
    filename,
    title,
    tags: [],
    updated: "2026-09-11T00:00:00.000Z",
    excerpt: "",
    backlinkCount: 0,
  });
  const root = buildVaultTree([
    summary("z.md", "Zed"),
    summary("work/planning/b.md", "Beta"),
    summary("work/a.md", "Alpha"),
    summary("archive/c.md", "Charlie"),
  ], ["empty", "work/ideas"]);

  assertEquals(root.noteCount, 4);
  assertEquals(root.folders.map((folder) => folder.name), [
    "archive",
    "empty",
    "work",
  ]);
  assertEquals(findFolder(root, "empty")?.noteCount, 0);
  assertEquals(findFolder(root, "work/ideas")?.noteCount, 0);
  assertEquals(findFolder(root, "work")?.noteCount, 2);
  assertEquals(findFolder(root, "work/planning")?.notes[0]?.title, "Beta");
  assertEquals(findFolder(root, "missing"), null);
  assertEquals(noteFolder("work/planning/b.md"), "work/planning");
  assertEquals(folderName("work/planning"), "planning");
});

Deno.test({
  name: "client: folder views and sidebar navigate a nested vault",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const notesDir = await Deno.makeTempDir({ prefix: "noted-folder-pw-" });
    await Deno.mkdir(join(notesDir, "work", "planning"), { recursive: true });
    await Deno.writeTextFile(join(notesDir, "inbox.md"), "# Inbox\n");
    await Deno.writeTextFile(
      join(notesDir, "work", "project-brief.md"),
      "# Project brief\n",
    );
    await Deno.writeTextFile(
      join(notesDir, "work", "planning", "next-steps.md"),
      "# Next steps\n",
    );
    const index = await NoteIndex.build(notesDir);
    const server = Deno.serve(
      { port: 0, onListen: () => {} },
      createApp({ notesDir, port: 0, authToken: TOKEN }, {
        index,
        staticDir: STATIC_DIR,
      }),
    );
    const { port } = server.addr as Deno.NetAddr;
    let browser: Browser | undefined;

    try {
      browser = await launchBrowser();
      const context = await browser.newContext({
        viewport: { width: 1280, height: 800 },
      });
      await context.addInitScript(
        (token) => localStorage.setItem("noted.token", token),
        TOKEN,
      );
      const page = await context.newPage();
      await page.goto(`http://localhost:${port}`);

      await page.locator("vault-sidebar").getByRole("link", {
        name: "Browse folders",
      }).click();
      await page.locator("folder-view").getByRole("heading", {
        name: "Folders",
      }).waitFor();

      await page.locator("folder-view").getByRole("button", {
        name: "New folder",
      }).click();
      await page.getByLabel("Folder name").fill("Empty");
      await page.getByRole("button", { name: "Create folder" }).click();
      await page.locator("folder-view").getByRole("heading", {
        name: "Empty",
        exact: true,
      }).waitFor();
      assertEquals(
        await Deno.stat(join(notesDir, "Empty")).then((s) => s.isDirectory),
        true,
      );

      await page.getByRole("navigation", { name: "Folder path" }).getByRole(
        "link",
        { name: "Folders", exact: true },
      ).click();
      await page.locator("folder-view").getByRole("button", {
        name: "Rename Empty",
      }).click();
      await page.getByLabel("Folder name").fill("Archive");
      await page.getByRole("button", { name: "Rename folder" }).click();
      await page.locator("folder-view").getByRole("link", {
        name: /Archive/i,
      }).waitFor();
      await page.locator("vault-sidebar").getByRole("link", {
        name: /Archive/,
      }).waitFor();
      assertEquals(
        await Deno.stat(join(notesDir, "Archive")).then((s) => s.isDirectory),
        true,
      );

      await page.locator("folder-view").getByRole("link", {
        name: /work/i,
      }).click();
      assertEquals(page.url().includes("#/folder/work"), true);
      await page.locator("folder-view").getByRole("button", {
        name: "Project brief",
      }).click();
      await page.locator("input.title").waitFor();
      assertEquals(
        await page.locator("input.title").inputValue(),
        "Project brief",
      );

      await page.locator("vault-sidebar").getByRole("button", {
        name: "Expand planning",
      }).click();
      await page.locator("vault-sidebar").getByRole("link", {
        name: "Next steps",
      }).click();
      await page.locator("input.title").waitFor();
      assertEquals(
        await page.locator("input.title").inputValue(),
        "Next steps",
      );

      // The sidebar is populated even when a browse route is loaded directly,
      // rather than only after the all-notes view has already fetched it.
      await page.goto(`http://localhost:${port}/#/tags`);
      await page.locator("tag-browser").waitFor();
      await page.locator("vault-sidebar").getByRole("link", {
        name: "Inbox",
      }).waitFor();

      await page.goto(`http://localhost:${port}/#/search`);
      await page.locator("search-view").waitFor();
      await page.locator("vault-sidebar").getByRole("link", {
        name: "Inbox",
      }).waitFor();

      await page.setViewportSize({ width: 390, height: 780 });
      assertEquals(
        await page.locator("vault-sidebar").getAttribute("aria-hidden"),
        "true",
      );
      await page.getByRole("button", { name: "Open navigation" }).click();
      await page.locator("vault-sidebar.open").waitFor();
      assertEquals(
        await page.locator("vault-sidebar").getAttribute("aria-hidden"),
        "false",
      );
      await page.getByRole("button", { name: "Close navigation" }).first()
        .click();
      await page.locator("vault-sidebar.open").waitFor({ state: "detached" });
    } finally {
      await browser?.close();
      await server.shutdown();
      await Deno.remove(notesDir, { recursive: true });
    }
  },
});
