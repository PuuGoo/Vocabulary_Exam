# Workspace implementation assessment

## Existing architecture

- The admin set settings panel creates Sheets through the existing create/OAuth
  workflow; connecting an existing Sheet is already a secondary action.
- `sheetLifecycle` exports vocabulary, stable source IDs, STT and native Sheets
  AI formulas. `aiPrompts` reads formulas and batches safe prompt updates.
- Drive notifications validate channel tokens and call the shared reconciler
  and sync engine. Manual and cron synchronization reuse the same engine.
- OAuth tokens are encrypted server-side. Admin routes use permission and folder
  access checks. The webhook authenticates Google channel metadata, not sessions.
- PostgreSQL stores connections, row mappings, channels, pending notifications,
  locks and sync runs. The current unique set connection constraint requires care
  when introducing replacement history without duplicating active connections.
- Vocabulary uses the common import normalizer, deduplication and ordering code;
  fingerprints project only template-managed fields. Learning state is separate.

## Gaps against the master specification

- Browser periodic full-sync POSTs must become read-only completion observation.
- Ownership must be explicit, defaulting to external for unproven legacy Sheets.
- Safe replacement needs staged creation, verified activation and old-watch
  retirement; disconnect, trash and integration removal must remain distinct.
- Health/repair needs structured diagnostics beyond renewing the watch channel.
- Large-change protection needs configurable thresholds and version-bound explicit
  confirmation, rather than only blocking and directing users elsewhere.
- Lifecycle errors, retry policies, message-number races, channel renewal coverage,
  change history completeness and batching need further verification.
- Production proof must observe an actual Google webhook, database update and
  already-open vocabulary UI without manual sync or a browser refresh.

## Validation plan

Latest isolated PostgreSQL suite: 225/225 passed, no skips (68 seconds).

Current regression run: `npm test` with dotenv disabled and an unreachable test-only
database URL: 453 passed, 19 database tests skipped, zero failures (472 tests).
The database scenarios run separately in the isolated PostgreSQL suite above.
`npm run lint` passes with existing React Hook dependency warnings. The production
build completed successfully before the shared-header-alias parser change; its
warnings include the existing jose/Edge Runtime compatibility warning.
No new deployment or push has occurred.

Recent corrections include bigint notification sequences, atomic duplicate delivery,
an hourly authenticated GitHub reconciliation workflow (not yet configured or live),
header-aware ID writeback with a fresh Sheet read, and post-mutation bulk-review
fingerprints verified with a mixed create/update/delete PostgreSQL scenario.
These results are local evidence only, not the required production webhook proof.
New DB tests prove replacement preserves word/source IDs and learning counts,
leaves exactly one active stored watch, records candidate watch failures without
retiring A, and aborts when vocabulary changes during preparation. Pending-cutoff
serialization also has a passing real DB regression. Google APIs remain fake.
Creation and replacement now expand grid capacity before exporting >1000 rows.

Dedicated PostgreSQL runner now works on Windows: dynamic loopback port,
UTF-8 cluster, pg_ctl startup with no inherited pipes, and guaranteed shutdown.
Latest run: 216 passed, zero failed/skipped (47 seconds), using real isolated
PostgreSQL and fake Google APIs. This caught a real Date serialization error in
pending cutoff SQL, now fixed using Drizzle's typed lte operator. Legacy tests
now explicitly approve all-row archival and use valid recovery fixture IDs.
A dedicated pending-cutoff DB regression was added after that run and still
needs execution. This does not prove real Google delivery or production UI.

Dedicated PostgreSQL acceptance harness is being added via embedded-postgres
(development-only dependency). It generates a fresh schema from Drizzle, seeds
a test administrator, disables dotenv and uses only loopback credentials. Tests
can disable SSL only through the explicit test setting. Windows startup is not
yet reliable; no database acceptance pass is claimed. Do not substitute the
production DATABASE_URL to work around harness startup issues.

Sync now resolves the original tab by sheetId on each read, handles renames,
and refuses to fall back to another tab. Two identity tests pass. The importer
takes the vocabulary-set lock before word locks, matching append/reorder paths;
28 architecture/engine tests pass. Duplicate normalized headers now fail rather
than selecting the first ambiguous column. Latest lint exits zero with existing
React hook warnings; TypeScript passed before the final small parser patch.

Large content updates now have separate configurable thresholds and a
version-bound manager approval. The review displays old/new values; blocked
updates report zero applied rows and partial status. Eighteen engine/review tests
pass. Health checks compare remaining native AI formulas with current prompts,
without assigning provenance to plain text; five health tests pass. Mixed
create/update/delete batches and production behavior still need integration
verification; these unit results do not establish full completion.

Production build completed successfully with DB access disabled (before the
latest resource-history UI and byte-budget patch). Existing jose Edge runtime
warnings remain; build configuration skips lint, so lint is a separate gate.
Value writes now respect UTF-8 byte budgets as well as row/range counts; four
batching tests pass. Resource history API/UI exposes active, replaced and failed
candidate Sheets using folder authorization and no watch/token fields.

The new safe `npm run test:google-sheets` runner discovers every Sheets test:
205 tests, 186 passed, 19 database tests skipped, zero failures. Two subsequent
queue-safety tests also pass. Pending/stale reconciliation now excludes disabled
and permanent-error connections and orders pending work by age so inactive
entries cannot starve valid work. Connection detail selects only the active watch.

