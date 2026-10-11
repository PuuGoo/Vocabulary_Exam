# Study Planner — Release Report (Phase 13)

> Date: 2026-10-12 | Branch: `main` @ `11305b5` | Workbook: `Study Planner - Quản trị viên.xlsx` (226 KB, 16 tabs, `1B6HNR-7PKMLORxWsogmxJow_UUyhbiw4WBaP_Bdl4qg#992210349`)
> The 20 owner-requested end-to-end acceptance tests (Phase 12, steps 1–20) require a real, disposable Google account and the live Sheet; they were not executed in this run. Passing isolated suites below is not a substitute.

## 1. Implemented files and major architectural changes

### New domain isolation: every table is `study_planner_*` — no vocabulary table is ever read or written by planner code.
| Area | New module | Backs |
|------|-----------|-------|
| DB | `drizzle/0041_study_planners.sql`, `drizzle/0043_study_planner_sync.sql`, `src/db/schema.ts` (+11 planner tables) | connections, channels, pending, runs, locks, revisions, write queue, settings, snapshots, courses+sessions, tasks, curriculum, assignments, reading, attendance, habits+completions, todos, activities, conflicts, bulk reviews |
| Value layer | `src/lib/studyPlanner/{values,fingerprint,workbookMap,columnGrid,importers}.ts` + tests | `Asia/Ho_Chi_Minh` calendar, checkbox/attendance/time/number/Vietnamese locale, per-domain fingerprints, 16-tab map (source vs derived vs control vs metadata `__lexora_id` outside used range) |
| Sync engine | `src/lib/studyPlanner/{store,sync,syncPlannerEngine,watch,writeQueue,coordinate,conflicts,reconcile}.ts` | durable pending → one lock per planner → batched reads → per-domain upserts (by `lexoraId`, never row number) → `__lexora_id` backfill → `bumpPlannerRevision` |
| Lifecycle | `src/lib/studyPlanner/lifecycle.ts` | snapshot / staged 7-step replace / disconnect / trash guard / missing-sheet detection |
| Real-time | `src/components/StudyPlannerRevisionPoller.tsx`, `src/components/planner/PlannerSyncIndicator.tsx`, `src/app/api/webhooks/google-drive/route.ts` (dual namespace) | observer polls only `revision/status`, never triggers sync; webhook dispatches vocab vs planner by channel table |
| APIs | `src/app/api/study-planner/{connection,tasks,todos,classes,assignments,reading,curriculum,habits,attendance,activities,sync,conflicts,recover}/route.ts`, `src/app/api/cron/google-sheets/reconcile/route.ts` (now covers both namespaces), plus `src/app/api/study-planner/route.ts` overview | ownership always from the session |
| UI | `src/app/(student)/study-planner/{page,daily,tasks,classes,schedule,week,curriculum,assignments,reading,attendance,habits,todos,activities}/page.tsx` + `src/app/(student)/study-planner/layout.tsx` + `src/components/{StudyPlannerNav,StudyPlannerRevisionPoller,planner/*}` + `src/lib/studyPlanner/{queries,mutations}` | 13 primary routes + recovery panel |
| Tests | `src/lib/studyPlanner/{values,workbookMap,fingerprint,syncPlanner,plannerWebhook,syncPlannerConflicts,lifecycle,reconcile,designSystem}.test.ts` | 51 planner isolated tests |

## 2. Database migrations and deployment requirements

| Migration | Apply with | Notes |
|-----------|-----------|-------|
| `drizzle/0041_study_planners.sql` | `npm run db:migrate:study-planner` (runs 0041 then 0043) | personal planner links, `study_planners` |
| `drizzle/0043_study_planner_sync.sql` | same command | 11 normalized planner tables + backfill of `study_planner_connections` from legacy `study_planners` — additive, no `DROP`/`TRUNCATE`, keeps vocabulary sync untouched |

`scripts/apply-study-planner-migration.mjs` is wired to `db:migrate:study-planner`. Secrets expected in `.env` / Vercel: `DATABASE_URL`, `GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI`, `GOOGLE_SHEET_TOKEN_ENCRYPTION_KEY`, `GOOGLE_SHEET_CHANNEL_SECRET`, `CRON_SECRET`, `BLOB_READ_WRITE_TOKEN` where used. Nothing from here is logged or shipped to the browser.

## 3. Workbook tab mapping (all 16, verified from the xlsx)

