/**
 * M1 end-to-end test (notes/development.md §4).
 *
 * Goal being proven: the server exposes a working notes CRUD API over HTTP
 * backed by real `.md` files on disk — list, read, create, update, delete —
 * with a shared-token auth gate, safe filename handling, and tolerance for
 * hand-written notes that have no frontmatter.
 *
 * The API is exercised the way the client will: real `fetch` calls against a
 * real `Deno.serve` instance pointed at a throwaway directory. Nothing here
 * reaches into an internal function.
 */

import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { join } from "@std/path";
import { createApp } from "../../src/router.ts";
import { NoteIndex } from "../../src/note-index.ts";
import type {
  ConflictResponse,
  NoteDetail,
  NoteSummary,
} from "../../src/types.ts";

const TOKEN = "test-token";

interface Harness {
  readonly base: string;
  readonly notesDir: string;
  /** fetch with the valid bearer token pre-attached. */
  api(path: string, init?: RequestInit): Promise<Response>;
}

async function withServer(fn: (h: Harness) => Promise<void>): Promise<void> {
  const notesDir = await Deno.makeTempDir({ prefix: "noted-e2e-" });
  const index = await NoteIndex.build(notesDir);
  const server = Deno.serve(
    { port: 0, onListen: () => {} },
    createApp({ notesDir, port: 0, authToken: TOKEN }, { index }),
  );
  const { port } = server.addr as Deno.NetAddr;
  const base = `http://localhost:${port}`;

  const harness: Harness = {
    base,
    notesDir,
    api: (path, init = {}) =>
      fetch(base + path, {
        ...init,
        headers: { authorization: `Bearer ${TOKEN}`, ...(init.headers ?? {}) },
      }),
  };

  try {
    await fn(harness);
  } finally {
    await server.shutdown();
    await Deno.remove(notesDir, { recursive: true });
  }
}

Deno.test("full CRUD cycle: create -> read -> list -> update -> delete", async () => {
  await withServer(async ({ api, notesDir }) => {
    // empty to start
    assertEquals(await (await api("/api/notes")).json(), []);

    // create
    const createRes = await api("/api/notes", {
      method: "POST",
      body: JSON.stringify({ title: "My First Note", body: "hello world" }),
    });
    assertEquals(createRes.status, 201);
    assertEquals(
      createRes.headers.get("location"),
      "/api/notes/my-first-note.md",
    );
    const created = await createRes.json() as NoteDetail;
    assertEquals(created.filename, "my-first-note.md");
    assertEquals(created.title, "My First Note");
    assertEquals(created.tags, []);
    assertEquals(created.body, "hello world");
    assertEquals(created.created, created.updated);

    // the file is really on disk with frontmatter + body
    const onDisk = await Deno.readTextFile(join(notesDir, "my-first-note.md"));
    assertStringIncludes(onDisk, "title: My First Note");
    assertStringIncludes(onDisk, "hello world");

    // list now has exactly one summary
    const list = await (await api("/api/notes")).json() as NoteSummary[];
    assertEquals(list.length, 1);
    assertEquals(list[0]!.filename, "my-first-note.md");

    // read it back in full
    const got = await (await api("/api/notes/my-first-note.md"))
      .json() as NoteDetail;
    assertEquals(got.body, "hello world");

    // update the body; title is preserved, updated moves past created
    await new Promise((r) => setTimeout(r, 5)); // ensure a distinct ISO timestamp
    const putRes = await api("/api/notes/my-first-note.md", {
      method: "PUT",
      body: JSON.stringify({ body: "updated body" }),
    });
    assertEquals(putRes.status, 200);
    const updated = await putRes.json() as NoteDetail;
    assertEquals(updated.title, "My First Note");
    assertEquals(updated.body, "updated body");
    assertEquals(updated.created, created.created);
    assert(
      updated.updated > created.updated,
      "updated timestamp should advance",
    );
    assertStringIncludes(
      await Deno.readTextFile(join(notesDir, "my-first-note.md")),
      "updated body",
    );

    // delete
    assertEquals(
      (await api("/api/notes/my-first-note.md", { method: "DELETE" })).status,
      204,
    );
    assertEquals((await api("/api/notes/my-first-note.md")).status, 404);
    assertEquals(await (await api("/api/notes")).json(), []);
  });
});

Deno.test("auth: requests without a valid bearer token are rejected", async () => {
  await withServer(async ({ base }) => {
    assertEquals((await fetch(`${base}/api/notes`)).status, 401);
    assertEquals(
      (await fetch(`${base}/api/notes`, {
        headers: { authorization: "Bearer wrong" },
      })).status,
      401,
    );
  });
});

Deno.test("slug collisions get a numeric suffix", async () => {
  await withServer(async ({ api }) => {
    const first = await (await api("/api/notes", {
      method: "POST",
      body: JSON.stringify({ title: "Same Title" }),
    })).json() as NoteDetail;
    const second = await (await api("/api/notes", {
      method: "POST",
      body: JSON.stringify({ title: "Same Title" }),
    })).json() as NoteDetail;
    assertEquals(first.filename, "same-title.md");
    assertEquals(second.filename, "same-title-2.md");
  });
});

