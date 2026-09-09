/**
 * Vendors the three type families the M5 design tokens use (spec.md §12,
 * `noted-field-guide.html`) into `public/vendor/fonts/`, instead of loading
 * them from `fonts.googleapis.com` at runtime.
 *
 * Same reasoning as `vendor-codemirror.ts`: no runtime CDN dependency, and a
 * fixed file list the M6 service worker can precache. This was a real gap —
 * a fully offline load, or an air-gapped M7 deploy, had no route to Google's
 * CDN at all and would silently lose all three typefaces (ISSUES.md,
 * 2026-09-09).
 *
 * Scope: **latin subset only.** Google's `css2` endpoint splits each family
 * into per-script files (latin, latin-ext, cyrillic, greek, vietnamese, ...);
 * vendoring all of them for a personal note-taking tool is more than this
 * app needs. A note title in Cyrillic or Vietnamese falls back to a system
 * font rather than 404ing — a real but minor limitation, not a crash.
 *
 * Run manually when bumping fonts:  deno run -A scripts/vendor-fonts.ts
 */

const OUT_DIR = new URL("../public/vendor/fonts/", import.meta.url);

// Same family/axis request as the Google Fonts <link> this replaces.
const CSS2_URL =
  "https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300..700;1,9..144,300..700&family=Manrope:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500&display=swap";

// A modern desktop UA — Google's css2 endpoint serves old woff/ttf formats
// to unrecognized/bare UAs (like Deno's default) instead of woff2.
const MODERN_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

await Deno.mkdir(OUT_DIR, { recursive: true });

const css = await (await fetchOk(CSS2_URL, { "User-Agent": MODERN_UA })).text();

// One @font-face block per (family, style, weight, script-subset). Keep only
// the `/* latin */`-commented ones — see the scope note above.
const blocks = css.split(/\/\*\s*([\w-]+)\s*\*\//).slice(1);
const wanted: { family: string; style: string; weight: string; url: string }[] =
  [];
for (let i = 0; i < blocks.length; i += 2) {
  const subset = blocks[i];
  const block = blocks[i + 1];
  if (subset !== "latin" || block === undefined) continue;
  const family = block.match(/font-family:\s*'([^']+)'/)?.[1];
  const style = block.match(/font-style:\s*(\w+)/)?.[1];
  const weight = block.match(/font-weight:\s*([\d\s]+)/)?.[1]?.trim();
  const url = block.match(/url\((https:[^)]+\.woff2)\)/)?.[1];
  if (!family || !style || !weight || !url) {
    throw new Error(`couldn't parse a latin @font-face block:\n${block}`);
  }
  wanted.push({ family, style, weight, url });
}
if (wanted.length === 0) {
  throw new Error(
    "no latin @font-face blocks found — did the css2 response shape change?",
  );
}

/** Same physical file can back multiple weights (variable fonts) — dedupe by URL. */
const urlToFilename = new Map<string, string>();
for (const { family, url } of wanted) {
  if (urlToFilename.has(url)) continue;
  const slug = family.toLowerCase().replace(/\s+/g, "-");
  const filename = `${slug}-${urlToFilename.size}.woff2`;
  urlToFilename.set(url, filename);
}

for (const [url, filename] of urlToFilename) {
  const bytes = new Uint8Array(await (await fetchOk(url)).arrayBuffer());
  await Deno.writeFile(new URL(filename, OUT_DIR), bytes);
  console.log(`${filename}  <-  ${url}  (${bytes.length} bytes)`);
}

const fontFaceCss = wanted
  .map(({ family, style, weight, url }) => {
    const filename = urlToFilename.get(url)!;
    return `@font-face {\n  font-family: '${family}';\n  font-style: ${style};\n  font-weight: ${weight};\n  font-display: swap;\n  src: url(./${filename}) format('woff2');\n}`;
  })
  .join("\n\n");

await Deno.writeTextFile(
  new URL("fonts.css", OUT_DIR),
  `/* Vendored by scripts/vendor-fonts.ts on ${
    new Date().toISOString().slice(0, 10)
  } — latin subset only, see that file's header. */\n\n${fontFaceCss}\n`,
);

const record =
  `# Vendored by scripts/vendor-fonts.ts on ${
    new Date().toISOString().slice(0, 10)
  } — latin subset of Fraunces, Manrope, IBM Plex Mono\n` +
  [...urlToFilename.values()].map((f) => `${f}`).join("\n") + "\n";
await Deno.writeTextFile(new URL("VENDORED.txt", OUT_DIR), record);

console.log(
  `\nvendored ${urlToFilename.size} font files + fonts.css into public/vendor/fonts/`,
);

async function fetchOk(
  url: string,
  headers: HeadersInit = {},
): Promise<Response> {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res;
}
