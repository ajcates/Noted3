/**
 * Theme Compiler (system-overview.md §1) — M5.
 *
 * Reads `THEME_PATH` (a YAML file), fills in every missing field from the
 * built-in Material 3 Expressive default (spec.md §12, transcribed from
 * `notes/noted-field-guide.html`), and compiles the result into one CSS text
 * block of custom properties + a handful of layout rules, served at
 * `GET /theme.css`. Pure functions only, following the Config Loader /
 * Frontmatter Parser split: `loadThemeFile` is the one bit of I/O (reads the
 * file, tolerating "missing"); `buildTheme` and `compileThemeCss` are plain
 * data in, string/object out — the whole compiler is unit-testable with no
 * disk access.
 *
 * Retheming is "edit theme.yaml, reload the browser" — no build step, no
 * restart, no client-side JS. `/theme.css` is recompiled from disk on every
 * request rather than cached at boot (unlike the Notes In-Memory Index)
 * specifically so that loop stays fast; the file is tiny and this is not a
 * hot path.
 *
 * Scope is deliberately the M3 Expressive vocabulary, not open-ended CSS: the
 * four seed colors + a neutral hue (spec.md §12's "five base color
 * variables"), three font families, the fixed 15-role type scale, the fixed
 * M3 shape scale, the two named motion schemes, and a small bounded set of
 * layout placements. There is no "raw CSS" escape hatch in the schema.
 *
 * A color role may give exact light/dark tone values, or just a `seed` — in
 * which case {@link deriveLightRole}/{@link deriveDarkRole} compute the rest
 * using the same fixed-target-tone approach real M3 tonal palettes use (a
 * fixed lightness band per slot, carrying the seed's hue and a scaled
 * fraction of its chroma). This reproduces the *shape* of the hand-tuned
 * values in the field guide, not their exact numbers — see ISSUES.md. The
 * default theme ships with the field guide's exact numbers as explicit
 * light/dark values, so out of the box nothing is left to the approximation.
 */

import { parse as parseYaml } from "@std/yaml";

/** A color in OKLCH space: lightness (0-100), chroma, hue (degrees). */
export interface Lch {
  readonly l: number;
  readonly c: number;
  readonly h: number;
}

interface RoleTones {
  readonly base: Lch;
  readonly on: Lch;
  readonly container: Lch;
  readonly onContainer: Lch;
}

interface ColorRoleSpec {
  readonly seed: Lch;
  readonly light?: Partial<RoleTones>;
  readonly dark?: Partial<RoleTones>;
}

const TYPE_ROLE_NAMES = [
  "display-l",
  "display-m",
  "display-s",
  "headline-l",
  "headline-m",
  "headline-s",
  "title-l",
  "title-m",
  "title-s",
  "body-l",
  "body-m",
  "body-s",
  "label-l",
  "label-m",
  "label-s",
] as const;
export type TypeRoleName = typeof TYPE_ROLE_NAMES[number];

export interface TypeRole {
  readonly font: "display" | "body" | "source";
  readonly size: string;
  readonly lineHeight: number;
  readonly weight: number;
  readonly style?: "normal" | "italic";
  readonly letterSpacing?: string;
}

const SHAPE_KEYS = ["none", "xs", "sm", "md", "lg", "xl", "full"] as const;
export type ShapeKey = typeof SHAPE_KEYS[number];

export interface MotionScheme {
  readonly duration: string;
  readonly easing: string;
}

export interface LayoutConfig {
  readonly fabPlacement: "bottom-right" | "bottom-left";
  readonly density: "comfortable" | "compact";
  readonly showSearchNav: boolean;
  readonly showTagsNav: boolean;
}

export interface ThemeConfig {
  readonly neutralHue: number;
  readonly colors: {
    readonly primary: ColorRoleSpec;
    readonly secondary: ColorRoleSpec;
    readonly tertiary: ColorRoleSpec;
    readonly error: ColorRoleSpec;
  };
  readonly fonts: {
    readonly display: string;
    readonly body: string;
    readonly source: string;
  };
  readonly type: Record<TypeRoleName, TypeRole>;
  readonly shape: Record<ShapeKey, string>;
  readonly motion: {
    readonly expressive: MotionScheme;
    readonly standard: MotionScheme;
  };
  readonly layout: LayoutConfig;
}

