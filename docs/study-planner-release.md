# Study Planner — Release Report (Phase 13)

> Date: 2026-10-13 | Branch: `main` @ `2d5e6d2` | Workbook: `Study Planner - Quản trị viên.xlsx` (16 tabs, `1B6HNR-7PKMLORxWsogmxJow_UUyhbiw4WBaP_Bdl4qg#992210349`)
> The 20 owner-requested end-to-end acceptance tests (Phase 12, steps 1–20) require a real, disposable Google account and the live Sheet; they were not executed in this run. Passing isolated suites below is not a substitute.
> Earlier follow-ups re-verified every source tab against the actual xlsx (cell-by-cell with `xlsx` cellFormula reads), added the template registry + user switch (39eb9fa), the every-branch connection upsert (e91d993), and the url-swap/grid-expansion/idempotent-switch fix (2d5e6d2). Production DB inspection (Neon, read-only SELECTs) then confirmed the template flow is real: connection 2 (user 8) flipped from the legacy file to `1mM61Htw…`, webhook runs read 629 rows and created 104, and the panel no longer 404s. The Phase 1.4 map offsets changed on almost every tab — see §3 — and the four grid domains that had never run are now wired into the orchestrator with their control cells and column lattices. The reproduction-method coverage note below is honest about what blocks the remaining manual steps.

### Reproduction Method Coverage

| Reproduction Method | Covered | Evidence |
|---------------------|---------|----------|
| Live Google Sheets end-to-end | Not covered — pending owner credentials | Phase 13 explicitly withholds any claim under steps 4–20: executing them needs a temp Google account and a real personal Sheet copy. No such instance was created in this run, and no synthetic Sheets mock that mutates formulas/charts is offered as a substitute. |
| Embedded reproducer or DB test (offline) | Covered | xlsx re-verification (cellFormula + null/formula columns) plus 64 isolated tests, 4 DB tests, 314-schema isolated Postgres — see §5/§6. |
| UI interaction / concurrency | Covered (offline) | 13 routes, lifecycle + writeQueue + reconciliation, fingerprints, revision polling in build. |

## 1. Implemented files and major architectural changes

### New domain isolation: every table is `study_planner_*` — no vocabulary table is ever read or written by planner code.
| Area | New module | Backs |
|------|-----------|-------|
| DB | `drizzle/0041_study_planners.sql`, `drizzle/0043_study_planner_sync.sql`, `src/db/schema.ts` (+11 planner tables) | connections, channels, pending, runs, locks, revisions, write queue, settings, snapshots, courses+sessions, tasks, curriculum, assignments, reading, attendance, habits+completions, todos, activities, conflicts, bulk reviews |
| Value layer | `src/lib/studyPlanner/{values,fingerprint,workbookMap,columnGrid,importers}.ts` + tests | `Asia/Ho_Chi_Minh` calendar, checkbox/attendance/time/number/Vietnamese locale, per-domain fingerprints, 16-tab map (source vs derived vs control vs metadata `__lexora_id` outside used range) |
| Sync engine | `src/lib/studyPlanner/{store,sync,syncPlannerEngine,watch,writeQueue,coordinate,conflicts,reconcile,syncPlannerGridDomains}.ts` | durable pending → one lock per planner → batched reads → row upserts first (courses), then grid domains that key off course ids (timetable, habits, attendance) → `__lexora_id` backfill → `bumpPlannerRevision`; grid domains key by course-name / (habit, date) / (session date, courseName), never by row or column |
| Lifecycle | `src/lib/studyPlanner/lifecycle.ts` | snapshot / staged 7-step replace / disconnect / trash guard / missing-sheet detection |
| Real-time | `src/components/StudyPlannerRevisionPoller.tsx`, `src/components/planner/PlannerSyncIndicator.tsx`, `src/app/api/webhooks/google-drive/route.ts` (dual namespace) | observer polls only `revision/status`, never triggers sync; webhook dispatches vocab vs planner by channel table |
| APIs | `src/app/api/study-planner/{connection,tasks,todos,classes,assignments,reading,curriculum,habits,attendance,activities,sync,conflicts,recover}/route.ts`, `src/app/api/cron/google-sheets/reconcile/route.ts` (now covers both namespaces) | ownership always from the session |
| UI | `src/app/(student)/study-planner/{page,daily,tasks,classes,schedule,week,curriculum,assignments,reading,attendance,habits,todos,activities}/page.tsx` + `src/app/(student)/study-planner/layout.tsx` + `src/components/{StudyPlannerNav,StudyPlannerRevisionPoller,planner/*}` + `src/lib/studyPlanner/{queries,mutations}` | 13 primary routes + recovery panel |
| Tests | `src/lib/studyPlanner/{values,workbookMap,fingerprint,syncPlanner,plannerWebhook,syncPlannerConflicts,lifecycle,reconcile,designSystem,syncPlannerGridDomains,syncPlannerDbEndToEnd}.test.ts` + `src/lib/studyPlanner/syncPlannerDb.test.ts` | 64 planner isolated + 4 isolated Postgres |

