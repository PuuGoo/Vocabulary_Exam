import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { db } from "@/db";
import { vocabSets, words } from "@/db/schema";
import { getSession } from "@/lib/auth";

export const runtime = "nodejs";

type Row = Record<string, string>;

function normalizeRow(raw: Record<string, unknown>): Row {
  const out: Row = {};
  for (const [k, v] of Object.entries(raw)) {
    out[k.trim().toLowerCase()] = String(v ?? "").trim();
  }
  return out;
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const form = await req.formData();
  const file = form.get("file") as File | null;
  const target = String(form.get("target") || "");
  const newSetName = String(form.get("newSetName") || "").trim();

  if (!file) return NextResponse.json({ error: "Vui lòng chọn file để nhập." }, { status: 400 });

  const filename = file.name.toLowerCase();
  let rows: Row[] = [];

  try {
    if (filename.endsWith(".csv")) {
      const text = await file.text();
      const parsed = Papa.parse<Record<string, unknown>>(text, { header: true, skipEmptyLines: true });
      rows = parsed.data.map(normalizeRow);
    } else if (filename.endsWith(".xlsx") || filename.endsWith(".xls")) {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
      rows = raw.map(normalizeRow);
    } else {
      return NextResponse.json({ error: "Chỉ hỗ trợ file .csv, .xlsx, .xls" }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "Không đọc được nội dung file. Vui lòng kiểm tra định dạng." }, { status: 400 });
  }

  rows = rows.filter((r) => Object.values(r).some((v) => v !== ""));
  if (rows.length === 0) {
    return NextResponse.json({ error: "File không có dữ liệu hợp lệ." }, { status: 400 });
  }

  let setId: number;
  let setType: string;

  if (target === "__new_vocab" || target === "__new_verb") {
    setType = target === "__new_verb" ? "irregular_verb" : "ielts_vocab";
    const name = newSetName || (setType === "irregular_verb" ? "Bộ động từ mới" : "Bộ từ vựng mới");
    const [set] = await db.insert(vocabSets).values({ name, type: setType, createdBy: session.userId }).returning();
    setId = set.id;
  } else {
    const setIdNum = Number(target);
    const set = await db.query.vocabSets.findFirst({ where: eq(vocabSets.id, setIdNum) });
    if (!set) return NextResponse.json({ error: "Bộ từ vựng đích không tồn tại." }, { status: 400 });
    setId = set.id;
    setType = set.type;
  }

  let added = 0;
  const toInsert: (typeof words.$inferInsert)[] = [];
  for (const r of rows) {
    if (setType === "irregular_verb") {
      if (r.meaning && r.v1 && r.v2 && r.v3) {
        toInsert.push({ setId, meaning: r.meaning, v1: r.v1, v2: r.v2, v3: r.v3 });
        added++;
      }
    } else {
      if (r.term && r.meaning) {
        toInsert.push({
          setId,
          meaning: r.meaning,
          term: r.term,
          example: r.example || "",
          wtype: r.wtype || r.type || "",
        });
        added++;
      }
    }
  }
  if (toInsert.length > 0) {
    await db.insert(words).values(toInsert);
  }

  return NextResponse.json({ setId, added, total: rows.length });
}
