# Study Planner — Workbook Map (Phase 1.4 Audit, re-verified 2026-10-12)

> File: docs/Study Planner - Quan tri vien.xlsx (226KB, 16 tabs)
> Re-verified cell-by-cell against the uploaded workbook with xlsx `cellFormula` reads.
> **Every offset below changed since the first audit** — the earlier map pointed at header
> rows and formula columns instead of the real source block, so the sync engine imported
> nothing (or the wrong cells). Keep this file and `src/lib/studyPlanner/workbookMap.ts` in sync.

## 1. Source tabs — corrected offsets

| Tab | Header | Data from | Source columns | Metadata | Notes |
|-----|--------|-----------|----------------|----------|-------|
| Ke hoach ngay & IELTS | B6 | 7 | I..N only | AN | B..G are FILTER/HSTACK formulas mirroring Nhat ky — never import (duplicate tasks). M3 = target band. |
| Nhat ky nhiem vu | A6 | 7 | B..M | AP | A = derived Ma Task, N = derived status. |
| Thong tin lop hoc | A9 | 10 | A..E + G..K | AR | B3/B4 = semester dates (controls). G..K = timetable, ONE SESSION PER ROW (course, Thu, Bat dau, Ket thuc, Phong). |
| Quan ly giao trinh | A4 | 5 | A,B,C,E,F | AR | D + H..L derived. |
| Bang theo doi bai tap | A22 | 23 | A..G,I,J | AQ | Header sits at row 22; H (Con lai) and K (Thu tu) derived. |
| Danh sach tai lieu doc | A4 | 5 | A..F,H | AR | G (Tien do) + I derived. D holds a "225-260" range string — stored as text. |
| Bang theo doi chuyen can | A6 | 7 | A + F..AI | none | Row 6 F..AI = real session dates (= B3 + 7n). A = course name (B..E derived). A7..A12 are formulas reading Thong tin lop hoc. |
| Habit Tracker | A24 | 26 | A..AF | **BP** | B3 = year, B4 = month controls. B..AF = day 1..31 of the selected month. AG..BO are 600+ formulas — never touch, so metadata moved AS -> BP. |
| Danh sach viec can lam | A6 | 7 | A,B,C,D,E,G | AQ | F (Con lai) derived. |
| Hoat dong | A4 | 5 | A..F | AQ | |

Derived (never a sync source): Dashboard, Lich hoc, Lich tuan, Lich bai tap, Huong dan, Du lieu.

## 2. What changed since the first audit (root cause of empty imports)

- Header rows were off by one or two everywhere (Nhat ky 5 -> 7, Bai tap 6 -> 23, ...).
- `Thong tin lop hoc` had only A..I mapped, so the timetable's K (room) and the session
  lattice itself were never read; sessions were invented from a single weekday cell.
- `Bang theo doi chuyen can` had no course-name column, so attendance rows had no key.
- `Habit Tracker` metadata was AS, which contains live formulas in the real workbook.
- The four grid domains (settings, sessions, habits, attendance) were never called by the
  orchestrator at all — they existed but were dead code.

## 3. Identity rules (Phase 4)

- Row tables (tasks, curriculum, assignments, reading, todos, activities, courses): hidden
  `__lexora_id` in the metadata column, outside the used/formula range.
- Course sessions: `(course, weekday, startTime)` — the timetable has no metadata column,
  so a deterministic key (`plannerSessionKey`) is used; row reordering never duplicates it.
- Attendance: `(session date, course name)`; session dates come from derived row 6, so moving
  a session column never creates a new course or new history.
- Habit completions: `(habitId, real calendar date)` derived from the B3/B4 month controls.
- Settings: semester dates (B3/B4), habit month (B3/B4), IELTS target (M3) — controls only.

## 4. Web -> Sheet write-back

- Habit completion writes the day column (`habitDayColumn`) for that date, not always B.
- Attendance writes `row.sheetColumn` for that session, not always F.
- Both were fixed together with the import side; a wrong write column is silent data loss.

## 5. Limits of this audit

- xlsx export shows `__xludf.DUMMYFUNCTION` for SPARKLINE / LET / HSTACK — not a defect.
- Data validation, conditional formatting, hidden rows and the live Sheet's formula bar are
  not visible offline; production checks still required (see docs/study-planner-release.md).
- The code template id differs from the owner's master; sheetId is resolved dynamically.
  Do not switch the hard-coded template until the live master metadata is verified.

## 6. Production checks still pending

1. Verify sheetId per tab title on the live master (no hard-coded gid).
2. Confirm B3/B4 are the real control cells (not formulas) on the live sheet.
3. Confirm row 6 of "Bang theo doi chuyen can" holds real dates, not text.
4. Confirm the metadata columns are empty on the live file before first backfill.
5. One full Sheet -> Postgres -> web roundtrip per domain, with the AI-formula columns
   untouched (Dashboard / Lich hoc / Du lieu must remain byte-identical after a sync).