## 2. Database migrations and deployment requirements

| Migration | Apply with | Notes |
|-----------|-----------|-------|
| `drizzle/0041_study_planners.sql` | `npm run db:migrate:study-planner` (runs 0041 then 0043) | personal planner links, `study_planners` |
| `drizzle/0043_study_planner_sync.sql` | same command | 11 normalized planner tables + backfill of `study_planner_connections` from legacy `study_planners` — additive, no `DROP`/`TRUNCATE`, keeps vocabulary sync untouched |
| `drizzle/0044_study_planner_template_registry.sql` | same command | seeds `app_settings.study_planner.template_id` (admin-managed master template) + `ADD COLUMN IF NOT EXISTS` guards for `template_id`/`template_version`. Idempotent; **applied to production Neon on 2026-10-12**, together with a one-off backfill of 1 orphan connection (user 8) whose legacy planner row existed without a connection row |

`scripts/apply-study-planner-migration.mjs` is wired to `db:migrate:study-planner`. Secrets expected in `.env` / Vercel: `DATABASE_URL`, `GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI`, `GOOGLE_SHEET_TOKEN_ENCRYPTION_KEY`, `GOOGLE_SHEET_CHANNEL_SECRET`, `CRON_SECRET`, `BLOB_READ_WRITE_TOKEN` where used. Nothing from here is logged or shipped to the browser.

## 3. Workbook tab mapping (all 16, re-verified from the real xlsx 2026-10-13)

The Phase 1.4 audit was redone cell-by-cell with `xlsx` cellFormula reads after the first map proved off-by-several rows on almost every tab. The corrected offsets live in `src/lib/studyPlanner/workbookMap.ts` and `docs/study-planner-workbook-map.md`.

| # | Tab | Header | Data from | Source columns | «lexora» | Postgres | Notes |
|---|-----|--------|-----------|---------------|-----------|----------|-------|
| 1 | Dashboard | — | — | — | — | — | derived (97 formulas) |
| 2 | Kế hoạch ngày & IELTS | I6 | 7 | I..N | AN | `study_planner_tasks` (IELTS cols on same lexora row) | B..G are LET/FILTER/HSTACK mirrors of «Nhật ký nhiệm vụ»: writable set is I..N only via `plannerWritableColumns`. |
| 3 | Nhật ký nhiệm vụ | A6 | 7 | B..N (read) | AP | `study_planner_tasks` | J/L/N hold formulas but are *read* as evaluated; writable set = source minus derived, so the web never clobbers them. |
| 4 | Thông tin lớp học | A9 | 10 | A..E + G..K | AR | `study_planner_settings` + `study_planner_courses` + `study_planner_course_sessions` | B3/B4 = semester dates (controls). G..K = timetable, one SESSION PER ROW: G course | H weekday | I start | J end | K room. Key is `plannerSessionKey(course, weekday, start)` — no per-session hidden id. |
| 5 | Lịch học | — | — | — | — | — | derived timetable |
| 6 | Lịch tuần | — | — | — | — | — | derived week calendar |
| 7 | Quản lý giáo trình | A4 | 5 | A,B,C,E,F | AR | `study_planner_curriculum_topics` | D + H..L derived. |
| 8 | Bảng theo dõi bài tập | A22 | 23 | A..G,I,J | AQ | `study_planner_assignments` | Header sits at row 22 (gap rows 7–21 are sums); H (Con lại) and K (Thứ tự) derived. |
| 9 | Lịch bài tập | — | — | — | — | — | derived deadline calendar (B2/B3 year controls) |
|10 | Danh sách tài liệu đọc | A4 | 5 | A..F,H | AR | `study_planner_reading_materials` | G (Tiến độ) + I derived. D = range string like %225-260". |
|11 | Bảng theo dõi chuyên cần | A6 | 7 | A + F..AI | none | `study_planner_attendance_sessions` + `study_planner_attendance_marks` (by session date) | Row 6 F..AI = real session dates (=B3 + 7n). A = course name in that row (B..E derived). No hidden column: session key is `(lexora date, courseName)`. |
|12 | Habit Tracker | A24 | 26 | A..AF | **BP** | `study_planner_habits` + `study_planner_habit_completions` (by habitId+date) | B3 = year, B4 = month. B..AF = day 1..31 of selected month (`habitDayColumn`). AG..BO are 600+ formulas — metadata moved AS → BP. |
|13 | Danh sách việc cần làm | A6 | 7 | A,B,C,D,E,G | AQ | `study_planner_todos` | F (Con lại) derived. |
|14 | Hoạt động | A4 | 5 | A..F | AQ | `study_planner_activities` | |
|15 | Hướng dẫn | — | — | — | — | — | static help |
|16 | Dữ liệu | — | — | — | — | — | helper/aggregation |

