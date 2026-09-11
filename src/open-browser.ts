/**
 * Open Browser (M7, `notes/roadmap.md`) — launches the OS's default browser
 * pointed at the running app, so `noted` feels like an app you run rather
 * than a server you then have to go find a URL for.
 *
 * Best-effort: a headless machine (no desktop, no `xdg-open`/`open`
 * installed) just logs a warning and keeps serving — this must never be
 * something a boot fails over.
 */

/**
 * Pure: which command + args opens a URL on a given OS. Easy to unit test.
 *
 * Termux (Android) reports `Deno.build.os === "linux"` — it's not a distinct
 * Deno target — but it isn't a desktop Linux install and has no `xdg-open`;
 * it has its own `termux-open-url` (from the `termux-api` package) instead.
 * Detected separately via `isTermux` (the `TERMUX_VERSION` env var Termux
 * sets) rather than folded into `os`, since it isn't one.
 */
export function pickOpener(
  os: typeof Deno.build.os,
  url: string,
  isTermux = false,
): { cmd: string; args: string[] } {
  if (isTermux) return { cmd: "termux-open-url", args: [url] };
  switch (os) {
    case "darwin":
      return { cmd: "open", args: [url] };
    case "windows":
      // `cmd /c start` needs an empty-title arg before the URL, or a `&`/space
      // in the URL gets mis-parsed as a second argument.
      return { cmd: "cmd", args: ["/c", "start", "", url] };
    default:
      return { cmd: "xdg-open", args: [url] };
  }
}

/** Fire-and-forget: spawn the OS opener for `url`. Never throws. */
export async function openInBrowser(url: string): Promise<void> {
  const { cmd, args } = pickOpener(
    Deno.build.os,
    url,
    Deno.env.get("TERMUX_VERSION") !== undefined,
  );
  try {
    const { success } = await new Deno.Command(cmd, {
      args,
      stdout: "null",
      stderr: "null",
    }).output();
    if (!success) {
      console.warn(`noted: '${cmd}' exited non-zero opening ${url}`);
    }
  } catch (cause) {
    console.warn(
      `noted: couldn't auto-open a browser (${
        (cause as Error).message
      }) — open ${url} yourself`,
    );
  }
}
