import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
const cli = new URL("../bin/asci.mjs", import.meta.url).pathname;
test("installed CLI initializes explicitly, applies, lists, reports and backs up", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "agency-cli-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, "profile.sqlite3"),
    backup = join(dir, "backup.sqlite3");
  const run = (args, input) =>
    spawnSync(process.execPath, [cli, ...args], { encoding: "utf8", input });
  assert.equal(run(["list", path]).status, 1);
  assert.equal(existsSync(path), false);
  assert.equal(run(["init", path, "Synthetic Agency"]).status, 0);
  const input = {
    record: {
      id: randomUUID(),
      version: 1,
      updatedAt: new Date().toISOString(),
      kind: "company",
      data: { name: "Synthetic Studio", website: null },
    },
    expectedVersion: 0,
    idempotencyKey: randomUUID(),
  };
  assert.equal(run(["apply", path], JSON.stringify(input)).status, 0);
  assert.equal(JSON.parse(run(["list", path]).stdout).data.length, 1);
  for (const command of ["report", "doctor"])
    assert.equal(
      JSON.parse(run([command, path]).stdout).data.emailTransport,
      false,
    );
  assert.equal(run(["backup", path, backup]).status, 0);
  assert.equal(JSON.parse(run(["list", backup]).stdout).data.length, 1);
  assert.equal(run(["backup", path]).status, 1);
  assert.equal(run(["apply", path], "x".repeat(65537)).status, 1);
  assert.equal(run(["unknown", path]).status, 1);
});