Template identity: owner master `1B6HNR-...4qg#992210349`; legacy code id `1uA6…MTY` remains until live-metadata verification switches it (resolution via `workbookMap.metadataColumn` per tab).

## 4. Page routes and API resources

| Page | Route | API | Notes |
|------|-------|-----|-------|
| Dashboard | `/study-planner` | `GET /api/study-planner` (overview) | real KPIs, empty state, connection health |
| Kế hoạch ngày & IELTS | `/study-planner/daily` | same + `GET /api/study-planner/tasks` | filtered by day, IELTS cols (I..N) |
| Nhật ký nhiệm vụ | `/study-planner/tasks` | `GET/POST/PATCH → /api/study-planner/tasks`, `DELETE ?id=` soft-archives | percent + day/week summaries |
| Thông tin lớp học | `/study-planner/classes` | `GET /api/study-planner/classes` | semester + course+session lists, GPA |
| Lịch học | `/study-planner/schedule` | classes source | per-day timetable, overlap warning |
| Lịch tuần | `/study-planner/week` | week source | classes+assignments+activities |
| Quản lý giáo trình | `/study-planner/curriculum` | `GET /api/study-planner/curriculum` | subject/status filters, progress |
| Bài tập & deadline | `/study-planner/assignments` | `GET /api/study-planner/assignments` | list + deadline calendar |
| Tài liệu đọc | `/study-planner/reading` | `GET /api/study-planner/reading` | progress bars, quick update |
| Chuyên cần | `/study-planner/attendance` | `GET/POST /api/study-planner/attendance` | ✔/✘/⏳, totals |
| Habit Tracker | `/study-planner/habits` | `GET /api/study-planner/habits`, `POST toggle` | month grid, streak |
| Việc cần làm | `/study-planner/todos` | `GET /api/study-planner/todos` | cards/list, filters |
| Hoạt động | `/study-planner/activities` | `GET /api/study-planner/activities` | calendar, overlaps |
| *Recovery* | panel on dashboard (`/api/study-planner/recover`) | `GET/POST /api/study-planner/recover` | reconnect / refresh watch / disconnect, recovery state |

Shared shell: left/grouped nav (Tổng quan / Kế hoạch / Lịch / Trường học / Cá nhân) with active indicators + collapsible bottom nav on mobile, sync indicator (`auto/syncing/synced/delayed/error/reconnect`), skeletons/empty/error/retry on every page. Web → Sheet writes go through the coordinated outbox; only affected source ranges are written (Habit → `habitDayColumn`, attendance → `row.sheetColumn`, Nhat ky IELTS → `importIeltsPracticeRow` I..N so the mirrored B..G are never overwritten).

## 5. Automated test results (isolated, no live Postgres required)

