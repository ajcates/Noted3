/**
 * M3 end-to-end tests (notes/development.md §4) — wikilinks, the link graph,
 * rename link-rewriting, and delete link-breaking, all over real HTTP.
 *
 * Goals proven:
 *   - `[[target]]` resolves to an existing note (by filename, title, or slug),
 *     and stays unresolved until that note exists.
 *   - `GET /api/notes/:filename` reports outgoing links with resolution and
 *     renders the body to HTML with resolved/unresolved wikilink styling.
 *   - `GET /api/notes/:filename/backlinks` lists the notes that link here,
 *     with a context snippet, and ignores `[[…]]` inside code.
 *   - Renaming a note (`PATCH`) moves the file and rewrites the filename-form
 *     `[[links]]` that pointed at it; title-form links keep resolving untouched.
 *   - Deleting a note leaves dependents' links in place but unresolved.
 */

import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { createApp } from "../../src/router.ts";
import { NoteIndex } from "../../src/note-index.ts";
import type { Backlink, NoteDetail } from "../../src/types.ts";

const TOKEN = "test-token";

interface Api {
  get(path: string): Promise<Response>;
  post(path: string, body: unknown): Promise<Response>;
  patch(path: string, body: unknown): Promise<Response>;
  del(path: string): Promise<Response>;
  create(title: string, body?: string): Promise<NoteDetail>;
  detail(filename: string): Promise<NoteDetail>;
}

async function withServer(fn: (api: Api) => Promise<void>): Promise<void> {
  const notesDir = await Deno.makeTempDir({ prefix: "noted-wl-" });
  const index = await NoteIndex.build(notesDir);
  const server = Deno.serve(
    { port: 0, onListen: () => {} },
    createApp({ notesDir, port: 0, authToken: TOKEN }, { index }),
  );
  const { port } = server.addr as Deno.NetAddr;
  const origin = `http://localhost:${port}`;
  const headers = { authorization: `Bearer ${TOKEN}` };

  const api: Api = {
    get: (path) => fetch(origin + path, { headers }),
    post: (path, body) =>
      fetch(origin + path, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      }),
    patch: (path, body) =>
      fetch(origin + path, {
        method: "PATCH",
        headers,
        body: JSON.stringify(body),
      }),
    del: (path) => fetch(origin + path, { method: "DELETE", headers }),
    async create(title, body = "") {
      const res = await api.post("/api/notes", { title, body });
      assertEquals(res.status, 201, `create ${title}`);
      return await res.json() as NoteDetail;
    },
    async detail(filename) {
      const res = await api.get(`/api/notes/${encodeURIComponent(filename)}`);
      assertEquals(res.status, 200, `detail ${filename}`);
      return await res.json() as NoteDetail;
    },
  };

  try {
    await fn(api);
  } finally {
    await server.shutdown();
    await Deno.remove(notesDir, { recursive: true });
  }
}

/** Find the outgoing link with the given raw target. */
function link(detail: NoteDetail, target: string) {
  const found = detail.links.find((l) => l.target === target);
  assert(found, `expected an outgoing link with target "${target}"`);
  return found;
}

Deno.test("a link resolves once its target exists, and not before", async () => {
  await withServer(async (api) => {
    const alpha = await api.create("Alpha", "See [[Ghost Note]] for more.");
    assertEquals(link(alpha, "Ghost Note").resolved, false);
    assertStringIncludes(alpha.html, 'class="wikilink unresolved"');

    await api.create("Ghost Note"); // now the target exists

    const after = await api.detail("alpha.md");
    const resolved = link(after, "Ghost Note");
    assertEquals(resolved.resolved, true);
    assertEquals(resolved.filename, "ghost-note.md"); // resolved by slug/title
    assertStringIncludes(after.html, 'class="wikilink"');
  });
});

Deno.test("links resolve by filename form, with or without .md", async () => {
  await withServer(async (api) => {
    await api.create("Beta");
    const a = await api.create("A", "[[beta]] and [[beta.md]] and [[Beta]]");
    for (const target of ["beta", "beta.md", "Beta"]) {
      assertEquals(link(a, target).filename, "beta.md", `target ${target}`);
    }
  });
});

Deno.test("GET :filename/backlinks lists linkers with a snippet; 404 for unknown", async () => {
  await withServer(async (api) => {
    await api.create("Beta");
    await api.create("Alpha", "the plan mentions [[Beta]] in this line");
    await api.create("Gamma", "another ref via [[beta.md]] here");

    const res = await api.get("/api/notes/beta.md/backlinks");
    assertEquals(res.status, 200);
    const backlinks = await res.json() as Backlink[];
    assertEquals(backlinks.map((b) => b.filename), ["alpha.md", "gamma.md"]);
    assertEquals(backlinks[0]!.title, "Alpha");
    assertStringIncludes(backlinks[0]!.snippet, "the plan mentions");

    assertEquals((await api.get("/api/notes/nope.md/backlinks")).status, 404);
  });
});

Deno.test("[[links]] inside code are ignored for the graph", async () => {
  await withServer(async (api) => {
    await api.create("Beta");
    const d = await api.create(
      "D",
      "prose\n\n```\n[[Beta]]\n```\n\nand `[[Beta]]` inline",
    );
    assertEquals(d.links.length, 0);

    const backlinks = await (await api.get("/api/notes/beta.md/backlinks"))
      .json() as Backlink[];
    assertEquals(backlinks.length, 0);
  });
});

Deno.test("rename rewrites incoming filename-form links; title-form links still resolve", async () => {
  await withServer(async (api) => {
    await api.create("Old Note", "");
    await api.create(
      "Alpha",
      "file link [[old-note]] and title link [[Old Note]] and ext [[old-note.md]]",
    );

    const res = await api.patch("/api/notes/old-note.md", {
      filename: "new-note.md",
    });
    assertEquals(res.status, 200);

    assertEquals((await api.get("/api/notes/old-note.md")).status, 404);
    assertEquals((await api.get("/api/notes/new-note.md")).status, 200);

    const alpha = await api.detail("alpha.md");
    assertStringIncludes(alpha.body, "[[new-note]]");
    assertStringIncludes(alpha.body, "[[new-note.md]]");
    assertStringIncludes(alpha.body, "[[Old Note]]"); // title form untouched
    assert(
      !alpha.body.includes("[[old-note]]"),
      "old file-form link should be gone",
    );

    // every remaining link resolves to the renamed note
    for (const l of alpha.links) {
      assertEquals(l.filename, "new-note.md", `link ${l.target}`);
    }
  });
});

Deno.test("rename to an existing filename is a 409", async () => {
  await withServer(async (api) => {
    await api.create("One");
    await api.create("Two");
    const res = await api.patch("/api/notes/one.md", { filename: "two.md" });
    assertEquals(res.status, 409);
    assertEquals((await api.get("/api/notes/one.md")).status, 200);
  });
});

Deno.test("deleting a note leaves dependents' links unresolved", async () => {
  await withServer(async (api) => {
    await api.create("Beta");
    const a = await api.create("Alpha", "needs [[Beta]]");
    assertEquals(link(a, "Beta").resolved, true);

    assertEquals((await api.del("/api/notes/beta.md")).status, 204);

    const after = await api.detail("alpha.md");
    assertEquals(link(after, "Beta").resolved, false);
    assertStringIncludes(after.html, 'class="wikilink unresolved"');
  });
});