/**
 * The M3 Expressive defaults, transcribed exactly from `noted-field-guide.html`
 * / spec.md §12 — this is what a missing or empty `theme.yaml` produces.
 */
export const DEFAULT_THEME: ThemeConfig = {
  neutralHue: 275,
  colors: {
    primary: {
      seed: { l: 52, c: 0.19, h: 275 },
      light: {
        on: { l: 99, c: 0.004, h: 275 },
        container: { l: 89, c: 0.045, h: 275 },
        onContainer: { l: 24, c: 0.10, h: 275 },
      },
      dark: {
        base: { l: 80, c: 0.13, h: 275 },
        on: { l: 22, c: 0.09, h: 275 },
        container: { l: 32, c: 0.11, h: 275 },
        onContainer: { l: 90, c: 0.05, h: 275 },
      },
    },
    secondary: {
      seed: { l: 58, c: 0.08, h: 175 },
      light: {
        on: { l: 99, c: 0.004, h: 175 },
        container: { l: 90, c: 0.035, h: 175 },
        onContainer: { l: 25, c: 0.055, h: 175 },
      },
      dark: {
        base: { l: 78, c: 0.07, h: 175 },
        on: { l: 24, c: 0.04, h: 175 },
        container: { l: 30, c: 0.045, h: 175 },
        onContainer: { l: 90, c: 0.03, h: 175 },
      },
    },
    tertiary: {
      seed: { l: 68, c: 0.15, h: 55 },
      light: {
        on: { l: 21, c: 0.02, h: 55 },
        container: { l: 90, c: 0.06, h: 55 },
        onContainer: { l: 29, c: 0.09, h: 55 },
      },
      dark: {
        base: { l: 80, c: 0.12, h: 55 },
        on: { l: 26, c: 0.06, h: 55 },
        container: { l: 34, c: 0.08, h: 55 },
        onContainer: { l: 91, c: 0.05, h: 55 },
      },
    },
    error: {
      seed: { l: 55, c: 0.20, h: 25 },
      light: {
        on: { l: 99, c: 0.004, h: 25 },
        container: { l: 91, c: 0.05, h: 25 },
        onContainer: { l: 27, c: 0.12, h: 25 },
      },
      dark: {
        base: { l: 78, c: 0.16, h: 25 },
        on: { l: 24, c: 0.08, h: 25 },
        container: { l: 33, c: 0.10, h: 25 },
        onContainer: { l: 90, c: 0.05, h: 25 },
      },
    },
  },
  fonts: {
    display: '"Fraunces", "Iowan Old Style", ui-serif, Georgia, serif',
    body: '"Manrope", "Segoe UI", system-ui, sans-serif',
    source: '"IBM Plex Mono", "SF Mono", ui-monospace, monospace',
  },
  type: {
    "display-l": {
      font: "display",
      size: "3.2rem",
      lineHeight: 1.05,
      weight: 400,
    },
    "display-m": {
      font: "display",
      size: "2.5rem",
      lineHeight: 1.1,
      weight: 400,
    },
    "display-s": {
      font: "display",
      size: "2rem",
      lineHeight: 1.15,
      weight: 400,
    },
    "headline-l": {
      font: "display",
      size: "1.75rem",
      lineHeight: 1.2,
      weight: 500,
    },
    "headline-m": {
      font: "display",
      size: "1.55rem",
      lineHeight: 1.25,
      weight: 500,
    },
    "headline-s": {
      font: "display",
      size: "1.3rem",
      lineHeight: 1.3,
      weight: 500,
    },
    "title-l": { font: "body", size: "1.2rem", lineHeight: 1.3, weight: 700 },
    "title-m": { font: "body", size: "1rem", lineHeight: 1.4, weight: 700 },
    "title-s": { font: "body", size: "0.85rem", lineHeight: 1.35, weight: 700 },
    "body-l": { font: "body", size: "1rem", lineHeight: 1.55, weight: 400 },
    "body-m": { font: "body", size: "0.875rem", lineHeight: 1.5, weight: 400 },
    "body-s": { font: "body", size: "0.75rem", lineHeight: 1.4, weight: 400 },
    "label-l": {
      font: "body",
      size: "0.875rem",
      lineHeight: 1.3,
      weight: 600,
      letterSpacing: "0.01em",
    },
    "label-m": {
      font: "body",
      size: "0.75rem",
      lineHeight: 1.3,
      weight: 600,
      letterSpacing: "0.02em",
    },
    "label-s": {
      font: "body",
      size: "0.6875rem",
      lineHeight: 1.3,
      weight: 600,
      letterSpacing: "0.03em",
    },
  },
  shape: {
    none: "0px",
    xs: "0.25rem",
    sm: "0.5rem",
    md: "0.75rem",
    lg: "1rem",
    xl: "1.75rem",
    full: "999px",
  },
  motion: {
    // Visible overshoot, reserved for the one primary action per screen
    // (spec.md §12 — the "New note" FAB).
    expressive: {
      duration: "450ms",
      easing: "cubic-bezier(0.34, 1.56, 0.64, 1)",
    },
    // Calm, low-overshoot — save/close/navigate.
    standard: { duration: "220ms", easing: "cubic-bezier(0.2, 0, 0, 1)" },
  },
  layout: {
    fabPlacement: "bottom-right",
    density: "comfortable",
    showSearchNav: true,
    showTagsNav: true,
  },
};

