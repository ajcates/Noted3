/**
 * M4 end-to-end tests (notes/development.md §4) — search and tag browsing
 * over real HTTP.
 *
 * Goals proven:
 *   - `GET /api/search?q=` matches title and body (case-insensitive), ranks
 *     title hits first, returns a context snippet, and `[]` for a blank query.
 *   - `GET /api/tags` reports each tag with its note count.
 *   - `GET /api/tags/:tag` lists the notes carrying that tag (`[]` if none).
 *   - Results stay current as notes are created, edited, and deleted.
 */

import { assertEquals, assertStringIncludes } from "@std/assert";
import { createApp } from "../../src/router.ts";
import { NoteIndex } from "../../src/note-index.ts";
import type { NoteSummary, SearchResult, TagCount } from "../../src/types.ts";

const TOKEN = "test-token";

async function withServer(
  fn: (
    call: (path: string, init?: RequestInit) => Promise<Response>,
  ) => Promise<void>,
): Promise<void> {
  const notesDir = await Deno.makeTempDir({ prefix: "noted-st-" });
  const index = await NoteIndex.build(notesDir);
  const server = Deno.serve(
    { port: 0, onListen: () => {} },
    createApp({ notesDir, port: 0, authToken: TOKEN }, { index }),
  );
  const { port } = server.addr as Deno.NetAddr;
  const origin = `http://localhost:${port}`;
  const call = (path: string, init: RequestInit = {}) =>
    fetch(origin + path, {
      ...init,
      headers: { authorization: `Bearer ${TOKEN}`, ...(init.headers ?? {}) },
    });
  try {
    await fn(call);
  } finally {
    await server.shutdown();
    await Deno.remove(notesDir, { recursive: true });
  }
}

const create = (
  call: (p: string, i?: RequestInit) => Promise<Response>,
  body: Record<string, unknown>,
) => call("/api/notes", { method: "POST", body: JSON.stringify(body) });

Deno.test("search matches title and body, ranks title hits first, snippets the body", async () => {
  await withServer(async (call) => {
    await create(call, {
      title: "Garden Plan",
      body: "when to plant tomatoes",
    });
    await create(call, {
      title: "Weekend",
      body: "buy seeds for the garden bed",
    });
    await create(call, { title: "Unrelated", body: "nothing here" });

    const results = await (await call("/api/search?q=garden"))
      .json() as SearchResult[];
    assertEquals(results.map((r) => r.filename), [
      "garden-plan.md",
      "weekend.md",
    ]);
    assertStringIncludes(results[1]!.snippet, "garden bed");

    // case-insensitive, body-only match
    const t = await (await call("/api/search?q=TOMATOES"))
      .json() as SearchResult[];
    assertEquals(t.map((r) => r.filename), ["garden-plan.md"]);

    assertEquals(await (await call("/api/search?q=")).json(), []);
    assertEquals(await (await call("/api/search?q=%20%20")).json(), []);
  });
});

Deno.test("search reflects create, edit, and delete", async () => {
  await withServer(async (call) => {
    const made = await (await create(call, { title: "Note", body: "alpha" }))
      .json();
    const filename = made.filename as string;
    assertEquals(
      ((await (await call("/api/search?q=beta")).json()) as SearchResult[])
        .length,
      0,
    );

    await call(`/api/notes/${filename}`, {
      method: "PUT",
      body: JSON.stringify({ body: "alpha beta gamma" }),
    });
    assertEquals(
      ((await (await call("/api/search?q=beta")).json()) as SearchResult[])[0]
        ?.filename,
      filename,
    );

    await call(`/api/notes/${filename}`, { method: "DELETE" });
    assertEquals(
      ((await (await call("/api/search?q=beta")).json()) as SearchResult[])
        .length,
      0,
    );
  });
});

Deno.test("search scopes isolate titles, tags, and outgoing links", async () => {
  await withServer(async (call) => {
    const alpha = await (await create(call, {
      title: "Alpha title",
      body: "body-only needle and [[Linked needle]]",
    })).json();
    await call(`/api/notes/${alpha.filename}`, {
      method: "PUT",
      body: JSON.stringify({ tags: ["tag-needle"] }),
    });
    await create(call, { title: "Needle heading", body: "plain body" });

    const filenames = async (scope: string) =>
      ((await (await call(`/api/search?q=needle&scope=${scope}`))
        .json()) as SearchResult[]).map((result) => result.filename);

    assertEquals(await filenames("titles"), ["needle-heading.md"]);
    assertEquals(await filenames("tags"), ["alpha-title.md"]);
    assertEquals(await filenames("links"), ["alpha-title.md"]);
    assertEquals((await filenames("everything")).sort(), [
      "alpha-title.md",
      "needle-heading.md",
    ]);
  });
});

Deno.test("GET /api/meta returns a display-safe vault name and live count", async () => {
  await withServer(async (call) => {
    await create(call, { title: "One" });
    await create(call, { title: "Two" });
    const meta = await (await call("/api/meta")).json() as {
      vaultName: string;
      noteCount: number;
    };
    assertEquals(meta.noteCount, 2);
    assertEquals(typeof meta.vaultName, "string");
    assertEquals(meta.vaultName.length > 0, true);
  });
});

Deno.test("GET /api/tags counts tags; GET /api/tags/:tag lists notes", async () => {
  await withServer(async (call) => {
    // POST doesn't take tags; PUT does — create then tag.
    for (
      const [title, tags] of [
        ["A", ["project", "idea"]],
        ["B", ["project"]],
        ["C", ["idea"]],
      ] as const
    ) {
      const made = await (await create(call, { title })).json();
      await call(`/api/notes/${made.filename}`, {
        method: "PUT",
        body: JSON.stringify({ tags }),
      });
    }

    const tags = await (await call("/api/tags")).json() as TagCount[];
    assertEquals(tags, [
      { tag: "idea", count: 2 },
      { tag: "project", count: 2 },
    ]);

    const projects = await (await call("/api/tags/project"))
      .json() as NoteSummary[];
    assertEquals(projects.map((n) => n.filename).sort(), ["a.md", "b.md"]);

    assertEquals(await (await call("/api/tags/nonexistent")).json(), []);
  });
});
