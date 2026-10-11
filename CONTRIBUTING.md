# Contributing

Use synthetic data only. Run npm ci, npm run build, npm test, npm run test:coverage npm run test:e2e (install Chromium once with npx playwright install chromium), and npm run pack:check before a pull request. Preserve the original failing interaction in regression tests. Write a failing test before changing business logic; require at least 80 percent lines, branches and functions for changed logic.

Keep changes small. Do not silently migrate a database during a read. Update schema/version compatibility, documentation and tests together. Record unresolved limitations. Never commit local profiles, credentials, rendered customer artifacts or operational copy.

New integrations remain disabled by default. Commercial decisions and delivery milestones remain separate from email transport state. Prefer explicit next actions over automatic judgments.