Deno.test("filename validation blocks path traversal", async () => {
  await withServer(async ({ api }) => {
    const res = await api(`/api/notes/${encodeURIComponent("../secret.md")}`);
    assertEquals(res.status, 400);
  });
});

Deno.test("nested folders: index, read, update, move, and delete vault-relative note paths", async () => {
  const notesDir = await Deno.makeTempDir({ prefix: "noted-folders-" });
  await Deno.mkdir(join(notesDir, "projects", "noted"), { recursive: true });
  await Deno.mkdir(join(notesDir, ".hidden"), { recursive: true });
  await Deno.writeTextFile(
    join(notesDir, "projects", "noted", "roadmap.md"),
    "# Roadmap\n\nShip folders.",
  );
  await Deno.writeTextFile(
    join(notesDir, ".hidden", "ignored.md"),
    "This must not be indexed.",
  );
  const index = await NoteIndex.build(notesDir);
  const server = Deno.serve(
    { port: 0, onListen: () => {} },
    createApp({ notesDir, port: 0, authToken: TOKEN }, { index }),
  );
  const { port } = server.addr as Deno.NetAddr;
  const api = (path: string, init: RequestInit = {}) =>
    fetch(`http://localhost:${port}${path}`, {
      ...init,
      headers: { authorization: `Bearer ${TOKEN}`, ...(init.headers ?? {}) },
    });

  try {
    const list = await (await api("/api/notes")).json() as NoteSummary[];
    assertEquals(list.map((note) => note.filename), [
      "projects/noted/roadmap.md",
    ]);

    const encoded = encodeURIComponent("projects/noted/roadmap.md");
    const note = await (await api(`/api/notes/${encoded}`))
      .json() as NoteDetail;
    assertEquals(note.title, "Roadmap");

    const updated = await api(`/api/notes/${encoded}`, {
      method: "PUT",
      body: JSON.stringify({ body: "Nested update" }),
    });
    assertEquals(updated.status, 200);
    assertStringIncludes(
      await Deno.readTextFile(
        join(notesDir, "projects", "noted", "roadmap.md"),
      ),
      "Nested update",
    );

    const movedFilename = "archive/roadmap.md";
    const movedEncoded = encodeURIComponent(movedFilename);
    const moved = await api(`/api/notes/${encoded}`, {
      method: "PATCH",
      body: JSON.stringify({ filename: movedFilename }),
    });
    assertEquals(moved.status, 200);
    assertEquals((await moved.json() as NoteDetail).filename, movedFilename);
    assertEquals((await api(`/api/notes/${encoded}`)).status, 404);
    assertStringIncludes(
      await Deno.readTextFile(join(notesDir, "archive", "roadmap.md")),
      "Nested update",
    );

    assertEquals(
      (await api(`/api/notes/${movedEncoded}`, { method: "DELETE" })).status,
      204,
    );
    assertEquals((await api(`/api/notes/${movedEncoded}`)).status, 404);

    const traversal = encodeURIComponent("projects/../secret.md");
    assertEquals((await api(`/api/notes/${traversal}`)).status, 400);
  } finally {
    await server.shutdown();
    await Deno.remove(notesDir, { recursive: true });
  }
});

Deno.test("folders: create, list, and rename while preserving nested note links", async () => {
  await withServer(async ({ api, notesDir }) => {
    for (const path of ["empty", "work", "work/planning"]) {
      const created = await api("/api/folders", {
        method: "POST",
        body: JSON.stringify({ path }),
      });
      assertEquals(created.status, 201);
      assertEquals((await created.json() as { path: string }).path, path);
    }
    assertEquals(await (await api("/api/folders")).json(), [
      "empty",
      "work",
      "work/planning",
    ]);

    const target = await (await api("/api/notes", {
      method: "POST",
      body: JSON.stringify({ title: "Roadmap" }),
    })).json() as NoteDetail;
    await api(`/api/notes/${encodeURIComponent(target.filename)}`, {
      method: "PATCH",
      body: JSON.stringify({ filename: "work/planning/roadmap.md" }),
    });
    const linker = await (await api("/api/notes", {
      method: "POST",
      body: JSON.stringify({
        title: "Linker",
        body: "See [[work/planning/roadmap]].",
      }),
    })).json() as NoteDetail;

    const renamed = await api(
      `/api/folders/${encodeURIComponent("work/planning")}`,
      {
        method: "PATCH",
        body: JSON.stringify({ path: "work/strategy" }),
      },
    );
    assertEquals(renamed.status, 200);
    assertEquals(
      (await renamed.json() as { path: string }).path,
      "work/strategy",
    );
    assertEquals(await (await api("/api/folders")).json(), [
      "empty",
      "work",
      "work/strategy",
    ]);

    assertEquals(
      (await api(
        `/api/notes/${encodeURIComponent("work/planning/roadmap.md")}`,
      ))
        .status,
      404,
    );
    assertEquals(
      (await api(
        `/api/notes/${encodeURIComponent("work/strategy/roadmap.md")}`,
      ))
        .status,
      200,
    );
    const updatedLinker = await (
      await api(`/api/notes/${encodeURIComponent(linker.filename)}`)
    ).json() as NoteDetail;
    assertStringIncludes(updatedLinker.body, "[[work/strategy/roadmap]]");
    assert(await Deno.stat(join(notesDir, "work", "strategy")));

    assertEquals(
      (await api("/api/folders", {
        method: "POST",
        body: JSON.stringify({ path: "work/strategy" }),
      })).status,
      409,
    );
    assertEquals(
      (await api("/api/folders", {
        method: "POST",
        body: JSON.stringify({ path: "work/../hidden" }),
      })).status,
      400,
    );
    assertEquals(
      (await api(`/api/folders/${encodeURIComponent("work")}`, {
        method: "PATCH",
        body: JSON.stringify({ path: "work/archive" }),
      })).status,
      400,
    );
  });
});

