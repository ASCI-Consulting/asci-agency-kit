import { DatabaseSync } from "node:sqlite";
import {
  mkdirSync,
  existsSync,
  lstatSync,
  openSync,
  closeSync,
  chmodSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import {
  agencyChangeSchema,
  agencyRecordSchema,
  applyAgencyChange,
  agencySummary,
} from "../dist/index.js";

function pathCheck(path) {
  const full = resolve(path);
  if (existsSync(full) && lstatSync(full).isSymbolicLink())
    throw new Error("Symbolic-link profiles are not supported");
  return full;
}
function open(path, readOnly = true) {
  const full = pathCheck(path);
  if (!existsSync(full))
    throw new Error("Workspace is missing; run init explicitly");
  const db = new DatabaseSync(full, { readOnly });
  try {
    if (db.prepare("PRAGMA application_id").get().application_id !== 1095975753)
      throw new Error("This is not an agency-kit workspace");
    if (db.prepare("PRAGMA user_version").get().user_version !== 1)
      throw new Error("Unsupported workspace version");
    db.exec("PRAGMA busy_timeout=5000");
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}
export function initWorkspace(path, name) {
  if (typeof name !== "string" || !name.trim() || name.length > 160)
    throw new Error("Use an agency name between 1 and 160 characters");
  const full = pathCheck(path);
  if (existsSync(full)) throw new Error("Workspace already exists");
  mkdirSync(dirname(full), { recursive: true, mode: 0o700 });
  closeSync(openSync(full, "wx", 0o600));
  const db = new DatabaseSync(full);
  try {
    db.exec(`BEGIN; PRAGMA application_id=1095975753; PRAGMA user_version=1;
   CREATE TABLE profile(name TEXT NOT NULL);
   CREATE TABLE records(id TEXT PRIMARY KEY, body TEXT NOT NULL);
   CREATE TABLE history(idempotency_key TEXT PRIMARY KEY, request TEXT NOT NULL, result TEXT NOT NULL, recorded_at TEXT NOT NULL);`);
    db.prepare("INSERT INTO profile VALUES (?)").run(name.trim());
    db.exec("COMMIT");
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {}
    throw error;
  } finally {
    db.close();
  }
  chmodSync(full, 0o600);
  return { initialized: true, version: 1 };
}
function readRecords(db) {
  return db
    .prepare("SELECT body FROM records ORDER BY id")
    .all()
    .map((row) => agencyRecordSchema.parse(JSON.parse(row.body)));
}
export function listRecords(path) {
  const db = open(path);
  try {
    return readRecords(db);
  } finally {
    db.close();
  }
}
export function workspaceIdentity(path) {
  const db = open(path);
  try {
    const rows = db.prepare("SELECT name FROM profile").all();
    if (
      rows.length !== 1 ||
      typeof rows[0].name !== "string" ||
      !rows[0].name.trim() ||
      rows[0].name.length > 160
    )
      throw new Error("Workspace identity is invalid");
    return { name: rows[0].name };
  } finally {
    db.close();
  }
}
export function applyChange(path, value) {
  const input = agencyChangeSchema.parse(value);
  if (Buffer.byteLength(JSON.stringify(input)) > 65536)
    throw new Error("Change exceeds 64 KiB");
  const db = open(path, false);
  try {
    db.exec("BEGIN IMMEDIATE");
    const request = JSON.stringify(input),
      receipt = db
        .prepare("SELECT request,result FROM history WHERE idempotency_key=?")
        .get(input.idempotencyKey);
    if (receipt) {
      if (receipt.request !== request)
        throw new Error("Idempotency key was used for a different change");
      db.exec("COMMIT");
      return JSON.parse(receipt.result);
    }
    applyAgencyChange(readRecords(db), input.record, input.expectedVersion);
    const record = { ...input.record, updatedAt: new Date().toISOString() };
    db.prepare(
      "INSERT INTO records VALUES (?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body",
    ).run(record.id, JSON.stringify(record));
    db.prepare("INSERT INTO history VALUES (?,?,?,?)").run(
      input.idempotencyKey,
      request,
      JSON.stringify(record),
      record.updatedAt,
    );
    db.exec("COMMIT");
    return record;
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {}
    throw error;
  } finally {
    db.close();
  }
}
export function workspaceReport(path) {
  const db = open(path);
  try {
    db.exec("BEGIN");
    return {
      version: 1,
      observedAt: new Date().toISOString(),
      summary: agencySummary(readRecords(db), new Date().toISOString()),
      historyCount: db.prepare("SELECT count(*) AS n FROM history").get().n,
      emailTransport: false,
    };
  } finally {
    db.exec("ROLLBACK");
    db.close();
  }
}
export function backupWorkspace(path, target) {
  const full = pathCheck(target);
  if (existsSync(full)) throw new Error("Backup destination already exists");
  closeSync(openSync(full, "wx", 0o600));
  const db = open(path);
  try {
    db.prepare("VACUUM INTO ?").run(full);
    return { backedUp: true };
  } finally {
    db.close();
  }
}
