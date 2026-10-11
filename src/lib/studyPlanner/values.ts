/**
 * Shared, testable value normalization for Study Planner sync.
 *
 * One implementation drives the webhook import, the web API write-back and
 * the reconciliation diff, so the same cell is never interpreted three
 * different ways (Phase 2 requirement).
 *
 * Calendar semantics use Asia/Ho_Chi_Minh. Sheets serial dates are days
 * since 1899-12-30 (with the 1900 leap-year quirk baked in); times are
 * fractions of a day.
 */

export const PLANNER_TIMEZONE = "Asia/Ho_Chi_Minh";
export const SHEETS_EPOCH_DAYS = 25569; // 1899-12-30 -> 1970-01-01
export const PLANNER_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
export const ATTENDANCE_MARKS = ["✔", "✘", "⏳"] as const;
export type AttendanceMark = (typeof ATTENDANCE_MARKS)[number];

export function normalizeText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFC")
    .replace(/[   -   　]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Checkbox TRUE/FALSE plus workbook tick marks ✔/✘ and Vietnamese words. */
export function normalizeCheckbox(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  const text = normalizeText(value).toLowerCase();
  if (!text) return null;
  if (text === "true" || text === "✔" || text === "x" || text === "1" || text === "có" || text === "hoàn thành" || text === "xong" || text === "done") return true;
  if (text === "false" || text === "✘" || text === "0" || text === "không" || text === "chưa xong") return false;
  // ⏳ is attendance-specific, never a boolean here.
  return null;
}

export function normalizeAttendanceMark(value: unknown): AttendanceMark | null {
  const text = normalizeText(value);
  if (!text) return null;
  // Compare case-insensitively: the workbook accepts "Muộn", "MUỘN" and
  // "Đi muộn", and all three mean the same attendance mark.
  const lower = text.toLowerCase();
  if (text === "✔" || lower === "true") return "✔";
  if (text === "✘" || lower === "false") return "✘";
  if (text === "⏳" || lower === "late" || lower === "muộn" || lower === "đi muộn") return "⏳";
  return null;
}

/** Serial (46300), fraction-of-day time (0.3125), ISO date, dd/mm/yyyy and time strings. */
export function normalizeDate(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (typeof value === "number" && Number.isFinite(value) && value > 20000 && value < 80000) {
    return serialToIsoDate(value);
  }
  const text = normalizeText(value);
  if (!text) return null;
  if (PLANNER_DATE_PATTERN.test(text)) return isRealDate(text) ? text : null;
  const slash = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  if (slash) {
    const year = slash[3].length === 2 ? `20${slash[3]}` : slash[3];
    const iso = `${year}-${slash[2].padStart(2, "0")}-${slash[1].padStart(2, "0")}`;
    return isRealDate(iso) ? iso : null;
  }
  // Sheets serials may arrive as strings.
  const asNumber = Number(text);
  if (text !== "" && Number.isFinite(asNumber) && asNumber > 20000 && asNumber < 80000 && !text.includes("-") && !text.includes("/")) {
    return serialToIsoDate(asNumber);
  }
  return null;
}

function isRealDate(iso: string): boolean {
  const [year, month, day] = iso.split("-").map(Number);
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const probe = new Date(Date.UTC(year, month - 1, day));
  return probe.getUTCFullYear() === year && probe.getUTCMonth() === month - 1 && probe.getUTCDate() === day;
}

function serialToIsoDate(serial: number): string {
  const whole = Math.floor(serial);
  const utcMs = (whole - SHEETS_EPOCH_DAYS) * 86_400_000;
  const probe = new Date(utcMs);
  return `${probe.getUTCFullYear()}-${String(probe.getUTCMonth() + 1).padStart(2, "0")}-${String(
    probe.getUTCDate(),
  ).padStart(2, "0")}`;
}

/**
 * Fractions of a day (0.5 = noon); "07:30" strings also accepted.
 *
 * Google Sheets also returns whole-day serials in a time column (e.g. 46258
 * for "00:00"), so a value above 1 must be reduced to its time-of-day fraction
 * instead of being rejected.
 */
export function normalizeTimeFraction(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value < 0) return null;
    const fraction = value >= 1 ? value - Math.floor(value) : value;
    return fraction >= 0 && fraction < 1 ? roundTime(fraction) : null;
  }
  // A numeric string is a fraction of a day ("0.5") or a whole-day serial
  // ("46258" = 00:00). Both wrap to a time-of-day fraction; only a
  // non-numeric string falls through to the "HH:MM" parser below.
  if (typeof value === "string" && /^\d+(?:\.\d+)?$/.test(value.trim())) {
    const asNumber = Number(value.trim());
    if (!Number.isFinite(asNumber)) return null;
    const fraction = asNumber >= 1 ? asNumber - Math.floor(asNumber) : asNumber;
    return fraction >= 0 && fraction < 1 ? roundTime(fraction) : null;
  }
  const text = normalizeText(value);
  if (!text) return null;
  const match = text.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = match[3] ? Number(match[3]) : 0;
  if (hours > 23 || minutes > 59 || seconds > 59) return null;
  return roundTime((hours * 3600 + minutes * 60 + seconds) / 86400);
}

