/**
 * noted — HTTP entry point.
 *
 * M0 stub: read `PORT` from the environment and start `Deno.serve` with a
 * single placeholder handler, just to prove the process boots and serves.
 * The real Config Loader, Auth Middleware, HTTP Router, and Notes API
 * Handlers land in M1 — see notes/roadmap.md and notes/system-overview.md §1.
 */

const port = Number(Deno.env.get("PORT") ?? "8000");

Deno.serve({
  port,
  onListen: ({ hostname, port }) => {
    console.info(`noted (M0 stub) listening on http://${hostname}:${port}`);
  },
}, (_req: Request): Response => {
  return new Response("noted: M0 server stub — nothing wired up yet\n", {
    status: 200,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
});
