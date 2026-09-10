#!/usr/bin/env node
"use strict";

/**
 * noted — npm launcher (M7, notes/roadmap.md).
 *
 * `noted` is still, underneath, the same single long-running Deno process
 * described in techstack.md — this file exists only so `npm install -g
 * @ajcates/noted3` gets you a `noted` command with nothing else to set up.
 * It does two things and nothing else:
 *
 *   1. Makes sure `deno` is on PATH, installing it via the official
 *      installer (https://deno.land/install.sh / install.ps1) if not.
 *   2. Execs `deno run <permissions> <package>/main.ts` with the caller's
 *      real working directory as the vault (`src/config.ts` defaults
 *      NOTES_DIR to cwd) — no build step, no bundling, the real TypeScript
 *      source runs exactly as it does under `deno task start`.
 */

const { spawnSync, spawn } = require("node:child_process");
const path = require("node:path");
const os = require("node:os");

const PKG_ROOT = path.resolve(__dirname, "..");
const CALLER_CWD = process.cwd();

function hasDeno() {
  const result = spawnSync("deno", ["--version"], { stdio: "ignore" });
  return result.error === undefined && result.status === 0;
}

function denoInstallDir() {
  return process.env.DENO_INSTALL
    ? path.join(process.env.DENO_INSTALL, "bin")
    : path.join(os.homedir(), ".deno", "bin");
}

function installDeno() {
  console.log(
    "noted: 'deno' wasn't found on PATH — installing it via the official installer...",
  );
  const isWindows = process.platform === "win32";
  const result = isWindows
    ? spawnSync(
      "powershell",
      ["-NoProfile", "-Command", "irm https://deno.land/install.ps1 | iex"],
      { stdio: "inherit" },
    )
    : spawnSync(
      "sh",
      ["-c", "curl -fsSL https://deno.land/install.sh | sh"],
      { stdio: "inherit" },
    );

  if (result.error || result.status !== 0) {
    console.error(
      "noted: automatic Deno install failed. Install it yourself from " +
        "https://docs.deno.com/runtime/getting_started/installation/ and re-run `noted`.",
    );
    process.exit(1);
  }
}

/** Absolute path to a usable `deno` binary, installing one if needed. */
function resolveDeno() {
  if (hasDeno()) return "deno";

  installDeno();

  const installed = path.join(
    denoInstallDir(),
    process.platform === "win32" ? "deno.exe" : "deno",
  );
  const check = spawnSync(installed, ["--version"], { stdio: "ignore" });
  if (check.error) {
    console.error(
      `noted: installed Deno but couldn't run it at ${installed}. ` +
        "Open a new terminal (so PATH picks it up) and re-run `noted`.",
    );
    process.exit(1);
  }
  return installed;
}

function main() {
  const deno = resolveDeno();
  const home = os.homedir();
  const stateDir = path.join(home, ".noted");
  const publicDir = path.join(PKG_ROOT, "public");

  const args = [
    "run",
    "--allow-net",
    "--allow-env",
    "--allow-run=git,xdg-open,open,cmd,powershell",
    `--allow-read=${[CALLER_CWD, publicDir, stateDir].join(",")}`,
    `--allow-write=${[CALLER_CWD, stateDir].join(",")}`,
    path.join(PKG_ROOT, "main.ts"),
  ];

  const child = spawn(deno, args, {
    cwd: CALLER_CWD,
    stdio: "inherit",
    env: process.env,
  });

  // `stdio: "inherit"` already lets Ctrl-C reach the child via the shared
  // foreground process group in a normal terminal; forward explicitly too
  // for the cases that aren't (e.g. wrapped by another process manager).
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => child.kill(signal));
  }

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
    } else {
      process.exit(code ?? 0);
    }
  });

  child.on("error", (cause) => {
    console.error(`noted: failed to launch deno: ${cause.message}`);
    process.exit(1);
  });
}

main();
