import {fileURLToPath} from "node:url";
import { test, expect } from "@playwright/test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync, spawn } from "node:child_process";
let dir, server;
const cli = fileURLToPath(new URL("../bin/asci.mjs", import.meta.url)),
  origin = "http://127.0.0.1:4327";
test.beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "agency-browser-"));
  execFileSync(process.execPath, [
    cli,
    "init",
    join(dir, "workspace.sqlite3"),
    "Synthetic Agency",
  ]);
  server = spawn(
    process.execPath,
    [cli, "serve", join(dir, "workspace.sqlite3"), "4327"],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  await new Promise((accept, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Local starter did not start")),
      10000,
    );
    server.stdout.once("data", () => {
      clearTimeout(timer);
      accept();
    });
    server.once("error", reject);
    server.once("exit", (code) => {
      if (code) reject(new Error("Local starter failed"));
    });
  });
});
test.afterAll(async () => {
  if (server && server.exitCode === null) {
    server.kill("SIGTERM");
    await new Promise((resolve) => server.once("exit", resolve));
  }
  if (dir) rmSync(dir, { recursive: true, force: true });
});
test("public installed starter persists the complete company-to-delivery workflow", async ({
  page,
}) => {
  await page.goto(origin);
  await expect(
    page.getByText(
      "Saved local records · changes never send or schedule email",
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "Companies", exact: true }).click();
  await page.getByRole("button", { name: "New record" }).click();
  await page
    .getByLabel("Company name", { exact: true })
    .fill("Synthetic Studio");
  await page.getByRole("button", { name: "Save record" }).click();
  await expect(
    page.getByText("Synthetic Studio", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "People", exact: true }).click();
  await page.getByRole("button", { name: "New record" }).click();
  await page.getByLabel("Person name").fill("Synthetic Owner");
  await page
    .getByLabel("Company", { exact: true })
    .selectOption({ label: "Synthetic Studio" });
  await page.getByLabel("Role", { exact: true }).fill("Owner");
  await page.getByRole("button", { name: "Save record" }).click();
  await page.getByRole("button", { name: "Deals", exact: true }).click();
  await page.getByRole("button", { name: "New record" }).click();
  await page.getByLabel("Title", { exact: true }).fill("Inquiry guide");
  await page
    .getByLabel("Company", { exact: true })
    .selectOption({ label: "Synthetic Studio" });
  await page.getByLabel("Selected offer").fill("Inquiry workflow review");
  await page.getByLabel("Next step").fill("Confirm scope with owner");
  await page.getByLabel("Deal stage").selectOption("discovery");
  for (const name of ["goal", "constraints", "stakeholders", "notes"])
    await page
      .getByLabel(`Discovery ${name}`, { exact: true })
      .fill(`Synthetic ${name}`);
  await page.getByRole("button", { name: "Save record" }).click();
  await page.getByRole("button", { name: "Proposals", exact: true }).click();
  await page.getByRole("button", { name: "New record" }).click();
  await page.getByLabel("Title", { exact: true }).fill("One guide");
  await page
    .getByLabel("Deal", { exact: true })
    .selectOption({ label: "Inquiry guide" });
  await page.getByLabel("Scope", { exact: true }).fill("One reviewed guide");
  await page.getByLabel("Deliverables, one per line").fill("Guide\nReview");
  await page
    .getByLabel("Assumptions and exclusions")
    .fill("No live site edits");
  await page.getByRole("button", { name: "Save record" }).click();
  await page.getByRole("button", { name: "Deals", exact: true }).click();
  await page.getByRole("button", { name: "Open record" }).click();
  await page.getByLabel("Deal stage").selectOption("won");
  await page.getByLabel("Closing reason").fill("Synthetic explicit agreement");
  await page.getByRole("button", { name: "Save record" }).click();
  await page.getByRole("button", { name: "Delivery", exact: true }).click();
  await page.getByRole("button", { name: "New record" }).click();
  await page.getByLabel("Title", { exact: true }).fill("Guide delivery");
  await page
    .getByLabel("Won deal", { exact: true })
    .selectOption({ label: "Inquiry guide" });
  await page.getByLabel("Agreed scope").fill("One guide");
  await page
    .getByLabel("Milestones, one per line")
    .fill("Draft\nOwner review\nHandover");
  await page.getByRole("button", { name: "Save record" }).click();
  await page.reload();
  await expect(
    page.getByText(
      "Saved local records · changes never send or schedule email",
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "Delivery", exact: true }).click();
  await expect(page.getByText("Guide delivery", { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 650 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/public-agency-kit.png",
    fullPage: true,
  });
  const records = JSON.parse(
    execFileSync(
      process.execPath,
      [cli, "list", join(dir, "workspace.sqlite3")],
      { encoding: "utf8" },
    ),
  ).data;
  expect(records).toHaveLength(5);
  expect(
    records.find((r) => r.kind === "deal").data.stage,
  ).toBe("won");
});
