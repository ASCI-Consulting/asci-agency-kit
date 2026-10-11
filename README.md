# Agency Kit

A small, local agency CRM: companies, people, tasks, opportunities, discovery notes, proposals and delivery milestones. The same validated records work through a Node CLI and a browser workspace. MIT licensed. No hosted account, subscription, email transport or AI API is required.

## Run locally

Node 22.13 or newer is required. Node 22's built-in SQLite emits an experimental warning; pin and test your runtime before upgrading.

```sh
npm ci
npm run build
node bin/asci.mjs init ./private/workspace.sqlite3 "Your agency"
node bin/asci.mjs serve ./private/workspace.sqlite3
```

Open the loopback URL printed by the CLI. Create a company, add its decision maker, create a deal with one selected offer and a next step, record discovery, scope a proposal, and explicitly record a won deal before creating delivery milestones. Create owned, dated tasks for the next decision. Refreshing the browser reads saved local records.

The public npm package is prepared as `@asci-consulting/agency-kit`. Registry publication is a separate release step; this README does not imply it has been published. A reviewed release tarball can be installed with `npm install /absolute/path/agency-kit.tgz`; its executable is `asci`.

## CLI

```sh
asci list ./private/workspace.sqlite3
asci doctor ./private/workspace.sqlite3
asci report ./private/workspace.sqlite3
asci backup ./private/workspace.sqlite3 ./private/checkpoint.sqlite3
asci apply ./private/workspace.sqlite3 < change.json
```

`list`, `report`, and `doctor` open an existing profile read-only; they never initialize or migrate it. `report` is aggregate-only and excludes record names and copy. `init` refuses an existing path. `backup` uses a consistent SQLite snapshot and refuses an existing destination. Files are created owner-only; protect the parent directory and disk yourself. Data is not encrypted by this package.

`apply` accepts exactly `{record, expectedVersion, idempotencyKey}`. Record IDs and replay keys are UUIDs. New records use version 1 and expectedVersion 0; updates increment the stored version by one. Exact retries return the original receipt. Reusing a key for a different payload, stale versions, missing parents and malformed fields are rejected. Keep receipt timestamps and keys unchanged when retrying an uncertain request.

```json
{
  "record": {
    "id": "11111111-1111-4111-8111-111111111111",
    "kind": "company",
    "version": 1,
    "updatedAt": "2026-10-11T15:00:00Z",
    "data": { "name": "Synthetic Studio", "website": "https://studio.example" }
  },
  "expectedVersion": 0,
  "idempotencyKey": "22222222-2222-4222-8222-222222222222"
}
```

## Library

```ts
import { agencyRecordSchema, applyAgencyChange, agencySummary } from '@asci-consulting/agency-kit';
const record = agencyRecordSchema.parse(input);
const next = applyAgencyChange(records, record, expectedVersion);
const summary = agencySummary(next, new Date().toISOString());
```

Records are strict discriminated unions. Companies own people/deals; deals own proposals/engagements. Delivery requires an explicitly won deal. Commercial status never changes campaign state or implies a customer endorsement. No payments, contracts, inbox placement, guaranteed client acquisition, hosted monitoring or team authorization are included.

## Security and scope

The browser server binds only to `127.0.0.1`. It checks Host, uses an ephemeral bearer token, requires the exact local Origin for writes, limits writes and payload size, applies a restrictive CSP, and inserts record text using DOM textContent. It is intended for one trusted user on one computer. Do not expose it through a reverse proxy, tunnel or public network. The private ASCi deployment separately uses organization-scoped PostgreSQL authorization; those private campaign systems and records are not shipped here.

Use `SECURITY.md` to report issues. See `CONTRIBUTING.md` for checks and `DESIGN.md` for the workflow/component contract. Development fixtures use synthetic `.example`/`.test` identities only.

## Verify and release

```sh
npm run build
npm test
npm run test:coverage
npx playwright install chromium
npm run test:e2e
npm run pack:check
```

The pack check rejects unexpected files and known private-record/credential patterns. Review the exact archive before publication. Never import operational data or Git history into this repository. The public package exports reusable relationship logic, not Gmail credentials, prospect workbooks or campaign authority.
