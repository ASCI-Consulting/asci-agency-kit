import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
const [{ files }] = JSON.parse(
  execFileSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], {
    encoding: "utf8",
  }),
);
const allowed =
  /^(dist\/index\.(js|d\.ts)|bin\/(asci|store|server|pack-check|build)\.mjs|web\/(index\.html|app\.mjs|styles\.css)|README\.md|LICENSE|SECURITY\.md|CONTRIBUTING\.md|DESIGN\.md|package\.json)$/;
for (const { path } of files) {
  if (!allowed.test(path)) throw new Error(`Unexpected packed file: ${path}`);
  const text = readFileSync(path, "utf8");
  for (const email of text.match(
    /[A-Za-z0-9.!#$%&'*+\/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
  ) ?? [])
    if (!/\.(test|example)$/.test(email))
      throw new Error(`Non-synthetic email detected: ${path}`);
  if (
    /BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY|(?:ghp_|gho_)[A-Za-z0-9]{30,}|eyJ[A-Za-z0-9_-]{30,}\./.test(
      text,
    )
  )
    throw new Error(`Private material detected: ${path}`);
}
for (const name of [
  "dist/index.js",
  "dist/index.d.ts",
  "bin/asci.mjs",
  "bin/store.mjs",
  "bin/server.mjs",
  "web/index.html",
  "web/app.mjs",
  "web/styles.css",
  "LICENSE",
])
  if (!files.some((file) => file.path === name))
    throw new Error(`Required file missing: ${name}`);
console.log(
  JSON.stringify({
    passed: true,
    files: files.length,
    privateDataIncluded: false,
  }),
);
