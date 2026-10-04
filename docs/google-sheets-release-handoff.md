# Google Sheets release handoff

## Release scope

Production acceptance is assigned to the owner at their explicit request. A push
is not evidence that Google webhook delivery, native AI generation, or an
already-open production browser has passed acceptance.

## Architecture and implementation

- Existing create/connect/OAuth and the shared vocabulary importer remain in use.
- Webhook, manual sync and reconciliation use the same connection lock and engine.
- Browser refresh observes completed sync revisions; it does not periodically POST sync.
- OAuth tokens stay encrypted server-side. Channel tokens are stored as digests.
- Drive `files.watch`, `channels.stop`, file trash, Sheets create/read/write and
  batch operations implement the workspace lifecycle. No Gemini API enrichment.
- Native AI prompt application separates header/body rows, honors actual columns,
  protects plain text and checks for edits before writing. Google owns generation.
- Fingerprints project template fields, excluding STT/source identity. Conflicts
  preserve both versions; bulk reviews require a snapshot-specific approval.
- Replacement stages and verifies B before activating it and retiring A, retaining
  word/source identities. Resource history records old and failed candidates.
- Disconnect keeps the file and vocabulary. Trash is restricted to proven managed
  files. Unknown legacy ownership defaults to external. Missing files and revoked
  access are classified separately.
- Health, repair, replacement, trash and resource-history routes/dialogs extend the
  existing admin integration with permission and folder checks.

## Database and deployment

Migration `drizzle/0040_google_sheet_workspace.sql` was applied successfully to the
configured production database before push. It adds ownership/external-state
columns and resource history, and widens notification sequence storage to bigint.
No vocabulary synchronization or production acceptance edits were performed as
part of this release handoff. Other environments can use
`npm run db:migrate:google-sheets` after reviewing their database configuration.

The hourly GitHub workflow requires:

- Repository secret `CRON_SECRET`, equal to the deployed Vercel value.
- Repository variable `GOOGLE_SHEETS_RECONCILE_URL`, set to
  `https://vocabulary-exam.vercel.app/api/cron/google-sheets/reconcile`.
- GitHub Actions enabled; run the reconciliation workflow manually once configured.

Hourly reconciliation renews watches before scanning data. Daily Vercel cron is
only a fallback: a daily schedule alone cannot guarantee coverage for 23h watches.
GitHub schedules can be delayed; monitor failures and missed runs.

## Owner production acceptance

Final local verification before push: Sheets isolated PostgreSQL 231/231 passed,
zero skips; `npm test` 455 passed, 19 skipped, zero failures; `npm run lint` passed
with Hook warnings; `npm run build` passed. No production E2E claim is made.

1. Wait for the deployment corresponding to the pushed commit to become Ready.
2. Open vocabulary management and keep the browser open.
3. Change only hello's Example in Google Sheets to `Test sheet`.
4. Do not click Sync Now and do not refresh the browser.
5. Confirm history trigger is webhook/automatic, one row updates, word ID stays
   unchanged, DB and already-open UI show `Test sheet`.
6. Verify native Google AI generation and a subsequent manual text override; then
   verify prompt apply preserves normal text, STT and IDs.
7. On disposable test resources, verify replacement, managed trash, external-file
   protection, external deletion and large-delete confirmation.

Realtime production result: webhook received, updated count, DB value, word ID
and UI value are **not verified by this release**; the owner performs this test.

## Known limits requiring follow-up

- Native Google AI availability depends on the Google account and may require
  Generate/Insert; writing a formula does not prove generation occurred.
- Read-before-write checks reduce concurrent-edit risks but Sheets value writes
  do not provide an atomic compare-and-swap with user edits.
- Prompt application reads allocated Sheet rows in 5,000-row chunks and preserves
  absolute row coordinates across empty chunks; a 10,002-row regression covers this.
- Large syncs still contain per-row database updates; 10,000-row production
  performance has not been established.
- The configured `delete` policy currently tombstones mappings rather than
  hard-deleting parent words, preserving learning records. This differs from
  literal hard-delete semantics in the original specification.
- Full production lifecycle/UI/mobile acceptance remains unverified.

The commit contains the authoritative changed/new file inventory (`git show
--stat`). Local PostgreSQL tests use a dedicated temporary instance and fake
Google services; they are not production webhook evidence.