function roundTime(fraction: number): number {
  // Sheets stores ~15 decimals; 6 survive a round trip without drift.
  return Math.round(fraction * 1_000_000) / 1_000_000;
}

export function normalizeNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const raw = normalizeText(value);
  // Vietnamese sheets write 2.200 as "two thousand two hundred" with a dot
  // separator, and 3.5 with a comma. Decide which is which before parsing.
  const lastDot = raw.lastIndexOf(".");
  const lastComma = raw.lastIndexOf(",");
  let text = raw;
  if (lastComma >= 0 && lastDot >= 0) {
    // Whichever separator comes last is the decimal point.
    text = lastComma > lastDot ? raw.replace(/\./g, "").replace(",", ".") : raw.replace(/,/g, "");
  } else if (lastComma >= 0) {
    // A single comma is a decimal separator only when it is followed by 1-2
    // digits (e.g. 3,5); otherwise it groups thousands (e.g. 2,200).
    text = /^\d+,\d{1,2}$/.test(raw) ? raw.replace(",", ".") : raw.replace(/,/g, "");
  } else if (lastDot >= 0) {
    const parts = raw.split(".");
    // "2.200" groups thousands (every trailing group is exactly 3 digits);
    // "3.25" or "3.14159" keeps the dot as the decimal point.
    const thousands = parts.length > 1 && parts.slice(1).every((group) => group.length === 3);
    text = thousands ? raw.replace(/\./g, "") : raw;
  }
  if (!text) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeInteger(value: unknown): number | null {
  const parsed = normalizeNumber(value);
  if (parsed == null) return null;
  const rounded = Math.round(parsed);
  return Number.isSafeInteger(rounded) ? rounded : null;
}

/** Minutes: accepts 60, "60", "1h", "1:30". Null only for blank cells. */
export function normalizeDurationMinutes(value: unknown): number | null {
  if (value == null || normalizeText(value) === "") return null;
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
  const text = normalizeText(value).toLowerCase();
  const hoursMatch = text.match(/^(\d+(?:[.,]\d+)?)\s*h$/);
  if (hoursMatch) return Math.round(Number(hoursMatch[1].replace(",", ".")) * 60);
  const clockMatch = text.match(/^(\d+):(\d{2})$/);
  if (clockMatch) return Number(clockMatch[1]) * 60 + Number(clockMatch[2]);
  const parsed = Number(text.replace(",", "."));
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
}

/** Monday=1 .. Sunday=7 in workbook convention ("Thứ Hai".."Chủ Nhật"). */
export function normalizeWeekday(value: unknown): number | null {
  const text = normalizeText(value).toLowerCase();
  const map: Record<string, number> = {
    "thứ hai": 1, "thu 2": 1, "t2": 1, monday: 1, mon: 1,
    "thứ ba": 2, "thu 3": 2, "t3": 2, tuesday: 2, tue: 2,
    "thứ tư": 3, "thu 4": 3, "t4": 3, wednesday: 3, wed: 3,
    "thứ năm": 4, "thu 5": 4, "t5": 4, thursday: 4, thu: 4,
    "thứ sáu": 5, "thu 6": 5, "t6": 5, friday: 5, fri: 5,
    "thứ bảy": 6, "thu 7": 6, "t7": 6, saturday: 6, sat: 6,
    "chủ nhật": 7, "chu nhat": 7, "cn": 7, sunday: 7, sun: 7,
  };
  const direct = map[text];
  if (direct) return direct;
  const digits = text.match(/(\d)/);
  if (digits) {
    const day = Number(digits[1]);
    if (day >= 1 && day <= 7) return day;
  }
  return null;
}

/** Distinguish "user cleared the cell" (null) from "cell unusable" (undefined). */
export function readOptionalCell(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  const text = normalizeText(value);
  return text === "" ? null : text;
}

/** Today in planner local time, ISO date. */
export function todayLocal(timezone: string = PLANNER_TIMEZONE): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function isSameDay(left: string | null | undefined, right: string | null | undefined): boolean {
  return (left ?? "") === (right ?? "") && left != null && left !== "";
}