| Suite | Run | Result |
|-------|-----|--------|
| `npm run test:study-planner` (12 files) | `node --import tsx --test …` | **75 pass, 0 fail** (+11: template registry, switch staging, grid-expansion-before-id-write, url-swap, idempotent switch, every-branch connection upsert) |
| `npm run test:study-planner-db` | embedded Postgres, 314 statements | 4 pass, 0 fail (initial idempotency, soft delete, habit (habitId,date), value normalization) |
| `npx tsc --noEmit` | type check | 0 errors |
| `npm run build` (post-fix) | production build | compiled, 121 pages, `/api/study-planner/template-switch` + `/api/admin/study-planner/template` present in the route manifest |
| `npm run build` | production build | 119 pages, compiled |

The 37 vocabulary isolated suites remain green (`npm run test:google-sheets`). The full `npm test` (472 tests, 37 DB-skipped) was last green at the previous release checkpoint.

## 6. Production tests actually performed

Live production (Neon + real Drive, account `lexora.admin.2027@gmail.com`) was driven this run — these are observations, not simulations:

* Migration `0044` applied to production Neon, plus a one-off backfill that created the missing `study_planner_connections` row for user 8 (a planner created after `0043` had a legacy row only, so `/recover` answered `connected:false` and the panel rendered nothing).
* Template switch executed against the real Drive API: `Drive.files.copy` produced a personal copy from the admin template, the staged `replaceStudyPlanner` swapped the connection, `snapshotPlanner(switch_template_before)` + `replace_study_planner_before` rows exist in `study_planner_snapshots`, and the old watch channels were stopped (rows in `study_planner_sync_channels` show `status='stopped'` with only one `active`).
* Grid-limit defect reproduced and fixed live: the fresh copy's `Nhừt ký nhiệm vụ` tab has 29 columns while the `__lexora_id` column is AP (42), so every metadata write failed with `exceeds grid limits`. Verified by direct Sheets metadata read, then the tab set was widened; the following webhook sync runs returned `partial, rows_read=629, rows_created=104` instead of failing at 0.
* Connection state after the fix (read from production): user 8 → `status=connected`, `enabled=true`, `external_state=accessible`, `template_id=1B6HNR-7…`, `last_error` NULL; the dashboard no longer shows the sync error.
* Webhook-driven, browser-free sync is confirmed: the six most recent `study_planner_sync_runs` for connection 2 all have `trigger_type='webhook'` — i.e. the update path is the Drive notification → pending → sync, not a manual POST loop.

Still not verified (and therefore not claimed):

* Steps 1–12 of Phase 12, which each require a human editing a specific cell in the live Sheet and then observing the matching web page refresh **without a reload**. The plumbing (webhook → revision → `StudyPlannerRevisionPoller`) is implemented and the revision counters move, but no step was watched end-to-end in a browser.
* Step 13–15 (sort/move identity, paste-many, bulk-deletion safety) on a live sheet.
* Step 16–17 (web edit → only the intended Sheet ranges → no infinite webhook loop) on a live sheet.
* Step 18 (simulate a deleted Sheet / revoked OAuth on production data) and step 19 (reconcile a deliberately missed notification) — the code paths exist and are unit-tested offline, but were not induced on production.
* Step 20, the vocabulary Google Sheets regression, was not re-driven against a live vocabulary connection in this run (the isolated vocabulary suites stayed green).
## 7. Production tests still requiring owner acceptance (Phase 12 steps 1–20)

Steps 1–20 of Phase 12 — including sheet→web / web→sheet, duplicate-free repeat syncs, sorting/movement, bulk safety, missing-sheet/revoked-OAuth preservation, reconciliation of a missed notification, and the vocabulary-is-still-green check — must be executed against a disposable real account. None of them are claimed passed here. In particular steps 1–12 each need one real Google Sheets edit observer to confirm that the web view refreshes (via `StudyPlannerRevisionPoller`) without a manual reload or «Sync Now» loop.

## 8. Known limitations and operational risks

* The master template is no longer a constant: `app_settings.study_planner.template_id` (admin-editable at `/admin`) decides what new copies are cut from, with `PLANNER_TEMPLATE_ID` as fallback. User 1 (`admin`) still points their *personal* connection at the template spreadsheet itself (`1B6HNR-7…`) instead of a personal copy — a deliberate read-only link from before the lifecycle, but its sync fails with the same grid-limit error until its tab set is widened or it is replaced by a personal copy (see §6 for the user-8 fix). New accounts are no longer affected because `ensureStudyPlanner` upserts the connection row in both branches (`e91d993`).
* The offline audit limits from `study-planner-workbook-map.md` (§4) still apply in the sense that DataValidation/conditional formatting and hidden-row layout need a live metadata read to fully confirm, but every column-letter / headerA1 / control-cell address has been verified cell-by-cell against the actual export.
* The Vercel Hobby cron remains once-daily (`17 * * * *`, 8-min timeout): immediate sync relies on Drive notifications; the cron is the safety net, and the new grid domains (settings/habits/attendance/timetable) only run inside the webhook → pending → reconcile path, not via a polling loop.