/** Fixed M3 neutral surface tones — structural, not user-configurable beyond hue. */
const NEUTRAL_STEPS = {
  light: {
    surfaceDim: { l: 89, c: 0.006 },
    surface: { l: 98, c: 0.004 },
    surfaceBright: { l: 99.2, c: 0.003 },
    containerLowest: { l: 100, c: 0 },
    containerLow: { l: 96.2, c: 0.005 },
    container: { l: 94.3, c: 0.006 },
    containerHigh: { l: 91.5, c: 0.007 },
    containerHighest: { l: 88.5, c: 0.009 },
    onSurface: { l: 21, c: 0.012 },
    onSurfaceVariant: { l: 40, c: 0.018 },
    outline: { l: 58, c: 0.014 },
    outlineVariant: { l: 84, c: 0.010 },
  },
  dark: {
    surfaceDim: { l: 12, c: 0.01 },
    surface: { l: 16, c: 0.012 },
    surfaceBright: { l: 24, c: 0.014 },
    containerLowest: { l: 11, c: 0.008 },
    containerLow: { l: 19, c: 0.013 },
    container: { l: 22, c: 0.014 },
    containerHigh: { l: 27, c: 0.016 },
    containerHighest: { l: 32, c: 0.018 },
    onSurface: { l: 93, c: 0.008 },
    onSurfaceVariant: { l: 78, c: 0.014 },
    outline: { l: 58, c: 0.014 },
    outlineVariant: { l: 34, c: 0.012 },
  },
} as const;

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/**
 * Derive a light-mode role from just its seed: a fixed target tone per slot
 * (M3's "tone 90 for container", etc.), carrying the seed's hue and a scaled
 * fraction of its chroma. `on` picks light or dark text by the seed's own
 * lightness, matching the light-seed/dark-text vs. dark-seed/light-text split
 * already present in the hand-tuned defaults above.
 */
export function deriveLightRole(seed: Lch): RoleTones {
  const { h } = seed;
  const onDark = seed.l >= 62;
  const on: Lch = onDark
    ? { l: 21, c: clamp(seed.c * 0.12, 0, 0.02), h }
    : { l: 99, c: clamp(seed.c * 0.03, 0, 0.006), h };
  return {
    base: seed,
    on,
    container: { l: 90, c: clamp(seed.c * 0.3, 0.03, 0.065), h },
    onContainer: { l: 26, c: clamp(seed.c * 0.55, 0.05, 0.12), h },
  };
}

