# Study Planner — Workbook Map (Phase 1.4 Audit)

> File: docs/Study Planner - Quan tri vien.xlsx (226KB, 16 tabs)
> Generated: 2026-10-11 | Tool: xlsx cellFormula read (offline, no live Google API yet)

## 1. Tab inventory (verified)

| # | Tab | ref | rows(dumped) | formulas | merges | note |
|---|-----|-----|--------------|----------|--------|------|
| 1 | Dashboard | A1:M1000 | 10+ | 97 (7 xludf) | 102 | 100% derived — aggregated metrics, GPA, counts. NOT a source. |
| 2 | Ke hoach ngay & IELTS | B1:N25 | 10+ | 25 (4 xludf) | 45 | Derived TODAY()/SUMIFS on Nhat ky. R5 header list is source: Hoan thanh, Khung gio, Phan loai, Nhiem vu, Uu tien, Thoi luong, Ngay, Ky nang, Tai lieu, Dang bai, Diem/Band, Phan tich |
| 3 | Nhat ky nhiem vu | A1:N991 | 35 tasks | 213 | 10 | PRIMARY SOURCE for daily tasks + IELTS. R4: Ma Task, Ngay, Hoan thanh(checkbox), Bat dau, Ket thuc, Phan loai, Ky nang IELTS, Nhiem vu, Muc uu tien, Thoi luong, Ghi chu, Han chot, Bu cho Task, Trang thai. A3/C3/G3/J3 are rollups. |
| 4 | Thong tin lop hoc | A1:L1000 | ~15 | 43 | 3 | SOURCE: B2 semester start, B3 end, A7:A16 Mon hoc, B7 Ma mon, C7 Giang vien, D7 Tin chi, E7 Ghi chu, G7:L schedule (Thu, Gio). B4/D3/etc are formulas (durations, GPA) — do not import. |
| 5 | Lich hoc | A1:J1000 | grid | 224 | 2 | DERIVED timetable (auto from Thong tin lop hoc). Do not import as source. |
| 6 | Lich tuan | A1:J1000 | grid | 240 | 4 | DERIVED weekly calendar (classes+activities). Control D2 select date. Do not import as source. |
| 7 | Quan ly giao trinh | A1:L1000 | 12 topics | 222 (7 xludf) | 7 | SOURCE: A5 Mon hoc, B5 Chuong/Chu de, C5 Tuan du kien, E5 Hoan thanh(checkbox), F5 Ghi chu, D5/H5:L are derived counts/sparklines. |
| 8 | Bang theo doi bai tap | A1:K1000 | 13 rows | 106 (1 xludf) | 2 | SOURCE: A-K R5: Mon hoc, Mo ta, Phan loai, Trang thai, Thoi luong, Gio nop, Ngay nop, Ghi chu, Diem, Thu tu?? R2-R4 are summary. Col H Con lai is derived. |
| 9 | Lich bai tap | B1:H1000 | calendar | 87 | 2 | DERIVED deadline calendar (from Bang theo doi). B2 year, B3 month are controls. Do not import. |
| 10 | Danh sach tai lieu doc | A1:I1000 | 6 rows | 101 (7 xludf) | 8 | SOURCE: A5 Mon hoc, B5 Ten tai lieu, C5 Tac gia, D5 Trang can doc, E5 Trang hien tai, F5 Tong so trang, H5 Ghi chu, G5/I progress derived. |
| 11 | Bang theo doi chuyen can | A1:AI986 | 30 cols | 67 (1 xludf) | 6 | SOURCE: E cols: Mon hoc + marks ✔/✘/⏳ per Buoi. R4 Buoi 1..30 are derived dates = B2+N*7. R5 B2/C2 start/end link to Thong tin. Summary B-D/F derived. |
| 12 | Habit Tracker | A1:BO1000 | 12 habits | 627 | 9 | SOURCE: A26:A40 habit names, B26:AF40 daily boolean per 1..31 (month grid). B2 year, B3 month controls. Everything else (nang suat, cay, streak) derived. |
| 13 | Danh sach viec can lam | A1:G1000 | 6 todos | 12 (1 xludf) | 3 | SOURCE: A5 Xong(checkbox/✔), B5 Viec can lam, C5 Danh muc, D5 Uu tien, E5 Han(date), G5 Ghi chu. F5 Con lai derived. |
| 14 | Hoat dong | A1:H1000 | ~8 acts | 0 | 2 | SOURCE: A3 Ngay, B3 Bat dau(time frac), C3 Ket thuc, D3 Hoat dong, E3 Loai, F3 Ghi chu. |
| 15 | Huong dan | B1:D1001 | static | 2 | 10 | Static instructions only. |
| 16 | Du lieu | A1:AB1000 | chart helpers | 39 | 2 | Helper/aggregation for charts. Derived only. |

## 2. Hidden metadata strategy

- No __lexora_id exists yet. Prefer append outside used range (col beyond last used, e.g. after col N/BO) to avoid breaking SPARKLINE/formula refs.
- For Habit Tracker: stable id per habit (append col AG...), daily completion keyed by habitId+date.
- For attendance: session = courseId + session date (A..AI header dates).

## 3. Booking for mapping -> Postgres

- Semester/courses/schedule -> study_planner_courses, study_planner_sessions, study_planner_settings(semester dates)
- Tasks/IELTS -> study_planner_task_logs + ielts_logs (shared row with category IELTS)
- Daily plan view is FILTER on Nhat ky where Ngay = TODAY(), not second table
- Curriculum, assignments, reading, attendance, habits, todos, activities -> own tables each
- Dashboard data = views/aggregations, not source

## 4. Limits of this offline audit

- xlsx export shows __xludf.DUMMYFUNCTION for SPARKLINE etc — not a real defect, inspect live Sheets formulas before fixing.
- DataValidation/conditional formatting not fully visible via xlsx lib; needs live Sheets API check.
- Production checks pending: live metadata (sheetId per title), formula bar, dropdown lists, merged range, hidden rows.

## 5. Template identity gap (Phase 1.3)

- Code template: 1uA6I3fGgr9Sh4pKxmw5I6UVX6Ib4PKa2WCSCFgH-MTY gid 2127813405 hard-coded
- Owner requested: 1B6HNR-7PKMLORxWsogmxJow_UUyhbiw4WBaP_Bdl4qg gid 992210349
- Action: verify live master before switching; resolve sheetId dynamically via metadata.
