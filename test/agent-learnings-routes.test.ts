import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "../src/daemon/app.js";

const apps: ReturnType<typeof createApp>[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe("agent learnings routes", () => {
  it("adds, edits, and deletes a personal preference", async () => {
    const app = createApp({
      dataDirectory: await mkdtemp(
        path.join(tmpdir(), "ohmygame-learnings-routes-"),
      ),
    });
    apps.push(app);

    const added = await app.inject({
      method: "POST",
      url: "/agent-learnings/preferences",
      payload: { text: "  Use sprite sheets.  " },
    });
    expect(added.statusCode, added.body).toBe(200);
    const created = added.json();
    expect(created.preferences).toMatchObject([{ text: "Use sprite sheets." }]);
    const id = created.preferences[0].id;

    const updated = await app.inject({
      method: "PATCH",
      url: `/agent-learnings/preferences/${id}`,
      payload: { text: "Use multi-cell sprite sheets." },
    });
    expect(updated.statusCode, updated.body).toBe(200);
    expect(updated.json().preferences).toMatchObject([
      { id, text: "Use multi-cell sprite sheets." },
    ]);

    const deleted = await app.inject({
      method: "DELETE",
      url: `/agent-learnings/preferences/${id}`,
    });
    expect(deleted.statusCode, deleted.body).toBe(200);
    expect(deleted.json().preferences).toEqual([]);
  });

  it("rejects an empty or oversized preference", async () => {
    const app = createApp({
      dataDirectory: await mkdtemp(
        path.join(tmpdir(), "ohmygame-learnings-routes-"),
      ),
    });
    apps.push(app);

    const empty = await app.inject({
      method: "POST",
      url: "/agent-learnings/preferences",
      payload: { text: "   " },
    });
    expect(empty.statusCode).toBe(400);
    const oversized = await app.inject({
      method: "POST",
      url: "/agent-learnings/preferences",
      payload: { text: "x".repeat(401) },
    });
    expect(oversized.statusCode).toBe(400);
  });
});