Identity fallback now uses indexed common-import keys rather than an O(n²)
word scan. Missing Sheet IDs reuse existing mappings; missing mappings are
created for the same existing word ID. Invalid IDs, mismatched IDs and ambiguous
word matches fail instead of silently reassigning identity. Thirteen focused
engine tests pass. Automatic row AI writes re-read FORMULA values and skip text,
materialized output and existing formulas; seventeen AI tests pass. This reduces
read/write races but cannot provide Google-side conditional cell writes.

Safety review found and removed a parent-word hard-delete path: even an explicit
Sheet delete policy now tombstones the mapping and keeps learning foreign keys
intact, while reporting a delete action in history. Sparse source-ID writes no
longer fill intervening cells with empty strings, which previously erased IDs of
unchanged rows. Source-ID writes and row AI writes use the batch API. Replacement
verification ignores blank STT/raw-AI buffer rows. Focused suites passed (23
engine/architecture checks plus five writeback/verification checks).

Latest full existing npm test invocation with production DB access disabled:
471 tests, 452 passed, 19 database-dependent tests skipped, zero failed.
This is not a full database acceptance pass. Initial run exposed a stale webhook
assertion and five unguarded DB tests; the assertion now checks atomic event/queue
recording, and those five tests explicitly require GOOGLE_SHEETS_TEST_DB=1.
New focused test files are not all in the existing npm script yet.

Watch renewal now persists the new channel before stopping the old one and
serializes cron/lazy renewal with lifecycle mutations. Failed persistence cleans
the new channel while retaining old delivery. Nine focused safety tests and
TypeScript pass. No deployment or production completion is implied.

## Work completed locally (not yet deployed)

- Browser completion observation is read-only and refreshes vocabulary after the
  connection revision changes; it never periodically posts a full sync.
- Additive migration 0040 records explicit ownership and external resource state.
  Unknown legacy connections remain external by default.
- Drive trash is explicitly confirmed, permission/folder checked, serialized with
  synchronization, and rejected for external Sheets. Vocabulary tables are not
  mutated by this operation. The UI uses the existing accessible modal.
- Read-only health diagnostics report headers, duplicate/invalid/missing IDs,
  duplicate terms, mappings, STT formulas, raw AI formula counts, template version,
  tab changes, channel validity and connection state. This does not assert that a
  real webhook has arrived or that OAuth permits writes.
- Large value writes advance their starting row; batching distinguishes RAW text
  from USER_ENTERED formulas. Regression tests cover 10,001 rows without loss.
- Notification sequence advancement and pending work now commit in one database
  transaction. Catch-up processing drains newer notifications for up to three
  successful passes, with a time budget; unfinished work remains pending.
- Lazy watch renewal resets the message sequence for the newly created channel.
- Connection lists are filtered by folder visibility and detail responses no
  longer serialize the channel token digest.
- System-column repair reuses unambiguous identities and refuses ambiguous
  headers or duplicate identifiers. Full mapping repair remains unfinished.
- Disconnect now uses the lifecycle lock, atomically disables local delivery and
  pending work, preserves resource/data, and attempts Google watch cleanup. A
  cleanup failure is reported separately without reactivating local delivery.
- Settings reject reactivation of retired resources. Sync rechecks connection
  state after obtaining the lock, avoiding a stale pre-disconnect read.
- Recovery reads classified metadata errors rather than a boolean access probe,
  distinguishes permission denial from a missing resource, and never silently
  switches to another tab. Sync also persists external failure state.
- Recovery mappings reuse IDs actually read from the Sheet and existing word
  IDs, rejecting ambiguous matches rather than inventing unmapped identities.
  Recovery setup is serialized with other resource lifecycle operations.
- Bulk deletion review exposes affected IDs and allows an authorized explicit
  continuation bound to the inspected resource, Sheet and DB state. Stale
  approvals fail before writes. Environment settings configure thresholds while
  all-row deletion stays protected. Eleven focused review/engine tests passed;
  this is not production evidence. Large content-update review remains open.
- Replacement building blocks now preserve existing identities, exclude archived
  rows, verify all exported business fields, prepare template/STT/native AI/help
  tabs, and record candidate resources before proceeding. The tested protocol
  retires A only after verified activation of B, and reports cleanup failures
  separately. Resource history/staging now has an additive table in migration
  0040. Replacement has a manage/folder-authorized API and confirmation dialog.
  Activation invokes the common sync engine inside a DB transaction and rejects
  any unexpected mutations before changing the current resource. Previous files
  are retained in resource history; external files cannot be trashed. Twelve
  focused tests pass, but real database rollback/concurrency, UI rendering and
  production replacement still need verification. Migration remains undeployed.

Latest local verification: 20 focused tests passed (notification safeguards,
bounded catch-up, visibility, health, repair, trash and value batching). Lint
exited successfully with hook-dependency warnings. These checks do not prove
database concurrency or production webhook delivery.

Remaining: staged replacement, system repair, configurable/version-bound large
change confirmation, complete webhook and retry hardening, full regression runs,
real production scenarios and the final report. Do not treat this checklist as
evidence of production completion.

Reuse existing API/server modules and UI dialogs. Add additive migrations and
focused regression tests for each lifecycle operation. Run the complete test,
lint and build commands. Record the master specification's exact production
realtime, AI, prompt, replacement, deletion and protection scenarios without
claiming unsupported native Google AI generation. Push only after completion.
