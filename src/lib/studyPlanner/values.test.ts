import assert from "node:assert/strict";
import test from "node:test";

import {
  ATTENDANCE_MARKS,
  isSameDay,
  normalizeAttendanceMark,
  normalizeCheckbox,
  normalizeDate,
  normalizeDurationMinutes,
  normalizeInteger,
  normalizeNumber,
  normalizeText,
  normalizeTimeFraction,
  normalizeWeekday,
  readOptionalCell,
  todayLocal,
} from "@/lib/studyPlanner/values";

test("Vietnamese text survives NFC, spacing and newline normalization", () => {
  // Decomposed Vietnamese (e + combining tone) must fold to the same string a
  // Google Sheets cell returns, otherwise one edit looks like a different word.
  assert.equal(normalizeText("Kế hoạch"), normalizeText("Kế hoạch"));
  assert.equal(normalizeText("  Luyện   nghe \n ngày mai "), "Luyện nghe ngày mai");
  assert.equal(normalizeText(null), "");
  assert.equal(normalizeText(undefined), "");
});

test("checkboxes accept booleans, tick marks and Vietnamese words; blank stays null", () => {
  assert.equal(normalizeCheckbox(true), true);
  assert.equal(normalizeCheckbox(false), false);
  assert.equal(normalizeCheckbox("TRUE"), true);
  assert.equal(normalizeCheckbox("✔"), true);
  assert.equal(normalizeCheckbox("✘"), false);
  assert.equal(normalizeCheckbox("Xong"), true);
  assert.equal(normalizeCheckbox("Chưa xong"), false);
  // A cleared cell is null (intentionally empty), not false: the sync must be
  // able to tell "user cleared it" from "user set it to no".
  assert.equal(normalizeCheckbox(""), null);
  assert.equal(normalizeCheckbox(null), null);
  // ⏳ means "late" for attendance and is never a boolean.
  assert.equal(normalizeCheckbox("⏳"), null);
});

test("attendance marks use exactly the workbook's three symbols", () => {
  assert.equal(ATTENDANCE_MARKS.length, 3);
  assert.deepEqual([...ATTENDANCE_MARKS], ["✔", "✘", "⏳"]);
  assert.equal(normalizeAttendanceMark("✔"), "✔");
  assert.equal(normalizeAttendanceMark("true"), "✔");
  assert.equal(normalizeAttendanceMark("✘"), "✘");
  assert.equal(normalizeAttendanceMark("false"), "✘");
  assert.equal(normalizeAttendanceMark("Muộn"), "⏳");
  assert.equal(normalizeAttendanceMark(""), null);
  assert.equal(normalizeAttendanceMark("abc"), null);
});

test("Sheets serial dates, ISO dates and Vietnamese d/m/y all map to one ISO string", () => {
  // The owner workbook stores dates as serials. 46258 is the Monday the
  // specimen sheet starts on (verified against the real workbook), not an
  // arbitrary September date.
  assert.equal(normalizeDate(46258), "2026-08-24");
  assert.equal(normalizeDate("46258"), "2026-08-24");
  assert.equal(normalizeDate(46262), "2026-08-28");
  assert.equal(normalizeDate(46300), "2026-10-05");
  assert.equal(normalizeDate(46306), "2026-10-11");
  assert.equal(normalizeDate("2026-09-01"), "2026-09-01");
  assert.equal(normalizeDate("1/9/2026"), "2026-09-01");
  assert.equal(normalizeDate("01-09-2026"), "2026-09-01");
  // Time fractions must never be mistaken for dates.
  assert.equal(normalizeDate(0.5), null);
  assert.equal(normalizeDate(""), null);
  assert.equal(normalizeDate(null), null);
  // Impossible calendar dates are rejected instead of rolling over.
  assert.equal(normalizeDate("2026-02-31"), null);
  assert.equal(normalizeDate("2026-13-01"), null);
});

test("times are fractions of a day: 0.3125 is 07:30, strings parse too", () => {
  assert.equal(normalizeTimeFraction(0.3125), 0.3125);
  assert.equal(normalizeTimeFraction("07:30"), 0.3125);
  assert.equal(normalizeTimeFraction("07:30:00"), 0.3125);
  assert.equal(normalizeTimeFraction("0.5"), 0.5);
  assert.equal(normalizeTimeFraction(23.5), 0.5, "a whole-day serial time wraps to its fraction");
  assert.equal(normalizeTimeFraction(""), null);
  assert.equal(normalizeTimeFraction("25:00"), null, "an impossible hour is rejected");
  assert.equal(normalizeTimeFraction("07:99"), null);
  assert.equal(normalizeTimeFraction("abc"), null);
});

test("numbers, integers and durations normalize without locale surprises", () => {
  assert.equal(normalizeNumber("3.5"), 3.5);
  assert.equal(normalizeNumber("3,5"), 3.5, "a comma decimal separator is accepted");
  assert.equal(normalizeNumber("2.200"), 2200, "a dot groups thousands when followed by exactly 3 digits");
  assert.equal(normalizeNumber("2,200"), 2200, "a comma groups thousands when followed by 3 digits");
  assert.equal(normalizeNumber("3.25"), 3.25, "a dot keeps its decimal meaning otherwise");
  assert.equal(normalizeNumber("1,000,000"), 1000000);
  assert.equal(normalizeNumber("12.5"), 12.5);
  assert.equal(normalizeNumber(""), null);
  assert.equal(normalizeInteger("60"), 60);
  assert.equal(normalizeInteger(60.4), 60);
  // Durations: plain minutes, "1h" and "1:30" all become minutes.
  assert.equal(normalizeDurationMinutes(60), 60);
  assert.equal(normalizeDurationMinutes("60"), 60);
  assert.equal(normalizeDurationMinutes("1h"), 60);
  assert.equal(normalizeDurationMinutes("1:30"), 90);
  assert.equal(normalizeDurationMinutes(""), null, "blank duration is null, not 0");
});

test("weekday names map to the workbook's Monday=1 convention", () => {
  assert.equal(normalizeWeekday("Thứ Hai"), 1);
  assert.equal(normalizeWeekday("thứ ba"), 2);
  assert.equal(normalizeWeekday("CN"), 7);
  assert.equal(normalizeWeekday("Chủ Nhật"), 7);
  assert.equal(normalizeWeekday("T6"), 5);
  assert.equal(normalizeWeekday(""), null);
  assert.equal(normalizeWeekday("abc"), null);
});

test("a cleared cell is null while an unreadable cell is undefined", () => {
  // The distinction matters for Phase 4.4: a temporary API failure must never
  // be turned into "delete everything" instructions.
  assert.equal(readOptionalCell(""), null);
  assert.equal(readOptionalCell("   "), null);
  assert.equal(readOptionalCell("text"), "text");
  assert.equal(readOptionalCell(undefined), undefined, "an absent cell is not a cleared cell");
});

test("todayLocal returns the planner-local ISO date", () => {
  const iso = todayLocal();
  assert.match(iso, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(isSameDay(iso, iso), true);
  assert.equal(isSameDay(iso, null), false);
});