Deno.test("bad input: non-JSON body and missing title are 400", async () => {
  await withServer(async ({ api }) => {
    assertEquals(
      (await api("/api/notes", { method: "POST", body: "not json" })).status,
      400,
    );
    assertEquals(
      (await api("/api/notes", {
        method: "POST",
        body: JSON.stringify({ body: "x" }),
      })).status,
      400,
    );
  });
});

Deno.test("PUT with a blank title is rejected; PUT without title keeps it", async () => {
  await withServer(async ({ api }) => {
    const created = await (await api("/api/notes", {
      method: "POST",
      body: JSON.stringify({ title: "Keep Me", body: "one" }),
    })).json() as NoteDetail;

    // blank title -> 400
    assertEquals(
      (await api(`/api/notes/${created.filename}`, {
        method: "PUT",
        body: JSON.stringify({ title: "   ", body: "two" }),
      })).status,
      400,
    );

    // title omitted -> unchanged, body still updates
    const updated = await (await api(`/api/notes/${created.filename}`, {
      method: "PUT",
      body: JSON.stringify({ body: "three" }),
    })).json() as NoteDetail;
    assertEquals(updated.title, "Keep Me");
    assertEquals(updated.body, "three");
  });
});

Deno.test("PUT conflict: a stale client-supplied `updated` gets a 409 with the server's current copy, not an overwrite", async () => {
  await withServer(async ({ api }) => {
    const created = await (await api("/api/notes", {
      method: "POST",
      body: JSON.stringify({ title: "Shared note", body: "v1" }),
    })).json() as NoteDetail;

    // A save that carries the exact `updated` it last read applies cleanly.
    await new Promise((r) => setTimeout(r, 5)); // ensure a distinct ISO timestamp
    const clean = await api(`/api/notes/${created.filename}`, {
      method: "PUT",
      body: JSON.stringify({ body: "v2", updated: created.updated }),
    });
    assertEquals(clean.status, 200);
    const afterClean = await clean.json() as NoteDetail;
    assertEquals(afterClean.body, "v2");

    // A second save still carrying the *original* (now stale) `updated`
    // conflicts instead of clobbering "v2".
    const stale = await api(`/api/notes/${created.filename}`, {
      method: "PUT",
      body: JSON.stringify({
        body: "v3 from a stale client",
        updated: created.updated,
      }),
    });
    assertEquals(stale.status, 409);
    const conflict = await stale.json() as ConflictResponse;
    assertEquals(conflict.error, "conflict");
    assertEquals(conflict.current.body, "v2"); // the server's real current state
    assertEquals(conflict.current.updated, afterClean.updated);

    // The file on disk is untouched by the rejected write.
    const stillV2 = await (await api(`/api/notes/${created.filename}`))
      .json() as NoteDetail;
    assertEquals(stillV2.body, "v2");

    // Omitting `updated` entirely still force-overwrites (back-compat).
    const forced = await api(`/api/notes/${created.filename}`, {
      method: "PUT",
      body: JSON.stringify({ body: "v4, no updated field" }),
    });
    assertEquals(forced.status, 200);
    assertEquals(
      (await forced.json() as NoteDetail).body,
      "v4, no updated field",
    );
  });
});

Deno.test("unknown route is 404, wrong method on a known route is 405", async () => {
  await withServer(async ({ api }) => {
    assertEquals((await api("/api/nope")).status, 404);
    assertEquals((await api("/api/notes", { method: "PATCH" })).status, 405);
  });
});

Deno.test("tolerates a hand-written note with no frontmatter", async () => {
  await withServer(async ({ api, notesDir }) => {
    await Deno.writeTextFile(
      join(notesDir, "handwritten-idea.md"),
      "just some thoughts, no frontmatter here\n",
    );
    const got = await (await api("/api/notes/handwritten-idea.md"))
      .json() as NoteDetail;
    assertEquals(got.title, "Handwritten idea"); // backfilled from the filename
    assertEquals(got.tags, []);
    assertStringIncludes(got.body, "just some thoughts");
  });
});