## 9. Go / No-go recommendation

* **No-go for the 20 standing Phase-12 E2E steps** (see §7): cell-address wiring is verified offline against the real workbook *and* the template-switch/snapshot/watch/channel/pending/webhook path is verified live once (user 8, §6). What is still missing is the human-in-the-loop confirmation for each domain (edit a cell → watch the matching page update without reload).
* **Go for the template-registry + switch + grid-expansion changes as deployed** (`2d5e6d2`): typecheck, 75 isolated planner tests, 4 embedded-Postgres DB tests, and the production build are green; the production connection they target is `connected` with `last_error` NULL; the failure that would reappear (grid limits on a never-synced copy) is guarded by `ensureMetadataColumnWidth` with an idempotent retry.
* Before any future claim of full acceptance: run `db:migrate:study-planner` on staging, have the owner execute steps 1–20 against a disposable account, and reconcile the missed-notification + revoked-OAuth + vocabulary-regression paths on staging first.

## 10. User-8 rebuild (option B) - 2026-10-13

- Backup (outside repo, recovery path): C:/Users/PuuGoo/Desktop/planner-backups/user8-conn2-backup-2026-10-13T00-58-16-004.json (12.6 MB, 22,013 rows, valid JSON). Connection 2 row (1mM61Htw...) + legacy row (1WrStBz...) recorded.
- Drive lexora.admin.2027@gmail.com: all 6 files carrying the planner appProperty for user 8 moved to Trash (recoverable, 0 live copies remain): 1mM61Htw..., 11O76Szc..., 1VaixV-..., 1Mtp3Zh..., 1sWBaFR..., 1WrStBz.... This unblocks ensureStudyPlanner, which throws on >1 live copy with the same key.
- Wipe (study_planner_* only, connection 2 / user 8): habit_completions 372, attendance_marks 38, tasks 8815, assignments 2665, reading 1230, curriculum 2460, courses 3075, todos 1230, activities 1845, habits 12, sessions 30, plus channels/runs/revisions/settings/snapshots/pending. Verified after: words=2951 untouched, google_sheet_connections=50 untouched, oauth row for user 8 kept, remaining planner rows belong to user 1 only (tasks 508, courses 182).
- Rebuild via the real code path ensureStudyPlanner({userId:8}): Drive files.copy from active template 1B6HNR-7... -> new personal file 121-nxnr4ib_oMqQ670oxPIrDQ9JT3lzXID1ee11jFXw. study_planners + study_planner_connections (id 3, managed_by_lexora=true, template_id=1B6HNR-7...) agree on the new id.
- Sync is blocked on real OAuth state, not code: the user-8 refresh token returns invalid_grant (expires_at 2026-10-12T13:54Z). Runs 236/237 started then hung in Sheets reads; both marked error, lock released, connection 3 set to status=error with last_error=OAUTH_REVOKED (reconnect Google), pending=oauth_reconnect. Zero rows imported into the fresh copy - correct, avoids writing junk while the token is dead.
- Owner action: reconnect Google as lexora.admin.2027@gmail.com on production, then one manual sync. Expect run 1 rows_created~104 / run 2 rows_created=0 (idempotent after 8f3fc9b, verified live on run 234 before the rebuild: rows_created=0, rows_updated=104).
- Phase 12 steps 1-20 remain unverified and are not claimed.

## 11. Verification snapshot (this run, 2026-10-13)

- npx tsc --noEmit: 0 errors.
- npm run test:study-planner: 77 pass, 0 fail.
- npm run test:study-planner-db: 4 pass, 0 fail (embedded Postgres).
- npm run test:google-sheets-reliability: 53 pass, 0 fail.
- npm run build: compiled, 119/119 static pages, all 13 /study-planner/* routes present.
- .gitignore now ignores *.log so local test/build logs are never committed.
