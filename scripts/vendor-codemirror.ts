/**
 * Vendors the CodeMirror 6 ESM bundles the client needs into
 * `public/vendor/codemirror/`, so the app serves them itself — no bundler in
 * the dev/serve loop, no runtime CDN dependency, and a fixed file list the M6
 * service worker can precache (see notes/techstack.md).
 *
 * Run manually when bumping CodeMirror:  deno run -A scripts/vendor-codemirror.ts
 *
 * Each entry is fetched from esm.sh with `?bundle` (inlines that package's
 * private deps) plus `external=` for the packages we vendor separately, so
 * shared singletons like `@codemirror/state` and `@lezer/common` stay shared.
 * esm.sh keeps the externalized imports as bare specifiers; index.html's
 * import map points them back at these files.
 */

const OUT_DIR = new URL("../public/vendor/codemirror/", import.meta.url);
const TARGET = "es2022";

/** name → { pkg, external[] }. `name.js` is what index.html's import map points at. */
const ENTRIES: Record<string, { pkg: string; external: string[] }> = {
  "state": { pkg: "@codemirror/state@6", external: [] },
  "style-mod": { pkg: "style-mod@4", external: [] },
  "lezer-common": { pkg: "@lezer/common@1", external: [] },
  "lezer-highlight": { pkg: "@lezer/highlight@1", external: ["@lezer/common"] },
  "view": {
    // w3c-keyname is tiny and view-only, so let it bundle in rather than
    // vendoring another file.
    pkg: "@codemirror/view@6",
    external: ["@codemirror/state", "style-mod"],
  },
  "language": {
    pkg: "@codemirror/language@6",
    external: [
      "@codemirror/state",
      "@codemirror/view",
      "style-mod",
      "@lezer/common",
      "@lezer/highlight",
    ],
  },
  "commands": {
    pkg: "@codemirror/commands@6",
    external: [
      "@codemirror/state",
      "@codemirror/view",
      "@codemirror/language",
      "@lezer/common",
    ],
  },
  "autocomplete": {
    pkg: "@codemirror/autocomplete@6",
    external: [
      "@codemirror/state",
      "@codemirror/view",
      "@codemirror/language",
      "@lezer/common",
    ],
  },
  "lang-markdown": {
    pkg: "@codemirror/lang-markdown@6",
    external: [
      "@codemirror/state",
      "@codemirror/view",
      "@codemirror/language",
      "@codemirror/autocomplete",
      "@lezer/common",
      "@lezer/highlight",
    ],
  },
};

await Deno.mkdir(OUT_DIR, { recursive: true });

/** name → resolved version, for the VENDORED.txt record. */
const resolved: Record<string, string> = {};

for (const [name, { pkg, external }] of Object.entries(ENTRIES)) {
  const params = new URLSearchParams({ bundle: "", target: TARGET });
  if (external.length) params.set("external", external.join(","));
  const outerUrl = `https://esm.sh/${pkg}?${params}`;

  const outer = await (await fetchOk(outerUrl)).text();
  const innerPath = outer.match(/from\s*"(\/[^"]+)"/)?.[1];
  if (!innerPath) {
    throw new Error(
      `no inner bundle URL in esm.sh response for ${pkg}:\n${outer}`,
    );
  }
  let code = await (await fetchOk(`https://esm.sh${innerPath}`)).text();

  // esm.sh rewrites @lezer/lr's `process.env` debug check to an import of
  // "/node/process.mjs"; point it at a local stub instead so nothing 404s.
  code = code.replaceAll('"/node/process.mjs"', '"./node-process-stub.js"');

  await Deno.writeTextFile(new URL(`${name}.js`, OUT_DIR), code);
  const version = innerPath.match(/@([\d.]+)\//)?.[1] ?? "?";
  resolved[name] = `${pkg.replace(/@[^@/]*$/, "")}@${version}`;
  console.log(`${name}.js  <-  ${resolved[name]}  (${code.length} bytes)`);
}

const record =
  `# Vendored by scripts/vendor-codemirror.ts on ${
    new Date().toISOString().slice(0, 10)
  }\n` +
  Object.entries(resolved).map(([n, v]) => `${n}.js\t${v}`).join("\n") + "\n";
await Deno.writeTextFile(new URL("VENDORED.txt", OUT_DIR), record);

console.log(
  `\nvendored ${
    Object.keys(ENTRIES).length
  } files into public/vendor/codemirror/`,
);

async function fetchOk(url: string): Promise<Response> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res;
}
