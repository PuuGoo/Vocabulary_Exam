"use client";

import { useEffect, useState } from "react";
import { cx } from "@/components/ui";
import { toast } from "@/components/Toast";

type SetSummary = { id: number; name: string; type: string; count: number };
type Word = {
  id: number;
  meaning: string;
  v1?: string | null;
  v2?: string | null;
  v3?: string | null;
  term?: string | null;
  example?: string | null;
  wtype?: string | null;
};
type SetDetail = SetSummary & { words: Word[] };

export default function AdminSetsPage() {
  const [sets, setSets] = useState<SetSummary[] | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<"ielts_vocab" | "irregular_verb">("ielts_vocab");
  const [detail, setDetail] = useState<SetDetail | null>(null);
  const [showAddWord, setShowAddWord] = useState(false);
  const [wForm, setWForm] = useState({ meaning: "", v1: "", v2: "", v3: "", term: "", example: "", wtype: "" });

  async function loadSets() {
    const res = await fetch("/api/sets");
    const data = await res.json();
    setSets(data.sets || []);
  }

  useEffect(() => {
    loadSets();
  }, []);

  async function createSet() {
    if (!newName.trim()) return toast("Vui lòng nhập tên bộ từ vựng.");
    const res = await fetch("/api/sets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim(), type: newType }),
    });
    if (!res.ok) return toast("Không thể tạo bộ từ vựng.");
    toast("Đã tạo bộ từ vựng!");
    setNewName("");
    setShowNewForm(false);
    loadSets();
  }

  async function deleteSet(id: number) {
    if (!confirm("Xoá bộ từ vựng này? Hành động không thể hoàn tác.")) return;
    await fetch(`/api/sets/${id}`, { method: "DELETE" });
    toast("Đã xoá bộ từ vựng.");
    if (detail?.id === id) setDetail(null);
    loadSets();
  }

  async function openDetail(id: number) {
    const res = await fetch(`/api/sets/${id}`);
    const data = await res.json();
    setDetail(data.set);
    setShowAddWord(false);
  }

  async function saveWord() {
    if (!detail) return;
    const isVerb = detail.type === "irregular_verb";
    const body = isVerb
      ? { meaning: wForm.meaning, v1: wForm.v1, v2: wForm.v2, v3: wForm.v3 }
      : { term: wForm.term, meaning: wForm.meaning, example: wForm.example, wtype: wForm.wtype };
    const res = await fetch(`/api/admin/sets/${detail.id}/words`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return toast(err.error || "Không thể thêm từ.");
    }
    toast("Đã thêm từ.");
    setWForm({ meaning: "", v1: "", v2: "", v3: "", term: "", example: "", wtype: "" });
    setShowAddWord(false);
    openDetail(detail.id);
    loadSets();
  }

  async function deleteWord(wordId: number) {
    if (!detail) return;
    await fetch(`/api/admin/words/${wordId}`, { method: "DELETE" });
    openDetail(detail.id);
    loadSets();
  }

  return (
    <div className={cx.panel}>
      <h2 className={cx.h2}>Các bộ từ vựng</h2>
      <div className={cx.desc}>
        Quản lý các bộ từ vựng dùng để kiểm tra. Bạn có thể thêm bộ mới, hoặc nhập nhanh bằng CSV/Excel ở tab
        &quot;Nhập dữ liệu&quot;.
      </div>

      <div className="mb-4">
        <button className={`${cx.btn} ${cx.btnGold}`} onClick={() => setShowNewForm((v) => !v)}>
          + Tạo bộ từ vựng mới
        </button>
      </div>

      {showNewForm && (
        <div className="border border-line rounded-[10px] p-4 mb-4 bg-white">
          <label className={cx.label}>Tên bộ từ vựng</label>
          <input
            className={cx.input}
            placeholder="VD: Từ vựng chủ đề Môi trường"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <label className={cx.label}>Loại bài kiểm tra</label>
          <select
            className={cx.input}
            value={newType}
            onChange={(e) => setNewType(e.target.value as "ielts_vocab" | "irregular_verb")}
          >
            <option value="ielts_vocab">Từ vựng IELTS (từ — nghĩa — ví dụ)</option>
            <option value="irregular_verb">Động từ bất quy tắc (nghĩa — V1 — V2 — V3)</option>
          </select>
          <div className="flex gap-2.5">
            <button className={`${cx.btn} ${cx.btnGold}`} onClick={createSet}>
              Tạo bộ từ (rỗng)
            </button>
            <button className={`${cx.btn} ${cx.btnGhost}`} onClick={() => setShowNewForm(false)}>
              Huỷ
            </button>
          </div>
        </div>
      )}

      {sets === null ? (
        <div className={cx.empty}>Đang tải...</div>
      ) : sets.length === 0 ? (
        <div className={cx.empty}>Chưa có bộ từ vựng nào.</div>
      ) : (
        sets.map((s) => (
          <div className={cx.setcard} key={s.id}>
            <div>
              <div className="font-semibold">{s.name}</div>
              <div className="text-[0.78rem] text-muted mt-0.5">
                {s.type === "irregular_verb" ? "Động từ bất quy tắc" : "Từ vựng IELTS"} · {s.count} mục
              </div>
            </div>
            <div className="flex gap-2.5">
              <button className={`${cx.btn} ${cx.btnGhost}`} onClick={() => openDetail(s.id)}>
                Xem / Sửa
              </button>
              <button className={`${cx.btn} ${cx.btnDanger}`} onClick={() => deleteSet(s.id)}>
                Xoá
              </button>
            </div>
          </div>
        ))
      )}

      {detail && (
        <div className="border border-line rounded-[10px] p-5 mt-4 bg-white">
          <h2 className={cx.h2}>{detail.name}</h2>
          <div className={cx.desc}>
            {detail.type === "irregular_verb" ? "Động từ bất quy tắc" : "Từ vựng IELTS"} · {detail.words.length} mục
          </div>
          <div className="flex gap-2.5 mb-3">
            <button className={`${cx.btn} ${cx.btnGold}`} onClick={() => setShowAddWord((v) => !v)}>
              + Thêm từ thủ công
            </button>
            <button className={`${cx.btn} ${cx.btnGhost}`} onClick={() => setDetail(null)}>
              Đóng
            </button>
          </div>

          {showAddWord && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-3">
              {detail.type === "irregular_verb" ? (
                <>
                  <div>
                    <label className={cx.label}>Nghĩa (tiếng Việt)</label>
                    <input className={cx.input} value={wForm.meaning} onChange={(e) => setWForm({ ...wForm, meaning: e.target.value })} />
                  </div>
                  <div>
                    <label className={cx.label}>V1</label>
                    <input className={cx.input} value={wForm.v1} onChange={(e) => setWForm({ ...wForm, v1: e.target.value })} />
                  </div>
                  <div>
                    <label className={cx.label}>V2</label>
                    <input className={cx.input} value={wForm.v2} onChange={(e) => setWForm({ ...wForm, v2: e.target.value })} />
                  </div>
                  <div>
                    <label className={cx.label}>V3</label>
                    <input className={cx.input} value={wForm.v3} onChange={(e) => setWForm({ ...wForm, v3: e.target.value })} />
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className={cx.label}>Từ / cụm từ tiếng Anh</label>
                    <input className={cx.input} value={wForm.term} onChange={(e) => setWForm({ ...wForm, term: e.target.value })} />
                  </div>
                  <div>
                    <label className={cx.label}>Nghĩa (tiếng Việt)</label>
                    <input className={cx.input} value={wForm.meaning} onChange={(e) => setWForm({ ...wForm, meaning: e.target.value })} />
                  </div>
                  <div>
                    <label className={cx.label}>Ví dụ (không bắt buộc)</label>
                    <input className={cx.input} value={wForm.example} onChange={(e) => setWForm({ ...wForm, example: e.target.value })} />
                  </div>
                  <div>
                    <label className={cx.label}>Loại từ (không bắt buộc)</label>
                    <input className={cx.input} placeholder="noun / verb / adj..." value={wForm.wtype} onChange={(e) => setWForm({ ...wForm, wtype: e.target.value })} />
                  </div>
                </>
              )}
              <div className="md:col-span-2">
                <button className={`${cx.btn} ${cx.btnGold}`} onClick={saveWord}>
                  Lưu từ
                </button>
              </div>
            </div>
          )}

          <div className="max-h-[360px] overflow-auto">
            <table className={cx.table}>
              <thead>
                <tr>
                  {detail.type === "irregular_verb" ? (
                    <>
                      <th className={cx.th}>Nghĩa</th>
                      <th className={cx.th}>V1</th>
                      <th className={cx.th}>V2</th>
                      <th className={cx.th}>V3</th>
                      <th className={cx.th}></th>
                    </>
                  ) : (
                    <>
                      <th className={cx.th}>Từ</th>
                      <th className={cx.th}>Nghĩa</th>
                      <th className={cx.th}>Ví dụ</th>
                      <th className={cx.th}>Loại từ</th>
                      <th className={cx.th}></th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {detail.words.map((w) => (
                  <tr key={w.id}>
                    {detail.type === "irregular_verb" ? (
                      <>
                        <td className={cx.td}>{w.meaning}</td>
                        <td className={cx.td}>{w.v1}</td>
                        <td className={cx.td}>{w.v2}</td>
                        <td className={cx.td}>{w.v3}</td>
                      </>
                    ) : (
                      <>
                        <td className={cx.td}>{w.term}</td>
                        <td className={cx.td}>{w.meaning}</td>
                        <td className={cx.td}>{w.example}</td>
                        <td className={cx.td}>{w.wtype}</td>
                      </>
                    )}
                    <td className={cx.td}>
                      <button className={`${cx.btn} ${cx.btnDanger} !px-2 !py-1`} onClick={() => deleteWord(w.id)}>
                        Xoá
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
