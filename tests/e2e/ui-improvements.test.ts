/** End-to-end coverage for the responsive UI-improvements branch. */

import { assert, assertEquals } from "@std/assert";
import { basename, fromFileUrl, join } from "@std/path";
import type { Browser } from "playwright";
import { createApp } from "../../src/router.ts";
import { NoteIndex } from "../../src/note-index.ts";
import { fillEditor, launchBrowser, readEditor } from "./_support.ts";

const TOKEN = "test-token";
const STATIC_DIR = fromFileUrl(new URL("../../public/", import.meta.url));

Deno.test({
  name:
    "UI improvements: desktop workspace, search, preferences, and mobile capture",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const notesDir = await Deno.makeTempDir({ prefix: "noted-ui-" });
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
    const apiCall = (path: string, init: RequestInit = {}) =>
      fetch(base + path, {
        ...init,
        headers: {
          authorization: `Bearer ${TOKEN}`,
          "content-type": "application/json",
          ...(init.headers ?? {}),
        },
      });

    for (
      const [title, body, tags] of [
        ["Alpha", "A project overview with [[Beta]]", ["project", "active"]],
        ["Beta", "Linked reference", ["reference"]],
        ["Gamma", "Another project note", ["project"]],
      ] as const
    ) {
      const created = await (await apiCall("/api/notes", {
        method: "POST",
        body: JSON.stringify({ title, body }),
      })).json();
      await apiCall(`/api/notes/${created.filename}`, {
        method: "PUT",
        body: JSON.stringify({ tags }),
      });
    }

    let browser: Browser | undefined;
    try {
      browser = await launchBrowser();
      const desktop = await browser.newContext({
        viewport: { width: 1280, height: 820 },
        reducedMotion: "reduce",
      });
      await desktop.addInitScript(
        (token) => localStorage.setItem("noted.token", token),
        TOKEN,
      );
      const page = await desktop.newPage();
      await page.goto(base);

      await page.locator(".vault-name").getByText(basename(notesDir), {
        exact: true,
      }).waitFor();
      await page.locator(".vault-count").getByText("3 notes", {
        exact: true,
      }).waitFor();
      assert(await page.locator(".browser-pane").isVisible());
      assert(await page.locator(".detail-pane").isVisible());
      await page.getByLabel("Sort notes").selectOption("title");
      await page.getByLabel("Use compact cards").click();
      await page.reload();
      assertEquals(await page.getByLabel("Sort notes").inputValue(), "title");
      assert(await page.locator("note-list.compact").isVisible());

      await page.getByRole("link", { name: "Search" }).click();
      await page.getByPlaceholder("Search your notes…").fill("project");
      await page.getByRole("button", { name: "Tags" }).click();
      await page.getByText("2 matches").waitFor();
      assert((await page.locator("mark").count()) >= 2);

      assertEquals(await page.locator(".app-footer").count(), 0);
      await page.getByLabel("Appearance and settings").click();
      await page.getByText("Private vault access").waitFor();
      await page.getByRole("button", { name: /Paper/ }).click();
      assertEquals(
        await page.evaluate(() => document.documentElement.dataset.theme),
        "paper",
      );
      const animationDuration = await page.locator(".note-card").first()
        .evaluate((node) => getComputedStyle(node).transitionDuration);
      assert(animationDuration.includes("0.12s"));
      if (Deno.env.get("NOTED_CAPTURE_UI") === "1") {
        await page.screenshot({
          path: "/tmp/noted-ui-desktop.png",
          fullPage: true,
        });
        await page.getByRole("button", { name: "Alpha" }).first().click();
        await page.locator("note-editor").waitFor();
        await page.screenshot({
          path: "/tmp/noted-ui-desktop-editor.png",
          fullPage: true,
        });
      }

      const mobile = await browser.newContext({
        viewport: { width: 390, height: 844 },
      });
      await mobile.addInitScript(
        (token) => localStorage.setItem("noted.token", token),
        TOKEN,
      );
      const phone = await mobile.newPage();
      await phone.goto(base);
      assert(await phone.locator(".vault-count").isVisible());
      await phone.getByRole("button", { name: "New note" }).click();
      assertEquals(
        await phone.locator("dialog.sheet").evaluate((node) =>
          getComputedStyle(node, "::before").display
        ),
        "block",
      );
      await phone.getByLabel("Note title").fill("Pocket thought");
      await phone.getByLabel("Note text").fill("Captured on a phone");
      await phone.goBack();
      await phone.locator("dialog.sheet").waitFor({ state: "detached" });
      assertEquals(new URL(phone.url()).hash, "#/");
      await phone.getByRole("button", { name: "New note" }).click();
      assertEquals(
        await phone.getByLabel("Note title").inputValue(),
        "Pocket thought",
      );
      if (Deno.env.get("NOTED_CAPTURE_UI") === "1") {
        await phone.screenshot({ path: "/tmp/noted-ui-mobile.png" });
      }
      await phone.getByRole("button", { name: "Save note" }).click();
      await phone.locator("note-editor .actions button.delete").waitFor();
      assertEquals(
        await phone.locator(".workspace").getAttribute("data-direction"),
        "forward",
      );
      assert(await Deno.stat(join(notesDir, "pocket-thought.md")));
      if (Deno.env.get("NOTED_CAPTURE_UI") === "1") {
        await phone.screenshot({ path: "/tmp/noted-ui-mobile-editor.png" });
      }

      await fillEditor(phone, "Unsaved but durable draft");
      await phone.getByLabel("Back").click();
      assertEquals(
        await phone.locator(".workspace").getAttribute("data-direction"),
        "back",
      );
      await phone.getByRole("button", { name: "Pocket thought" }).click();
      await phone.getByText("Local draft restored").waitFor();
      assertEquals(await readEditor(phone), "Unsaved but durable draft");

      await phone.getByLabel("Back").click();
      const pocketRow = phone.locator('[data-filename="pocket-thought.md"]');
      await pocketRow.getByLabel("Actions for Pocket thought").click();
      await pocketRow.getByRole("button", { name: "Delete" }).click();
      await phone.getByRole("button", { name: "Undo" }).click();
      await new Promise((resolve) => setTimeout(resolve, 5_200));
      assert(await Deno.stat(join(notesDir, "pocket-thought.md")));
      await phone.getByRole("button", { name: "Pocket thought" }).waitFor();

      await phone.getByRole("button", { name: "New note" }).click();
      await phone.getByLabel("Note title").fill("Longer thought");
      await phone.getByLabel("Note text").fill("Continue in the editor");
      await phone.getByRole("button", { name: "Keep writing" }).click();
      await phone.locator("note-editor").waitFor();
      assertEquals(
        await phone.locator("note-editor input.title").inputValue(),
        "Longer thought",
      );
      assertEquals(new URL(phone.url()).hash, "#/new");
      await mobile.close();
      await desktop.close();
    } finally {
      await browser?.close();
      await server.shutdown();
      await Deno.remove(notesDir, { recursive: true });
    }
  },
});
