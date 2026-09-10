/**
 * Open Browser (M7, `notes/roadmap.md`) — launches the OS's default browser
 * pointed at the running app, so `noted` feels like an app you run rather
 * than a server you then have to go find a URL for.
 *
 * Best-effort: a headless machine (no desktop, no `xdg-open`/`open`
 * installed) just logs a warning and keeps serving — this must never be
 * something a boot fails over.
 */

/** Pure: which command + args opens a URL on a given OS. Easy to unit test. */
export function pickOpener(
  os: typeof Deno.build.os,
  url: string,
): { cmd: string; args: string[] } {
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
  const { cmd, args } = pickOpener(Deno.build.os, url);
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
