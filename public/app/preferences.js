// @ts-check

const KEY = "noted.ui-preferences";
const DRAFT_PREFIX = "noted.draft.";

/**
 * @typedef {"system" | "light" | "dark" | "paper"} Theme
 * @typedef {"updated" | "title" | "backlinks"} SortOrder
 * @typedef {"comfortable" | "compact"} Density
 * @typedef {{ theme: Theme, sort: SortOrder, density: Density }} Preferences
 */

/** @returns {Preferences} */
export function getPreferences() {
  const fallback = /** @type {Preferences} */ ({
    theme: "system",
    sort: "updated",
    density: "comfortable",
  });
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (!value || typeof value !== "object") return fallback;
    return {
      theme: ["system", "light", "dark", "paper"].includes(value.theme)
        ? value.theme
        : fallback.theme,
      sort: ["updated", "title", "backlinks"].includes(value.sort)
        ? value.sort
        : fallback.sort,
      density: ["comfortable", "compact"].includes(value.density)
        ? value.density
        : fallback.density,
    };
  } catch {
    return fallback;
  }
}

/** @param {Partial<Preferences>} patch @returns {Preferences} */
export function setPreferences(patch) {
  const next = { ...getPreferences(), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage can be unavailable in strict private modes; keep this session usable.
  }
  applyTheme(next.theme);
  return next;
}

/** @param {Theme} theme */
export function applyTheme(theme) {
  const darkSystem = matchMedia("(prefers-color-scheme: dark)").matches;
  const actual = theme === "system" ? (darkSystem ? "dark" : "light") : theme;
  document.documentElement.dataset.theme = actual;
  const meta = document.querySelector('meta[name="theme-color"]');
  meta?.setAttribute(
    "content",
    actual === "dark" ? "#25242b" : actual === "paper" ? "#f4eddf" : "#f7f8fb",
  );
}

/** Apply the saved theme and track system changes while System is selected. */
export function initialiseTheme() {
  applyTheme(getPreferences().theme);
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    const { theme } = getPreferences();
    if (theme === "system") applyTheme(theme);
  });
}

/** @param {string} id @returns {{ title: string, body: string } | null} */
export function getDraft(id) {
  try {
    return JSON.parse(localStorage.getItem(DRAFT_PREFIX + id) ?? "null");
  } catch {
    return null;
  }
}

/** @param {string} id @param {{ title: string, body: string }} draft */
export function saveDraft(id, draft) {
  try {
    localStorage.setItem(DRAFT_PREFIX + id, JSON.stringify(draft));
  } catch {
    // Best effort only; the durable write queue still owns explicit saves.
  }
}

/** @param {string} id */
export function clearDraft(id) {
  try {
    localStorage.removeItem(DRAFT_PREFIX + id);
  } catch {
    // Nothing to clear when storage is unavailable.
  }
}