/** Dark-mode counterpart of {@link deriveLightRole} — see its docs. */
export function deriveDarkRole(seed: Lch): RoleTones {
  const { h } = seed;
  return {
    base: { l: 80, c: clamp(seed.c * 0.7, 0.06, 0.16), h },
    on: { l: 23, c: clamp(seed.c * 0.45, 0.04, 0.10), h },
    container: { l: 32, c: clamp(seed.c * 0.55, 0.045, 0.11), h },
    onContainer: { l: 90, c: clamp(seed.c * 0.28, 0.03, 0.06), h },
  };
}

function resolveRole(
  spec: ColorRoleSpec,
  mode: "light" | "dark",
): RoleTones {
  const derived = mode === "light"
    ? deriveLightRole(spec.seed)
    : deriveDarkRole(spec.seed);
  const overrides = mode === "light" ? spec.light : spec.dark;
  return { ...derived, ...overrides };
}

/**
 * Deep-merge `override` onto `base`, following only the shape `base` already
 * has: plain objects merge key-by-key (keys not present in `base` are
 * dropped, so a typo or stray key in `theme.yaml` can't leak through), arrays
 * and primitives are replaced wholesale when `override`'s value is the same
 * JS type as `base`'s, otherwise `base`'s value wins. This mirrors the
 * Frontmatter Parser's "extract what's usable, ignore the rest" tolerance
 * (spec.md §11) rather than throwing on a malformed theme file.
 */
