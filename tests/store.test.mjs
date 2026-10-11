import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  readFileSync,
  statSync,
  existsSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import {
  initWorkspace,
  listRecords,
  applyChange,
  workspaceReport,
} from "../bin/store.mjs";
const company = () => ({
  id: randomUUID(),
  kind: "company",
  version: 1,
  updatedAt: "2026-10-11T15:00:00Z",
  data: { name: "Synthetic Studio", website: null },
});
test("initialization is explicit and reads neither create files nor alter a database", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "agency-kit-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, "private", "workspace.sqlite3");
  assert.throws(() => listRecords(path));
  assert.equal(existsSync(join(dir, "private")), false);
  initWorkspace(path, "Synthetic Agency");
  const before = [
    readFileSync(path),
    statSync(path).mtimeMs,
    statSync(path).mode,
  ];
  assert.deepEqual(listRecords(path), []);
  assert.deepEqual(workspaceReport(path).summary, {
    openTasks: 0,
    overdueTasks: 0,
    openDeals: 0,
    wonDeals: 0,
    activeEngagements: 0,
  });
  assert.deepEqual(
    [readFileSync(path), statSync(path).mtimeMs, statSync(path).mode],
    before,
  );
  assert.throws(() => initWorkspace(path, "Replacement"), /exists/);
});
test("writes are atomic, immutable, version checked and replay safe", (t) => {
  const dir = mkdtempSync(join(tmpdir(), "agency-kit-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, "workspace.sqlite3");
  initWorkspace(path, "Synthetic Agency");
  const record = company(),
    input = { record, expectedVersion: 0, idempotencyKey: randomUUID() };
  const first = applyChange(path, input);
  assert.deepEqual(applyChange(path, input), first);
  assert.throws(
    () =>
      applyChange(path, {
        ...input,
        record: { ...record, data: { name: "Different", website: null } },
      }),
    /Idempotency/,
  );
  assert.throws(
    () => applyChange(path, { ...input, idempotencyKey: randomUUID() }),
    /version/,
  );
  assert.equal(listRecords(path).length, 1);
  const invalid = {
    ...record,
    id: randomUUID(),
    kind: "deal",
    data: {
      title: "Inquiry",
      companyId: randomUUID(),
      offer: "Guide",
      stage: "interest",
      nextStep: "Ask owner",
    },
  };
  assert.throws(
    () =>
      applyChange(path, {
        record: invalid,
        expectedVersion: 0,
        idempotencyKey: randomUUID(),
      }),
    /parent/,
  );
  assert.equal(listRecords(path).length, 1);
  const updated = {
    ...record,
    version: 2,
    data: { name: "Reviewed Studio", website: null },
  };
  applyChange(path, {
    record: updated,
    expectedVersion: 1,
    idempotencyKey: randomUUID(),
  });
  assert.equal(record.data.name, "Synthetic Studio");
  assert.equal(listRecords(path)[0].data.name, "Reviewed Studio");
  assert.equal(workspaceReport(path).historyCount, 2);
  assert.equal(
    JSON.stringify(workspaceReport(path)).includes("Reviewed Studio"),
    false,
  );
});
test("rejects incompatible profiles, symlinks and occupied backup paths", async (t) => {
  const { DatabaseSync } = await import("node:sqlite");
  const { symlinkSync } = await import("node:fs");
  const dir = mkdtempSync(join(tmpdir(), "agency-invalid-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, "profile.sqlite3");
  assert.throws(() => initWorkspace(path, ""), /agency name/);
  initWorkspace(path, "Synthetic");
  const alias = join(dir, "alias.sqlite3");
  symlinkSync(path, alias);
  assert.throws(() => listRecords(alias), /Symbolic/);
  const foreign = join(dir, "foreign.sqlite3"),
    other = new DatabaseSync(foreign);
  other.close();
  assert.throws(() => listRecords(foreign), /not an agency/);
  const db = new DatabaseSync(path);
  db.exec("PRAGMA user_version=2");
  db.close();
  assert.throws(() => listRecords(path), /version/);
});
