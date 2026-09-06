/**
 * Shared Playwright helpers for the browser e2e tests. The body editor is a
 * CodeMirror instance (M4), not a `<textarea>`, so tests go through these.
 */

import type { Page } from "playwright";

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
