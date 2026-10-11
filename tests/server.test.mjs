import { request as httpRequest } from "node:http";
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { createWorkspaceServer } from "../bin/server.mjs";
import { initWorkspace } from "../bin/store.mjs";
test("loopback API requires a token, exact origin and bounded validated writes", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "agency-http-")),
    path = join(dir, "workspace.sqlite3");
  initWorkspace(path, "Synthetic");
  const { server, token } = createWorkspaceServer(path);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    rmSync(dir, { recursive: true, force: true });
  });
  assert.equal((await fetch(origin + "/api/records")).status, 401);
  assert.equal(
    await new Promise((resolve, reject) => {
      const req = httpRequest(
        origin + "/api/records",
        {
          headers: { Host: "attacker.test", Authorization: `Bearer ${token}` },
        },
        (res) => {
          res.resume();
          resolve(res.statusCode);
        },
      );
      req.on("error", reject);
      req.end();
    }),
    403,
  );
  assert.equal(
    (
      await fetch(origin + "/api/records", {
        headers: { Authorization: `Bearer ${token}` },
      })
    ).status,
    200,
  );
  const input = {
    record: {
      id: randomUUID(),
      version: 1,
      updatedAt: new Date().toISOString(),
      kind: "company",
      data: { name: "<script>unsafe</script>", website: null },
    },
    expectedVersion: 0,
    idempotencyKey: randomUUID(),
  };
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
    Origin: origin,
  };
  assert.equal(
    (
      await fetch(origin + "/api/records", {
        method: "POST",
        headers: { ...headers, Origin: "https://attacker.test" },
        body: JSON.stringify(input),
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await fetch(origin + "/api/records", {
        method: "POST",
        headers,
        body: "x".repeat(65537),
      })
    ).status,
    413,
  );
  const reply = await fetch(origin + "/api/records", {
    method: "POST",
    headers,
    body: JSON.stringify(input),
  });
  assert.equal(reply.status, 200);
  const html = await fetch(origin);
  assert.match(
    html.headers.get("content-security-policy"),
    /frame-ancestors 'none'/,
  );
  assert.equal(
    (
      await (
        await fetch(origin + "/api/profile", {
          headers: { Authorization: `Bearer ${token}` },
        })
      ).json()
    ).name,
    "Synthetic",
  );
  assert.equal(
    (
      await fetch(origin + "/api/report", {
        headers: { Authorization: `Bearer ${token}` },
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await fetch(origin + "/api/records", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      })
    ).status,
    405,
  );
  assert.equal(
    (
      await fetch(origin + "/api/records", {
        method: "POST",
        headers,
        body: "{}",
      })
    ).status,
    409,
  );
  assert.equal(
    (await fetch(origin + "/api/send", { method: "POST", headers, body: "{}" }))
      .status,
    404,
  );
});
test("serve validates the port and starts only on loopback", async (t) => {
  const { serveWorkspace } = await import("../bin/server.mjs");
  const dir = mkdtempSync(join(tmpdir(), "agency-serve-")),
    path = join(dir, "profile.sqlite3");
  initWorkspace(path, "Synthetic");
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  await assert.rejects(serveWorkspace(path, 0), /port/);
  const probe = createWorkspaceServer(path);
  await new Promise((resolve) => probe.server.listen(0, "127.0.0.1", resolve));
  const port = probe.server.address().port;
  await new Promise((resolve) => probe.server.close(resolve));
  const server = await serveWorkspace(path, port);
  assert.equal(server.address().address, "127.0.0.1");
  await new Promise((resolve) => server.close(resolve));
});