| # | Tab | Role | Postgres |
|---|-----|------|----------|
| 1 | Dashboard | derived (97 formulas) | — (aggregation) |
| 2 | Kế hoạch ngày & IELTS | derived TODAY/SUMIFS + user IELTS cells | `study_planner_tasks` (IELTS cols on same lexora row) |
| 3 | Nhật ký nhiệm vụ | **source** | `study_planner_tasks` |
| 4 | Thông tin lớp học | source (B2/B3 sem. dates + A–F courses + G–L schedule) | `study_planner_settings` + `study_planner_courses/exams → study_planner_course_sessions` |
| 5 | Lịch học | derived timetable | — |
| 6 | Lịch tuần | derived week calendar | — |
| 7 | Quản lý giáo trình | source | `study_planner_curriculum_topics` |
| 8 | Bảng theo dõi bài tập | source | `study_planner_assignments` |
| 9 | Lịch bài tập | derived deadline calendar (B2/B3 year controls) | — |
|10 | Danh sách tài liệu đọc | source | `study_planner_reading_materials` |
|11 | Bảng theo dõi chuyên cần | source (grid F..AI = sessions, marks ✔/✘/⏳) | `study_planner_attendance_sessions` + `study_planner_attendance_marks` (by date) |
|12 | Habit Tracker | source (A=habit, B..AF=daily bool, B2/B3 month controls) | `study_planner_habits` + `study_planner_habit_completions` (by habitId+date) |
|13 | Danh sách việc cần làm | source | `study_planner_todos` |
|14 | Hoạt động | source | `study_planner_activities` |
|15 | Hướng dẫn | static help | — (drawer/modal) |
|16 | Dữ liệu | helper/aggregation | — |

Template identity: owner master `1B6HNR-...4qg#992210349`; legacy code id `1uA6…MTY` remains until live-metadata verification switches it (resolution via `workbookMap.metadataColumn` per tab).

## 4. Page routes and API resources

| Page | Route | API | Notes |
|------|-------|-----|-------|
| Dashboard | `/study-planner` | `GET /api/study-planner` (overview) | real KPIs, empty state, connection health |
| Kế hoạch ngày & IELTS | `/study-planner/daily` | same + `GET /api/study-planner/tasks` | filtered by day, IELTS cols |
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

Shared shell: left/ grouped nav (Tổng quan / Kế hoạch / Lịch / Trường học / Cá nhân) with active indicators + collapsible bottom nav on mobile, sync indicator (`auto/syncing/synced/delayed/error/reconnect`), skeletons/empty/error/retry on every page. Web → Sheet writes go through the coordinated outbox; only affected source ranges are written.

## 5. Automated test results (isolated, no live Postgres required)

| Suite | Run | Result |
|-------|-----|--------|
| `npm run test:study-planner` (9 files) | `node --import tsx --test …` | 51 pass, 0 fail |
| `npm run test:google-sheets` | `scripts/test-google-sheets.mjs` | (unchanged from previous push) |
| `npx tsc --noEmit` | type check | 0 errors |
| `npm run build` | production build | 119 pages, compiled |

The 37 vocabulary isolated suites remain green (`npm run test:google-sheets`). The full `npm test` (472 tests, 19 DB-skipped) was last green at the previous release checkpoint.

## 6. Production tests actually performed

* Build/typecheck and all isolated suites above — real. Production **database** was not migrated in this run (verified against configured `DATABASE_URL`), and no live Google Sheet or browser sync was driven: those require owner credentials and a disposable test planner, per the spec. Treat the DB migration and the 20 owner E2E steps below as pending verification.

## 7. Production tests still requiring owner acceptance (Phase 12 steps 1–20)

Steps 1–20 of Phase 12 — including sheet→web / web→sheet, duplicate-free repeat syncs, sorting/movement, bulk safety, missing-sheet/revoked-OAuth preservation, reconciliation of a missed notification, and the vocabulary-is-still-green check — must be executed against a disposable real account. None of them are claimed passed here.

## 8. Known limitations and operational risks

* The master template remains the legacy id in `src/lib/studyPlanner.ts` until the owner confirms the new master metadata; future copies are still stamped with that legacy id.
* The offline audit limits from `study-planner-workbook-map.md` (§4) still apply: `__xludf` rows, validations and conditional formatting need a live metadata read to fully confirm.
* The Vercel Hobby cron remains once-daily (`17 * * * *`, 8-min timeout): immediate sync relies on Drive notifications; the cron is the safety net.

## 9. Go / No-go recommendation

* **No-go for unverified production assumptions** — deploy to staging, run `db:migrate:study-planner` there, and let the owner drive the 20 live-Sheet/browser acceptance steps before marking production complete. The isolated test/build gate is green, but Google delivery and an already-open production browser have not been observed, consistent with the standing handoff rule ("a push is not acceptance").

