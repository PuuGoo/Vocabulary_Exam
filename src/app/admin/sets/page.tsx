"use client";

import { useEffect, useState } from "react";
import { cx } from "@/components/ui";
import { toast } from "@/components/Toast";
import Modal from "@/components/Modal";

type SetSummary = { id: number; name: string; type: string; count: number; classId: number | null; className: string | null };
type Word = {
  id: number;
  meaning: string;
  v1?: string | null;
  v2?: string | null;
  v3?: string | null;
  term?: string | null;
  example?: string | null;
  wtype?: string | null;
  ipa?: string | null;
};
type SetDetail = SetSummary & { words: Word[] };
type ClassOpt = { id: number; name: string };

export default function AdminSetsPage() {
  const [sets, setSets] = useState<SetSummary[] | null>(null);
  const [classesOpt, setClassesOpt] = useState<ClassOpt[]>([]);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<"ielts_vocab" | "irregular_verb">("ielts_vocab");
  const [newClassId, setNewClassId] = useState<string>("");
  const [detail, setDetail] = useState<SetDetail | null>(null);
  const [showAddWord, setShowAddWord] = useState(false);
  const [wForm, setWForm] = useState({ meaning: "", v1: "", v2: "", v3: "", term: "", example: "", wtype: "", ipa: "" });
  const [editingWordId, setEditingWordId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ meaning: "", v1: "", v2: "", v3: "", term: "", example: "", wtype: "", ipa: "" });
  const [fetchingIpaId, setFetchingIpaId] = useState<number | null>(null);
  const [bulkIpaLoading, setBulkIpaLoading] = useState(false);

  async function loadSets() {
    const res = await fetch("/api/sets");
    const data = await res.json();
    setSets(data.sets || []);
  }
  async function loadClasses() {
    const res = await fetch("/api/admin/classes");
    if (!res.ok) return;
    const data = await res.json();
    setClassesOpt((data.classes || []).map((c: { id: number; name: string }) => ({ id: c.id, name: c.name })));
  }

  useEffect(() => {
    loadSets();
    loadClasses();
  }, []);

  async function createSet() {
    if (!newName.trim()) return toast("Vui lòng nhập tên bộ từ vựng.");
    const res = await fetch("/api/sets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim(), type: newType, classId: newClassId ? Number(newClassId) : null }),
    });
    if (!res.ok) return toast("Không thể tạo bộ từ vựng.");
    toast("Đã tạo bộ từ vựng!");
    setNewName("");
    setNewClassId("");
    setShowNewForm(false);
    loadSets();
  }

  async function changeSetClass(setId: number, classId: string) {
    const res = await fetch(`/api/sets/${setId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ classId: classId ? Number(classId) : null }),
    });
    if (!res.ok) return toast("Không thể cập nhật lớp.");
    toast("Đã cập nhật phạm vi hiển thị.");
    loadSets();
    if (detail?.id === setId) openDetail(setId);
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
    setEditingWordId(null);
  }

  async function saveWord() {
    if (!detail) return;
    const isVerb = detail.type === "irregular_verb";
    const body = isVerb
      ? { meaning: wForm.meaning, v1: wForm.v1, v2: wForm.v2, v3: wForm.v3, ipa: wForm.ipa }
      : { term: wForm.term, meaning: wForm.meaning, example: wForm.example, wtype: wForm.wtype, ipa: wForm.ipa };
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
    setWForm({ meaning: "", v1: "", v2: "", v3: "", term: "", example: "", wtype: "", ipa: "" });
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

  function startEditWord(w: Word) {
    setEditingWordId(w.id);
    setEditForm({
      meaning: w.meaning || "",
      v1: w.v1 || "",
      v2: w.v2 || "",
      v3: w.v3 || "",
      term: w.term || "",
      example: w.example || "",
      wtype: w.wtype || "",
      ipa: w.ipa || "",
    });
  }

  function cancelEditWord() {
    setEditingWordId(null);
  }

  async function fetchIpaForWord(wordId: number) {
    setFetchingIpaId(wordId);
    const res = await fetch(`/api/admin/words/${wordId}/fetch-ipa`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setFetchingIpaId(null);
    if (!res.ok) return toast(data.error || "Không lấy được phiên âm.");
    toast(`Đã lấy phiên âm: ${data.ipa}`);
    if (detail) openDetail(detail.id);
  }

  async function fetchIpaForSet(force: boolean) {
    if (!detail) return;
    setBulkIpaLoading(true);
    const res = await fetch(`/api/admin/sets/${detail.id}/fetch-ipa`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ force }),
    });
    const data = await res.json().catch(() => ({}));
    setBulkIpaLoading(false);
    if (!res.ok) return toast(data.error || "Không thể lấy phiên âm cho cả bộ.");
    if (data.errors && data.errors.length > 0) {
      toast(`Đã lấy được ${data.updated}/${data.total} từ trước khi dừng: ${data.errors[0]}`);
    } else {
      toast(`Đã lấy phiên âm cho ${data.updated}/${data.total} từ.`);
    }
    openDetail(detail.id);
  }

  async function saveEditWord() {
    if (!detail || editingWordId === null) return;
    const isVerb = detail.type === "irregular_verb";
    const body = isVerb
      ? { meaning: editForm.meaning, v1: editForm.v1, v2: editForm.v2, v3: editForm.v3, ipa: editForm.ipa }
      : { term: editForm.term, meaning: editForm.meaning, example: editForm.example, wtype: editForm.wtype, ipa: editForm.ipa };
    const res = await fetch(`/api/admin/words/${editingWordId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return toast(err.error || "Không thể lưu thay đổi.");
    }
    toast("Đã lưu thay đổi.");
    setEditingWordId(null);
    openDetail(detail.id);
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
          <label className={cx.label}>Phạm vi hiển thị</label>
          <select className={cx.input} value={newClassId} onChange={(e) => setNewClassId(e.target.value)}>
            <option value="">Công khai — mọi học sinh đều thấy</option>
            {classesOpt.map((c) => (
              <option key={c.id} value={c.id}>
                Chỉ lớp: {c.name}
              </option>
            ))}
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
                {s.type === "irregular_verb" ? "Động từ bất quy tắc" : "Từ vựng IELTS"} · {s.count} mục ·{" "}
                {s.className ? <span className={cx.badgeGold}>Lớp: {s.className}</span> : <span className={cx.badgeBlue}>Công khai</span>}
              </div>
            </div>
            <div className="flex gap-2.5 flex-wrap">
              <button className={`${cx.btn} ${cx.btnGhost}`} onClick={() => openDetail(s.id)}>
                Xem / Sửa
              </button>
              <a
                href={`/learn/${s.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className={`${cx.btn} ${cx.btnGhost}`}
              >
                📖 Xem thử học bài
              </a>
              <a
                href={`/quiz/${s.id}?mode=fill`}
                target="_blank"
                rel="noopener noreferrer"
                className={`${cx.btn} ${cx.btnGhost}`}
              >
                🧪 Xem thử {s.type === "ielts_vocab" ? "(điền từ)" : "bài kiểm tra"}
              </a>
              {s.type === "ielts_vocab" && (
                <a
                  href={`/quiz/${s.id}?mode=mc`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`${cx.btn} ${cx.btnGhost}`}
                >
                  🧪 Xem thử (trắc nghiệm)
                </a>
              )}
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
          <div className="mb-3 max-w-xs">
            <label className={cx.label}>Phạm vi hiển thị</label>
            <select
              className={cx.input}
              value={detail.classId ?? ""}
              onChange={(e) => changeSetClass(detail.id, e.target.value)}
            >
              <option value="">Công khai — mọi học sinh đều thấy</option>
              {classesOpt.map((c) => (
                <option key={c.id} value={c.id}>
                  Chỉ lớp: {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-2.5 mb-3 flex-wrap">
            <button className={`${cx.btn} ${cx.btnGold}`} onClick={() => setShowAddWord((v) => !v)}>
              + Thêm từ thủ công
            </button>
            <button className={`${cx.btn} ${cx.btnGhost}`} disabled={bulkIpaLoading} onClick={() => fetchIpaForSet(false)}>
              {bulkIpaLoading ? "Đang lấy phiên âm..." : "🔤 Lấy phiên âm còn thiếu (Gemini)"}
            </button>
            <button className={`${cx.btn} ${cx.btnGhost}`} disabled={bulkIpaLoading} onClick={() => fetchIpaForSet(true)}>
              🔤 Lấy lại phiên âm cho tất cả
            </button>
            <button className={`${cx.btn} ${cx.btnGhost}`} onClick={() => setDetail(null)}>
              Đóng
            </button>
          </div>

          {showAddWord && (
            <Modal
              title="Thêm từ mới"
              onClose={() => {
                setShowAddWord(false);
                setWForm({ meaning: "", v1: "", v2: "", v3: "", term: "", example: "", wtype: "", ipa: "" });
              }}
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                    <div>
                      <label className={cx.label}>Phiên âm IPA (không bắt buộc)</label>
                      <input className={cx.input} placeholder="/əˈraɪz/" value={wForm.ipa} onChange={(e) => setWForm({ ...wForm, ipa: e.target.value })} />
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
                    <div>
                      <label className={cx.label}>Phiên âm IPA (không bắt buộc)</label>
                      <input className={cx.input} placeholder="/wɜːd/" value={wForm.ipa} onChange={(e) => setWForm({ ...wForm, ipa: e.target.value })} />
                    </div>
                  </>
                )}
                <div className="md:col-span-2">
                  <button className={`${cx.btn} ${cx.btnGold}`} onClick={saveWord}>
                    Lưu từ
                  </button>
                </div>
              </div>
            </Modal>
          )}

          <div style={{ maxHeight: 360, overflow: "auto" }}>
            <table className={cx.table}>
              <thead>
                <tr>
                  {detail.type === "irregular_verb" ? (
                    <>
                      <th className={cx.th}>Nghĩa</th>
                      <th className={cx.th}>V1</th>
                      <th className={cx.th}>V2</th>
                      <th className={cx.th}>V3</th>
                      <th className={cx.th}>Phiên âm</th>
                      <th className={cx.th}></th>
                    </>
                  ) : (
                    <>
                      <th className={cx.th}>Từ</th>
                      <th className={cx.th}>Nghĩa</th>
                      <th className={cx.th}>Ví dụ</th>
                      <th className={cx.th}>Loại từ</th>
                      <th className={cx.th}>Phiên âm</th>
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
                      {w.ipa ? (
                        <span className="text-golddark">{w.ipa}</span>
                      ) : (
                        <button
                          className={`${cx.btn} ${cx.btnGhost} !px-2 !py-1`}
                          disabled={fetchingIpaId === w.id}
                          onClick={() => fetchIpaForWord(w.id)}
                        >
                          {fetchingIpaId === w.id ? "..." : "🔤 Lấy"}
                        </button>
                      )}
                    </td>
                    <td className={cx.td}>
                      <div className="flex gap-1.5">
                        <button className={`${cx.btn} ${cx.btnGhost} !px-2 !py-1`} onClick={() => startEditWord(w)}>
                          Sửa
                        </button>
                        <button className={`${cx.btn} ${cx.btnDanger} !px-2 !py-1`} onClick={() => deleteWord(w.id)}>
                          Xoá
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {editingWordId !== null && (
            <Modal title="Sửa từ" onClose={cancelEditWord}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {detail.type === "irregular_verb" ? (
                  <>
                    <div>
                      <label className={cx.label}>Nghĩa</label>
                      <input className={`${cx.input} !mb-0`} value={editForm.meaning} onChange={(e) => setEditForm({ ...editForm, meaning: e.target.value })} />
                    </div>
                    <div>
                      <label className={cx.label}>V1</label>
                      <input className={`${cx.input} !mb-0`} value={editForm.v1} onChange={(e) => setEditForm({ ...editForm, v1: e.target.value })} />
                    </div>
                    <div>
                      <label className={cx.label}>V2</label>
                      <input className={`${cx.input} !mb-0`} value={editForm.v2} onChange={(e) => setEditForm({ ...editForm, v2: e.target.value })} />
                    </div>
                    <div>
                      <label className={cx.label}>V3</label>
                      <input className={`${cx.input} !mb-0`} value={editForm.v3} onChange={(e) => setEditForm({ ...editForm, v3: e.target.value })} />
                    </div>
                    <div>
                      <label className={cx.label}>Phiên âm IPA</label>
                      <input className={`${cx.input} !mb-0`} value={editForm.ipa} onChange={(e) => setEditForm({ ...editForm, ipa: e.target.value })} />
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <label className={cx.label}>Từ</label>
                      <input className={`${cx.input} !mb-0`} value={editForm.term} onChange={(e) => setEditForm({ ...editForm, term: e.target.value })} />
                    </div>
                    <div>
                      <label className={cx.label}>Nghĩa</label>
                      <input className={`${cx.input} !mb-0`} value={editForm.meaning} onChange={(e) => setEditForm({ ...editForm, meaning: e.target.value })} />
                    </div>
                    <div>
                      <label className={cx.label}>Ví dụ</label>
                      <input className={`${cx.input} !mb-0`} value={editForm.example} onChange={(e) => setEditForm({ ...editForm, example: e.target.value })} />
                    </div>
                    <div>
                      <label className={cx.label}>Loại từ</label>
                      <input className={`${cx.input} !mb-0`} value={editForm.wtype} onChange={(e) => setEditForm({ ...editForm, wtype: e.target.value })} />
                    </div>
                    <div>
                      <label className={cx.label}>Phiên âm IPA</label>
                      <input className={`${cx.input} !mb-0`} value={editForm.ipa} onChange={(e) => setEditForm({ ...editForm, ipa: e.target.value })} />
                    </div>
                  </>
                )}
                <div className="md:col-span-2 flex gap-2">
                  <button className={`${cx.btn} ${cx.btnGold} !px-3 !py-1.5`} onClick={saveEditWord}>
                    Lưu
                  </button>
                  <button className={`${cx.btn} ${cx.btnGhost} !px-3 !py-1.5`} onClick={cancelEditWord}>
                    Huỷ
                  </button>
                </div>
              </div>
            </Modal>
          )}
        </div>
      )}
    </div>
  );
}
