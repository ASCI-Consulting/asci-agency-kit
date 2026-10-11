#!/usr/bin/env node
import {
  initWorkspace,
  listRecords,
  applyChange,
  workspaceReport,
  backupWorkspace,
} from "./store.mjs";
import { serveWorkspace } from "./server.mjs";
const [command, path, arg] = process.argv.slice(2);
try {
  if (
    !path ||
    !["init", "list", "apply", "report", "doctor", "backup", "serve"].includes(
      command,
    )
  )
    throw new Error(
      "Usage: asci <init|list|apply|report|doctor|backup|serve> <database-path> [agency-name|backup-path|port]. apply reads JSON from stdin. No email operations are available.",
    );
  if (command === "serve") {
    await serveWorkspace(path, arg ? Number(arg) : 4317);
  } else {
    let result;
    if (command === "init") result = initWorkspace(path, arg);
    if (command === "list") result = listRecords(path);
    if (command === "report" || command === "doctor")
      result = workspaceReport(path);
    if (command === "backup") {
      if (!arg) throw new Error("Provide a new backup path");
      result = backupWorkspace(path, arg);
    }
    if (command === "apply") {
      const chunks = [];
      let size = 0;
      for await (const chunk of process.stdin) {
        size += chunk.length;
        if (size > 65536) throw new Error("Input exceeds 64 KiB");
        chunks.push(chunk);
      }
      result = applyChange(
        path,
        JSON.parse(
          new TextDecoder("utf-8", { fatal: true }).decode(
            Buffer.concat(chunks),
          ),
        ),
      );
    }
    process.stdout.write(
      JSON.stringify({ success: true, data: result }) + "\n",
    );
  }
} catch (error) {
  process.stderr.write(
    JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : "Operation failed",
    }) + "\n",
  );
  process.exitCode = 1;
}