function mergeDeep<T>(base: T, override: unknown): T {
  if (override === undefined || override === null) return base;
  if (Array.isArray(base)) {
    return Array.isArray(override) ? (override as T) : base;
  }
  if (isPlainObject(base)) {
    if (!isPlainObject(override)) return base;
    const result: Record<string, unknown> = { ...base };
    for (const key of Object.keys(base)) {
      if (key in override) {
        result[key] = mergeDeep(
          (base as Record<string, unknown>)[key],
          (override as Record<string, unknown>)[key],
        );
      }
    }
    return result as T;
  }
  return typeof override === typeof base ? (override as T) : base;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Merge parsed YAML (anything — untrusted shape) onto {@link DEFAULT_THEME}. */
export function buildTheme(raw: unknown): ThemeConfig {
  return mergeDeep(DEFAULT_THEME, raw);
}

/**
 * Read and parse `path` as a theme YAML file. A missing file is not an
 * error — it just means "use the built-in default" (same tolerance as a
 * hand-written note with no frontmatter).
 */
export async function loadThemeFile(path: string): Promise<ThemeConfig> {
  let raw: unknown;
  try {
    raw = parseYaml(await Deno.readTextFile(path));
  } catch (cause) {
    if (cause instanceof Deno.errors.NotFound) return DEFAULT_THEME;
    throw cause;
  }
  return buildTheme(raw);
}

function oklch(v: Lch): string {
  return `oklch(${v.l}% ${v.c} ${v.h})`;
}

function paletteLines(theme: ThemeConfig, mode: "light" | "dark"): string[] {
  const n = NEUTRAL_STEPS[mode];
  const hue = theme.neutralHue;
  const lines = [
    `--surface-dim: ${oklch({ ...n.surfaceDim, h: hue })};`,
    `--surface: ${oklch({ ...n.surface, h: hue })};`,
    `--surface-bright: ${oklch({ ...n.surfaceBright, h: hue })};`,
    `--surface-container-lowest: ${oklch({ ...n.containerLowest, h: hue })};`,
    `--surface-container-low: ${oklch({ ...n.containerLow, h: hue })};`,
    `--surface-container: ${oklch({ ...n.container, h: hue })};`,
    `--surface-container-high: ${oklch({ ...n.containerHigh, h: hue })};`,
    `--surface-container-highest: ${oklch({ ...n.containerHighest, h: hue })};`,
    `--on-surface: ${oklch({ ...n.onSurface, h: hue })};`,
    `--on-surface-variant: ${oklch({ ...n.onSurfaceVariant, h: hue })};`,
    `--outline: ${oklch({ ...n.outline, h: hue })};`,
    `--outline-variant: ${oklch({ ...n.outlineVariant, h: hue })};`,
  ];
  for (
    const [name, spec] of Object.entries(theme.colors) as Array<
      [string, ColorRoleSpec]
    >
  ) {
    const tones = resolveRole(spec, mode);
    lines.push(
      `--${name}: ${oklch(tones.base)};`,
      `--on-${name}: ${oklch(tones.on)};`,
      `--${name}-container: ${oklch(tones.container)};`,
      `--on-${name}-container: ${oklch(tones.onContainer)};`,
    );
  }
  lines.push(`--bg: var(--surface);`, `--text: var(--on-surface);`);
  return lines;
}

function typeLines(theme: ThemeConfig): string[] {
  const lines: string[] = [
    `--font-display: ${theme.fonts.display};`,
    `--font-body: ${theme.fonts.body};`,
    `--font-source: ${theme.fonts.source};`,
  ];
  for (const name of TYPE_ROLE_NAMES) {
    const role = theme.type[name];
    const style = role.style === "italic" ? "italic " : "";
    lines.push(
      `--type-${name}: ${style}${role.weight} ${role.size}/${role.lineHeight} var(--font-${role.font});`,
      `--type-${name}-tracking: ${role.letterSpacing ?? "normal"};`,
    );
  }
  return lines;
}

function shapeLines(theme: ThemeConfig): string[] {
  return SHAPE_KEYS.map((key) => `--radius-${key}: ${theme.shape[key]};`);
}

function motionLines(theme: ThemeConfig): string[] {
  return [
    `--motion-expressive-duration: ${theme.motion.expressive.duration};`,
    `--motion-expressive-easing: ${theme.motion.expressive.easing};`,
    `--motion-standard-duration: ${theme.motion.standard.duration};`,
    `--motion-standard-easing: ${theme.motion.standard.easing};`,
  ];
}

function indent(lines: readonly string[], depth = 2): string {
  const pad = "  ".repeat(depth);
  return lines.map((l) => pad + l).join("\n");
}

/** The bounded set of layout placements — real CSS rules, not custom properties. */
function layoutCss(layout: LayoutConfig): string {
  const fabSide = layout.fabPlacement === "bottom-left" ? "left" : "right";
  const listGap = layout.density === "compact" ? "0.25rem" : "0.5rem";
  return `.note-list > button.primary{
  position: fixed;
  ${fabSide}: 1.5rem;
  bottom: 1.5rem;
  z-index: 10;
}
.note-list li{ padding-top: ${listGap}; padding-bottom: ${listGap}; }
.shell-header nav a[href="#/search"]{ display: ${
    layout.showSearchNav ? "inline" : "none"
  }; }
.shell-header nav a[href="#/tags"]{ display: ${
    layout.showTagsNav ? "inline" : "none"
  }; }`;
}

/**
 * Compile a {@link ThemeConfig} into the full `/theme.css` text: light tokens
 * on `:root`, dark tokens under `prefers-color-scheme` (opt-out via
 * `[data-theme="light"]`) and under an explicit `[data-theme="dark"]` (same
 * pattern the field guide models), plus the layout rules.
 */
export function compileThemeCss(theme: ThemeConfig): string {
  const rootLines = [
    ...paletteLines(theme, "light"),
    ...typeLines(theme),
    ...shapeLines(theme),
    ...motionLines(theme),
  ];
  const darkLines = paletteLines(theme, "dark");
  return `/* Generated from theme.yaml by src/theme.ts — do not hand-edit. */
:root{
  color-scheme: light;
${indent(rootLines)}
}

@media (prefers-color-scheme: dark){
  :root:not([data-theme="light"]){
    color-scheme: dark;
${indent(darkLines, 2)}
  }
}
:root[data-theme="dark"]{
  color-scheme: dark;
${indent(darkLines)}
}

${layoutCss(theme.layout)}
`;
}
