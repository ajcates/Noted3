/**
 * WCAG 2 contrast checker for the design tokens (spec.md §12,
 * notes/design-checklist.md). Computes real ratios — OKLCH -> OKLab ->
 * linear sRGB -> relative luminance -> contrast ratio — for every fg/bg
 * pair the UI actually renders, in both themes, and fails if any drop
 * below 4.5:1 (WCAG AA, normal text). No deps: OKLab conversion is Björn
 * Ottosson's public-domain formula (https://bottosson.github.io/posts/oklab/).
 *
 * Run with: deno run scripts/check-contrast.ts
 *
 * The pairs and token values below are transcribed from
 * public/app/styles.css's `:root` / `@media (prefers-color-scheme: dark)`
 * blocks — if a token changes there, update it here too (nothing imports
 * the CSS; this is a point-in-time audit, not a live check).
 */

type Oklch = readonly [
  lightnessPercent: number,
  chroma: number,
  hueDeg: number,
];

function oklchToLinearSrgb(
  [lightnessPercent, chroma, hueDeg]: Oklch,
): [number, number, number] {
  const L = lightnessPercent / 100;
  const h = (hueDeg * Math.PI) / 180;
  const a = chroma * Math.cos(h);
  const b = chroma * Math.sin(h);

  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.2914855480 * b;

  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;

  const r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const bl = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;
  return [r, g, bl];
}

/** WCAG relative luminance — uses the *linear* RGB directly (no gamma
 * re-encoding needed; that's exactly what the OKLab matrices produce). */
function relativeLuminance([r, g, b]: [number, number, number]): number {
  const clamp = (x: number) => Math.min(1, Math.max(0, x));
  return 0.2126 * clamp(r) + 0.7152 * clamp(g) + 0.0722 * clamp(b);
}

function contrastRatio(fg: Oklch, bg: Oklch): number {
  const L1 = relativeLuminance(oklchToLinearSrgb(fg));
  const L2 = relativeLuminance(oklchToLinearSrgb(bg));
  const [lighter, darker] = L1 > L2 ? [L1, L2] : [L2, L1];
  return (lighter + 0.05) / (darker + 0.05);
}

const NEUTRAL_HUE = 275;

const light: Record<string, Oklch> = {
  surface: [98, 0.004, NEUTRAL_HUE],
  "surface-container-low": [96.2, 0.005, NEUTRAL_HUE],
  "surface-container-high": [91.5, 0.007, NEUTRAL_HUE],
  "surface-container-lowest": [100, 0, NEUTRAL_HUE],
  "on-surface": [21, 0.012, NEUTRAL_HUE],
  "on-surface-variant": [40, 0.018, NEUTRAL_HUE],
  primary: [52, 0.19, 275],
  "on-primary": [99, 0.004, 275],
  "primary-container": [89, 0.045, 275],
  "on-primary-container": [24, 0.10, 275],
  secondary: [58, 0.08, 175],
  "secondary-container": [90, 0.035, 175],
  "on-secondary-container": [25, 0.055, 175],
  tertiary: [68, 0.15, 55],
  "tertiary-container": [90, 0.06, 55],
  "on-tertiary-container": [29, 0.09, 55],
  error: [55, 0.20, 25],
  "on-error-container": [27, 0.12, 25],
};

const dark: Record<string, Oklch> = {
  surface: [16, 0.012, NEUTRAL_HUE],
  "surface-container-low": [19, 0.013, NEUTRAL_HUE],
  "surface-container-high": [27, 0.016, NEUTRAL_HUE],
  "surface-container-lowest": [11, 0.008, NEUTRAL_HUE],
  "on-surface": [93, 0.008, NEUTRAL_HUE],
  "on-surface-variant": [78, 0.014, NEUTRAL_HUE],
  primary: [80, 0.13, 275],
  "on-primary": [22, 0.09, 275],
  "primary-container": [32, 0.11, 275],
  "on-primary-container": [90, 0.05, 275],
  secondary: [78, 0.07, 175],
  "secondary-container": [30, 0.045, 175],
  "on-secondary-container": [90, 0.03, 175],
  tertiary: [80, 0.12, 55],
  "tertiary-container": [34, 0.08, 55],
  "on-tertiary-container": [91, 0.05, 55],
  error: [78, 0.16, 25],
  "on-error-container": [90, 0.05, 25],
};

const AA_NORMAL_TEXT = 4.5;

/** [label, fg token key, bg token key] — every text/icon pair the app
 * actually renders, gathered from styles.css. */
const pairs: [string, string, string][] = [
  ["Body text on page", "on-surface", "surface"],
  ["Secondary/meta text on page", "on-surface-variant", "surface"],
  ["Card title", "on-surface", "surface-container-low"],
  ["Card excerpt/meta text", "on-surface-variant", "surface-container-low"],
  ["Primary button text", "on-primary", "primary"],
  [
    "Primary-container chip/icon-active text",
    "on-primary-container",
    "primary-container",
  ],
  [
    "Secondary-container chip text",
    "on-secondary-container",
    "secondary-container",
  ],
  [
    "Tertiary-container chip/FAB text",
    "on-tertiary-container",
    "tertiary-container",
  ],
  ["Wordmark/link (primary) on page", "primary", "surface"],
  [
    "Tag mark (on-tertiary-container) on page",
    "on-tertiary-container",
    "surface",
  ],
  [
    'Status "ok" (on-secondary-container) on page',
    "on-secondary-container",
    "surface",
  ],
  [
    "Delete text-action (on-error-container) on page",
    "on-error-container",
    "surface",
  ],
  ["Icon button glyph on its surface", "on-surface", "surface-container-high"],
  ["Format cell text on its surface", "on-surface", "surface-container-high"],
  [
    "Editor body text on well surface",
    "on-surface",
    "surface-container-lowest",
  ],
  [
    "Editor placeholder on well surface",
    "on-surface-variant",
    "surface-container-lowest",
  ],
  [
    'Wikilink-autocomplete "create" row (primary) on well surface',
    "primary",
    "surface-container-lowest",
  ],
  [
    "Delete pill button (on-error-container) on editor bar",
    "on-error-container",
    "surface-container-high",
  ],
  [
    "Outline chip / icon-btn default text on its surface",
    "on-surface-variant",
    "surface-container-high",
  ],
];

let anyFail = false;
for (const [themeName, theme] of [["LIGHT", light], ["DARK", dark]] as const) {
  console.log(`\n=== ${themeName} ===`);
  for (const [label, fgKey, bgKey] of pairs) {
    const fg = theme[fgKey];
    const bg = theme[bgKey];
    if (!fg || !bg) {
      console.log(`MISSING TOKEN (${fgKey} or ${bgKey}) — ${label}`);
      anyFail = true;
      continue;
    }
    const ratio = contrastRatio(fg, bg);
    const pass = ratio >= AA_NORMAL_TEXT;
    if (!pass) anyFail = true;
    console.log(
      `${ratio.toFixed(2)}:1  [${
        pass ? "PASS" : "FAIL"
      }]  ${label}  (${fgKey} on ${bgKey})`,
    );
  }
}

if (anyFail) {
  console.error(
    "\nOne or more pairs fail WCAG AA (4.5:1) — fix before shipping.",
  );
  Deno.exit(1);
}
console.log("\nAll pairs clear WCAG AA (4.5:1) in both themes.");
