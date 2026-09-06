/**
 * M5 tests (notes/development.md §4) — the Theme Compiler.
 *
 * Goals proven:
 *   - A color role given only a `seed` derives on/container/on-container for
 *     both light and dark, picking dark "on" text for a light seed and vice
 *     versa.
 *   - A malformed/partial `theme.yaml` merges tolerantly onto the built-in
 *     default rather than throwing (same posture as the frontmatter parser).
 *   - `GET /theme.css` is public (no auth token needed), serves `text/css`,
 *     and reflects the file at `THEME_PATH` — proving the compiled output is
 *     wired all the way through the router, not just unit-tested in isolation.
 */

import { assertEquals, assertStringIncludes } from "@std/assert";
import {
  buildTheme,
  compileThemeCss,
  DEFAULT_THEME,
  deriveDarkRole,
  deriveLightRole,
} from "../../src/theme.ts";
import { createApp } from "../../src/router.ts";
import { NoteIndex } from "../../src/note-index.ts";

Deno.test("deriveLightRole: a light seed gets dark 'on' text; a dark seed gets light 'on' text", () => {
  const lightSeed = deriveLightRole({ l: 68, c: 0.15, h: 55 }); // Ember, like tertiary
  assertEquals(lightSeed.on.l, 21);

  const darkSeed = deriveLightRole({ l: 52, c: 0.19, h: 275 }); // Ink, like primary
  assertEquals(darkSeed.on.l, 99);
});

Deno.test("deriveDarkRole: always produces a light base tone and a light on-container", () => {
  const role = deriveDarkRole({ l: 55, c: 0.20, h: 25 });
  assertEquals(role.base.l, 80);
  assertEquals(role.onContainer.l, 90);
  assertEquals(role.base.h, 25);
});

Deno.test("buildTheme: missing/partial YAML falls back to the default field-guide values", () => {
  const theme = buildTheme({});
  assertEquals(theme, DEFAULT_THEME);

  // A single overridden seed changes just that role; everything else is untouched.
  const overridden = buildTheme({
    colors: { primary: { seed: { l: 40, c: 0.1, h: 200 } } },
  });
  assertEquals(overridden.colors.primary.seed, { l: 40, c: 0.1, h: 200 });
  assertEquals(overridden.colors.secondary, DEFAULT_THEME.colors.secondary);

  // Garbage / unrecognized shape is dropped rather than throwing.
  const garbage = buildTheme({ neutralHue: "not a number", bogusKey: 123 });
  assertEquals(garbage, DEFAULT_THEME);
});

Deno.test("compileThemeCss: emits the seed hue and the bounded layout rules", () => {
  const css = compileThemeCss(
    buildTheme({
      colors: { primary: { seed: { l: 52, c: 0.19, h: 300 } } },
      layout: { fabPlacement: "bottom-left", showTagsNav: false },
    }),
  );
  assertStringIncludes(css, "--primary: oklch(52% 0.19 300)");
  assertStringIncludes(css, "left: 1.5rem");
  assertStringIncludes(css, 'a[href="#/tags"]{ display: none; }');
  assertStringIncludes(css, "@media (prefers-color-scheme: dark)");
});

Deno.test("GET /theme.css is public and reflects THEME_PATH", async () => {
  const notesDir = await Deno.makeTempDir({ prefix: "noted-theme-notes-" });
  const themeDir = await Deno.makeTempDir({ prefix: "noted-theme-cfg-" });
  const themePath = `${themeDir}/theme.yaml`;
  await Deno.writeTextFile(
    themePath,
    "neutralHue: 90\ncolors:\n  primary:\n    seed: { l: 60, c: 0.1, h: 90 }\n",
  );

  const index = await NoteIndex.build(notesDir);
  const app = createApp(
    { notesDir, port: 0, authToken: "test-token", themePath },
    { index },
  );
  const server = Deno.serve({ port: 0, onListen: () => {} }, app);
  const { port } = server.addr as Deno.NetAddr;

  try {
    // No Authorization header — /theme.css must not be auth-gated.
    const res = await fetch(`http://localhost:${port}/theme.css`);
    assertEquals(res.status, 200);
    assertStringIncludes(res.headers.get("content-type") ?? "", "text/css");
    const body = await res.text();
    assertStringIncludes(body, "--primary: oklch(60% 0.1 90)");
  } finally {
    await server.shutdown();
    await Deno.remove(notesDir, { recursive: true });
    await Deno.remove(themeDir, { recursive: true });
  }
});

Deno.test("GET /theme.css falls back to the built-in default when THEME_PATH doesn't exist", async () => {
  const notesDir = await Deno.makeTempDir({ prefix: "noted-theme-notes-" });
  const index = await NoteIndex.build(notesDir);
  const app = createApp(
    {
      notesDir,
      port: 0,
      authToken: "test-token",
      themePath: `${notesDir}/does-not-exist.yaml`,
    },
    { index },
  );
  const server = Deno.serve({ port: 0, onListen: () => {} }, app);
  const { port } = server.addr as Deno.NetAddr;

  try {
    const res = await fetch(`http://localhost:${port}/theme.css`);
    assertEquals(res.status, 200);
    const body = await res.text();
    assertStringIncludes(body, "--primary: oklch(52% 0.19 275)");
  } finally {
    await server.shutdown();
    await Deno.remove(notesDir, { recursive: true });
  }
});
