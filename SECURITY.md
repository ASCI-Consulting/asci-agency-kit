# Security

Do not put real client records in issues, screenshots, fixtures or pull requests. Report vulnerabilities privately using the repository's security reporting feature if enabled; otherwise contact a maintainer privately before sharing exploit details. Do not post secrets publicly.

Supported scope: one trusted local user, Node 22.13+, SQLite profile version 1. Loopback bearer tokens are ephemeral. Files are not encrypted. The app is not a hosted multi-tenant service. A malicious local process or browser extension with local access is outside this authorization boundary.

Maintain strict schemas, parameterized SQL, expected versions, replay receipts, bounded payloads, exact-origin writes and safe DOM text rendering. Do not add email sending as an incidental CRM feature. A future adapter needs separate permissions, audited state transitions and its own integration tests.
