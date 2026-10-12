# Study Planner — Release Report (Phase 13)

> Date: 2026-10-13 | Branch: `main` @ `76ef532` (map/grid fix, then docs at `7e0e57b`) | Workbook: `Study Planner - Quản trị viên.xlsx` (226 KB, 16 tabs, `1B6HNR-7PKMLORxWsogmxJow_UUyhbiw4WBaP_Bdl4qg#992210349`)
> The 20 owner-requested end-to-end acceptance tests (Phase 12, steps 1–20) require a real, disposable Google account and the live Sheet; they were not executed in this run. Passing isolated suites below is not a substitute.
> Follow-up 76ef532 re-verified every source tab against the actual xlsx (cell-by-cell with `xlsx` cellFormula reads). The Phase 1.4 map offsets changed on almost every tab — see §3 — and the four grid domains that had never run are now wired into the orchestrator with their control cells and column lattices. The reproduction-method coverage note below is honest about what blocks the remaining manual steps.

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
| `npm run test:study-planner` (11 files) | `node --import tsx --test …` | 64 pass, 0 fail |
| `npm run test:study-planner-db` | embedded Postgres, 314 statements | 4 pass, 0 fail (initial idempotency, soft delete, habit (habitId,date), value normalization) |
| `npx tsc --noEmit` | type check | 0 errors |
| `npm run build` | production build | 119 pages, compiled |

The 37 vocabulary isolated suites remain green (`npm run test:google-sheets`). The full `npm test` (472 tests, 37 DB-skipped) was last green at the previous release checkpoint.

## 6. Production tests actually performed

* Build/typecheck and all isolated suites above — real. Production **database** was not migrated in this run (verified against the isolated embedded Postgres), and no live Google Sheet or browser sync was driven: those require owner credentials and a disposable test planner, per the spec. Treat the DB migration and the 20 owner E2E steps below as pending verification. The new `syncPlannerDbEndToEnd.test.ts` asserts every range against the real xlsx (cell-by-cell, formula-aware, too-small stub guard) — a pure-offline stand-in for the missing live Workbook check.

## 7. Production tests still requiring owner acceptance (Phase 12 steps 1–20)

Steps 1–20 of Phase 12 — including sheet→web / web→sheet, duplicate-free repeat syncs, sorting/movement, bulk safety, missing-sheet/revoked-OAuth preservation, reconciliation of a missed notification, and the vocabulary-is-still-green check — must be executed against a disposable real account. None of them are claimed passed here. In particular steps 1–12 each need one real Google Sheets edit observer to confirm that the web view refreshes (via `StudyPlannerRevisionPoller`) without a manual reload or «Sync Now» loop.

## 8. Known limitations and operational risks

* The master template remains the legacy id in `src/lib/studyPlanner.ts` until the owner confirms the new master metadata; future copies are still stamped with that legacy id.
* The offline audit limits from `study-planner-workbook-map.md` (§4) still apply in the sense that DataValidation/conditional formatting and hidden-row layout need a live metadata read to fully confirm, but every column-letter / headerA1 / control-cell address has been verified cell-by-cell against the actual export.
* The Vercel Hobby cron remains once-daily (`17 * * * *`, 8-min timeout): immediate sync relies on Drive notifications; the cron is the safety net, and the new grid domains (settings/habits/attendance/timetable) only run inside the webhook → pending → reconcile path, not via a polling loop.

## 9. Go / No-go recommendation

* **No-go for unverified production assumptions** — the cell-address wiring is now verified offline against the real workbook (including the Nhat ky formula columns and the habit/attendance formula fringe), but deploy to staging, run `db:migrate:study-planner` there, and let the owner drive the 20 live-Sheet/browser acceptance steps before marking production complete. The isolated test/build gate is green, but Google delivery and an already-open production browser have not been observed, consistent with the standing handoff rule («a push is not acceptance»).
