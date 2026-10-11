import { createServer } from "node:http";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  listRecords,
  applyChange,
  workspaceReport,
  workspaceIdentity,
} from "./store.mjs";
const web = new URL("../web/", import.meta.url);
function matches(value, token) {
  const a = Buffer.from(value ?? ""),
    b = Buffer.from(`Bearer ${token}`);
  return a.length === b.length && timingSafeEqual(a, b);
}
export function createWorkspaceServer(path) {
  workspaceReport(path);
  const token = randomBytes(32).toString("hex");
  let writes = [];
  const server = createServer(async (req, res) => {
    const origin = `http://127.0.0.1:${server.address().port}`;
    const reply = (status, value, type = "application/json") => {
      res.writeHead(status, {
        "Content-Type": type,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy":
          "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
      });
      res.end(type === "application/json" ? JSON.stringify(value) : value);
    };
    if (req.headers.host !== new URL(origin).host) {
      reply(403, { error: "Invalid local host" });
      return;
    }
    const routes = {
      "/": "index.html",
      "/app.mjs": "app.mjs",
      "/styles.css": "styles.css",
    };
    if (req.method === "GET" && routes[req.url]) {
      let bytes = readFileSync(new URL(routes[req.url], web));
      if (req.url === "/")
        bytes = Buffer.from(bytes.toString().replace("WORKSPACE_TOKEN", token));
      reply(
        200,
        bytes,
        req.url === "/"
          ? "text/html; charset=utf-8"
          : req.url.endsWith(".css")
            ? "text/css"
            : "text/javascript",
      );
      return;
    }
    if (!["/api/records", "/api/report", "/api/profile"].includes(req.url)) {
      reply(404, { error: "Not found" });
      return;
    }
    if (!matches(req.headers.authorization, token)) {
      reply(401, { error: "Local workspace token required" });
      return;
    }
    if (req.method === "GET") {
      try {
        reply(
          200,
          req.url === "/api/report"
            ? workspaceReport(path)
            : req.url === "/api/profile"
              ? workspaceIdentity(path)
              : listRecords(path),
        );
      } catch {
        reply(503, { error: "Workspace read failed" });
      }
      return;
    }
    if (req.method !== "POST" || req.url !== "/api/records") {
      reply(405, { error: "Method not allowed" });
      return;
    }
    if (
      req.headers.origin !== origin ||
      req.headers["content-type"] !== "application/json"
    ) {
      reply(403, { error: "Exact local origin and JSON required" });
      return;
    }
    writes = writes.filter((stamp) => Date.now() - stamp < 60000);
    if (writes.length >= 30) {
      reply(429, { error: "Wait before another change" });
      return;
    }
    writes.push(Date.now());
    try {
      const chunks = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 65536) {
          reply(413, { error: "Input exceeds 64 KiB" });
          req.resume();
          return;
        }
        chunks.push(chunk);
      }
      reply(
        200,
        applyChange(path, JSON.parse(Buffer.concat(chunks).toString())),
      );
    } catch {
      reply(409, {
        error:
          "Change rejected. Check fields and reload the current version before retrying.",
      });
    }
  });
  server.requestTimeout = 10000;
  server.headersTimeout = 10000;
  return { server, token };
}
export async function serveWorkspace(path, port = 4317) {
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw new Error("Use a port between 1024 and 65535");
  const { server } = createWorkspaceServer(path);
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  process.stdout.write(`Local agency workspace: http://127.0.0.1:${port}\n`);
  for (const signal of ["SIGINT", "SIGTERM"])
    process.once(signal, () => server.close());
  return server;
}
