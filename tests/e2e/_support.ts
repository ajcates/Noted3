/**
 * Shared Playwright helpers for the browser e2e tests. The body editor is a
 * CodeMirror instance (M4), not a `<textarea>`, so tests go through these.
 */

import { type Browser, chromium, type Page } from "playwright";

/** Launch whichever Chromium distribution is available on the machine. */
export async function launchBrowser(): Promise<Browser> {
  try {
    return await chromium.launch({ channel: "chrome" });
  } catch (chromeError) {
    for (
      const executablePath of [
        Deno.env.get("NOTED_CHROMIUM_PATH"),
        Deno.build.os === "linux" ? "/usr/bin/chromium" : undefined,
      ]
    ) {
      if (!executablePath) continue;
      try {
        return await chromium.launch({ executablePath });
      } catch {
        // Try the next known location.
      }
    }
    try {
      return await chromium.launch();
    } catch {
      throw chromeError;
    }
  }
}

/** Replace the CodeMirror body with `text` (types it, so autocomplete still fires). */
export async function fillEditor(page: Page, text: string): Promise<void> {
  const editor = page.locator(".cm-content");
  await editor.click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("Delete");
  await page.keyboard.type(text);
  // Dismiss any autocomplete tooltip left open by a `[[` in the text.
  await page.keyboard.press("Escape");
}

/** Current editor text, newline-joined. */
export function readEditor(page: Page): Promise<string> {
  return page.locator(".cm-content").evaluate((el) =>
    Array.from(el.querySelectorAll(".cm-line")).map((l) => l.textContent).join(
      "\n",
    )
  );
}
