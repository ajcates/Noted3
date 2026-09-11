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

function hasCommand(cmd) {
  return spawnSync(cmd, ["--version"], { stdio: "ignore" }).error === undefined;
}

/**
 * Termux (Android) has its own package manager and, unlike every other
 * supported platform, the generic deno.land installer's prebuilt binary
 * isn't guaranteed to run there (Termux is bionic-libc, not glibc) — so try
 * `pkg` first and only fall back to the generic installer if that's not
 * available or doesn't work. Returns `true` if this left a working `deno` on
 * PATH.
 */
function tryTermuxPackage() {
  if (process.platform !== "android" || !hasCommand("pkg")) return false;
  console.log(
    "noted: 'deno' wasn't found — trying Termux's package manager (pkg install deno)...",
  );
  const result = spawnSync("pkg", ["install", "-y", "deno"], {
    stdio: "inherit",
  });
  return !result.error && result.status === 0 && hasDeno();
}

/** Runs the official deno.land installer. Exits the process on failure. */
function installViaOfficialScript() {
  console.log(
    "noted: installing Deno via the official installer (https://deno.land/install.sh)...",
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
    const hint = process.platform === "android"
      ? "Termux's bionic libc means the generic installer's binary doesn't always run there — " +
        "see https://github.com/denoland/deno/issues/15250 for community workarounds (e.g. glibc-runner), or "
      : "Install it yourself from ";
    console.error(
      `noted: automatic Deno install failed. ${hint}` +
        "https://docs.deno.com/runtime/getting_started/installation/ and re-run `noted`.",
    );
    process.exit(1);
  }
}

/** Absolute path to a usable `deno` binary, installing one if needed. */
function resolveDeno() {
  if (hasDeno()) return "deno";

  if (tryTermuxPackage()) return "deno";

  installViaOfficialScript();

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

  // `src/config.ts` lets an explicit NOTES_DIR override the caller's cwd as
  // the vault — mirror that here, or a custom NOTES_DIR gets no read/write
  // grant at all and every note operation fails with a permission error.
  const vaultDir = process.env.NOTES_DIR
    ? path.resolve(process.env.NOTES_DIR)
    : CALLER_CWD;

  const args = [
    "run",
    // Keep the caller's cwd as the vault, but load dependency aliases from
    // the package. Deno discovers deno.json from cwd rather than from an
    // absolute entrypoint, so a global npm install otherwise cannot resolve
    // bare imports such as `@std/path`.
    "--config",
    path.join(PKG_ROOT, "deno.json"),
    "--allow-net",
    "--allow-env",
    // Unscoped, not `--allow-run=git,xdg-open,...`: Deno requires the
    // unscoped form to spawn *any* subprocess when the environment has an
    // `LD_`/`DYLD_`-prefixed variable set (a scoped allowlist can't protect
    // against that regardless of which command you named) — and Termux
    // always sets `LD_PRELOAD` for its own exec-wrapping shim, so a scoped
    // list here fails outright on Android.
    "--allow-run",
    `--allow-read=${[vaultDir, publicDir, stateDir].join(",")}`,
    `--allow-write=${[vaultDir, stateDir].join(",")}`,
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
