// Minimal `process` stand-in for the vendored CodeMirror bundles.
// esm.sh rewrites `@lezer/lr`'s `process.env.LOG` debug check to an import of
// "/node/process.mjs"; index.html's import map points that here. Only `env`
// is ever read.
export default { env: {} };
