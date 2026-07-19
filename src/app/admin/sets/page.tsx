"use client";

import { useEffect, useMemo, useState } from "react";
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

function normalizeSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .trim();
}

export default function AdminSetsPage() {
  const [sets, setSets] = useState<SetSummary[] | null>(null);
  const [classesOpt, setClassesOpt] = useState<ClassOpt[]>([]);
  const [showNewForm, setShowNewForm] = useState(false);
  const [creatingSet, setCreatingSet] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<"ielts_vocab" | "irregular_verb">("ielts_vocab");
  const [newClassId, setNewClassId] = useState<string>("");
  const [detail, setDetail] = useState<SetDetail | null>(null);
  const [editSetName, setEditSetName] = useState("");
  const [savingSetName, setSavingSetName] = useState(false);
  const [showAddWord, setShowAddWord] = useState(false);
  const [wForm, setWForm] = useState({ meaning: "", v1: "", v2: "", v3: "", term: "", example: "", wtype: "", ipa: "" });
  const [editingWordId, setEditingWordId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ meaning: "", v1: "", v2: "", v3: "", term: "", example: "", wtype: "", ipa: "" });
  const [fetchingIpaId, setFetchingIpaId] = useState<number | null>(null);
  const [bulkIpaLoading, setBulkIpaLoading] = useState(false);
  const [savingClass, setSavingClass] = useState(false);
  const [openingDetailId, setOpeningDetailId] = useState<number | null>(null);

  const filteredSets = useMemo(() => {
    if (!sets) return [];
    const query = normalizeSearch(searchQuery);
    if (!query) return sets;
    return sets.filter((set) =>
      normalizeSearch(`${set.name} ${set.className || "Công khai"} ${set.type === "irregular_verb" ? "Động từ bất quy tắc" : "Từ vựng IELTS"}`).includes(query)
    );
  }, [sets, searchQuery]);

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
    setCreatingSet(true);
    try {
      const res = await fetch("/api/sets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), type: newType, classId: newClassId ? Number(newClassId) : null }),
      });
      if (!res.ok) return toast("Không thể tạo bộ từ vựng.");
      toast("Đã tạo bộ từ vựng!");
      closeNewForm();
      loadSets();
    } catch {
      toast("Không thể kết nối để tạo bộ từ vựng.");
    } finally {
      setCreatingSet(false);
    }
  }

  function closeNewForm() {
    setShowNewForm(false);
    setNewName("");
    setNewType("ielts_vocab");
    setNewClassId("");
  }

  async function changeSetClass(setId: number, classId: string) {
    const nextClassId = classId ? Number(classId) : null;
    setSavingClass(true);
    try {
      const res = await fetch(`/api/sets/${setId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ classId: nextClassId }),
      });
      if (!res.ok) return toast("Không thể cập nhật lớp.");
      setDetail((current) => current?.id === setId ? {
        ...current,
        classId: nextClassId,
        className: classesOpt.find((item) => item.id === nextClassId)?.name || null,
      } : current);
      toast("Đã cập nhật phạm vi hiển thị.");
      loadSets();
    } catch {
      toast("Không thể kết nối để cập nhật lớp.");
    } finally {
      setSavingClass(false);
    }
  }

  async function deleteSet(id: number) {
    if (!confirm("Xoá bộ từ vựng này? Hành động không thể hoàn tác.")) return;
    try {
      const res = await fetch(`/api/sets/${id}`, { method: "DELETE" });
      if (!res.ok) return toast("Không thể xoá bộ từ vựng.");
      toast("Đã xoá bộ từ vựng.");
      if (detail?.id === id) setDetail(null);
      loadSets();
    } catch {
      toast("Không thể kết nối để xoá bộ từ vựng.");
    }
  }

  async function openDetail(id: number) {
    setOpeningDetailId(id);
    try {
      const res = await fetch(`/api/sets/${id}`);
      if (!res.ok) return toast("Không thể mở bộ từ vựng.");
      const data = await res.json();
      setDetail(data.set);
      setEditSetName(data.set.name);
      setShowAddWord(false);
      setEditingWordId(null);
    } catch {
      toast("Không thể kết nối để mở bộ từ vựng.");
    } finally {
      setOpeningDetailId(null);
    }
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
    const target = detail.words.find((word) => word.id === wordId);
    const label = target?.term || target?.v1 || target?.meaning || "từ này";
    if (!confirm(`Xoá “${label}” khỏi bộ từ?`)) return;
    try {
      const res = await fetch(`/api/admin/words/${wordId}`, { method: "DELETE" });
      if (!res.ok) return toast("Không thể xoá từ.");
      setDetail((current) => current ? { ...current, words: current.words.filter((word) => word.id !== wordId) } : current);
      toast("Đã xoá từ.");
      loadSets();
    } catch {
      toast("Không thể kết nối để xoá từ.");
    }
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

  function closeDetail() {
    // A child editor handles Escape/overlay first; keep the parent open behind it.
    if (showAddWord || editingWordId !== null) return;
    if (detail && editSetName.trim() !== detail.name && !confirm("Tên bộ từ chưa được lưu. Bạn có muốn đóng và bỏ thay đổi?")) return;
    setDetail(null);
  }

  async function saveSetName() {
    if (!detail || savingSetName) return;
    const name = editSetName.trim();
    if (!name) return toast("Tên bộ từ vựng không được để trống.");
    if (name === detail.name) return;

    setSavingSetName(true);
    try {
      const res = await fetch(`/api/sets/${detail.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return toast(data.error || "Không thể đổi tên bộ từ vựng.");
      const savedName = data.set?.name || name;
      setDetail((current) => (current ? { ...current, name: savedName } : current));
      setEditSetName(savedName);
      loadSets();
      toast("Đã đổi tên bộ từ vựng.");
    } catch {
      toast("Không thể kết nối để đổi tên bộ từ vựng.");
    } finally {
      setSavingSetName(false);
    }
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

      <div className="mb-4 flex items-center justify-between gap-3 flex-wrap">
        <div className="relative min-w-[240px] flex-1 max-w-md">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true">⌕</span>
          <input
            type="search"
            className={`${cx.input} !mb-0 !pl-9`}
            placeholder="Tìm theo tên bộ, loại hoặc lớp..."
            aria-label="Tìm bộ từ vựng"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <button className={`${cx.btn} ${cx.btnGold}`} onClick={() => setShowNewForm(true)}>
          + Tạo bộ từ vựng mới
        </button>
      </div>

      {showNewForm && (
        <Modal title="Tạo bộ từ vựng mới" onClose={closeNewForm} closeOnBackdrop={false}>
          <label className={cx.label}>Tên bộ từ vựng</label>
          <input
            className={cx.input}
            placeholder="VD: Từ vựng chủ đề Môi trường"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void createSet();
            }}
            autoFocus
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
            <button className={`${cx.btn} ${cx.btnGold}`} disabled={creatingSet} onClick={createSet}>
              {creatingSet ? "Đang tạo..." : "Tạo bộ từ"}
            </button>
            <button className={`${cx.btn} ${cx.btnGhost}`} disabled={creatingSet} onClick={closeNewForm}>
              Huỷ
            </button>
          </div>
        </Modal>
      )}

      {sets === null ? (
        <div className={cx.empty}>Đang tải...</div>
      ) : sets.length === 0 ? (
        <div className={cx.empty}>Chưa có bộ từ vựng nào.</div>
      ) : filteredSets.length === 0 ? (
        <div className={cx.empty}>
          Không tìm thấy bộ từ phù hợp với “{searchQuery}”.
          <div className="mt-3">
            <button className={`${cx.btn} ${cx.btnGhost} !px-3 !py-1.5`} onClick={() => setSearchQuery("")}>Xoá tìm kiếm</button>
          </div>
        </div>
      ) : (
        filteredSets.map((s) => (
          <div className={cx.setcard} key={s.id}>
            <div>
              <div className="font-semibold">{s.name}</div>
              <div className="text-[0.78rem] text-muted mt-0.5">
                {s.type === "irregular_verb" ? "Động từ bất quy tắc" : "Từ vựng IELTS"} · {s.count} mục ·{" "}
                {s.className ? <span className={cx.badgeGold}>Lớp: {s.className}</span> : <span className={cx.badgeBlue}>Công khai</span>}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                className={`${cx.btn} ${cx.btnGold}`}
                disabled={openingDetailId !== null}
                onClick={() => openDetail(s.id)}
              >
                {openingDetailId === s.id ? "Đang mở..." : "Quản lý bộ từ"}
              </button>
              <details className="relative">
                <summary className={`${cx.btn} ${cx.btnGhost} list-none select-none`}>Xem thử ▾</summary>
                <div className="absolute right-0 top-[calc(100%+6px)] z-20 min-w-56 rounded-lg border border-line bg-white p-1.5 shadow-lg">
                  <a
                    href={`/learn/${s.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block rounded-md px-3 py-2 text-[0.84rem] hover:bg-goldpale"
                  >
                    📖 Học bài
                  </a>
                  <a
                    href={`/quiz/${s.id}?mode=fill`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block rounded-md px-3 py-2 text-[0.84rem] hover:bg-goldpale"
                  >
                    ✍️ {s.type === "ielts_vocab" ? "Điền từ tiếng Anh" : "Điền V1/V2/V3"}
                  </a>
                  {s.type === "ielts_vocab" && (
                    <a
                      href={`/quiz/${s.id}?mode=mc`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block rounded-md px-3 py-2 text-[0.84rem] hover:bg-goldpale"
                    >
                      ☑️ Trắc nghiệm
                    </a>
                  )}
                </div>
              </details>
              <button
                className="px-2 py-2 text-[0.8rem] text-bad hover:underline"
                onClick={() => deleteSet(s.id)}
              >
                Xoá
              </button>
            </div>
          </div>
        ))
      )}

      {detail && (
        <Modal title={detail.name} onClose={closeDetail} wide>
          <div>
          <div className={cx.desc}>
            {detail.type === "irregular_verb" ? "Động từ bất quy tắc" : "Từ vựng IELTS"} · {detail.words.length} mục
          </div>
          <div className="mb-4 grid grid-cols-1 items-end gap-4 md:grid-cols-[minmax(0,1fr)_320px]">
            <div>
              <label className={cx.label} htmlFor="edit-set-name">Tên bộ từ vựng</label>
              <div className="flex gap-2">
                <input
                  id="edit-set-name"
                  className={`${cx.input} !mb-0`}
                  maxLength={256}
                  value={editSetName}
                  onChange={(e) => setEditSetName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void saveSetName();
                  }}
                />
                <button
                  className={`${cx.btn} ${cx.btnGold} shrink-0`}
                  disabled={savingSetName || !editSetName.trim() || editSetName.trim() === detail.name}
                  onClick={saveSetName}
                >
                  {savingSetName ? "Đang lưu..." : "Lưu tên"}
                </button>
              </div>
              {editSetName.trim() !== detail.name && (
                <div className="mt-1.5 flex items-center gap-2 text-[0.75rem] text-golddark">
                  <span>● Tên đã thay đổi nhưng chưa lưu</span>
                  <button type="button" className="underline hover:text-ink" onClick={() => setEditSetName(detail.name)}>
                    Hoàn tác
                  </button>
                </div>
              )}
            </div>
            <div>
              <label className={cx.label}>Phạm vi hiển thị</label>
              <select
                className={`${cx.input} !mb-0`}
                disabled={savingClass}
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
              <div className={`mt-1.5 text-[0.75rem] ${savingClass ? "text-golddark" : "text-muted"}`}>
                {savingClass ? "Đang lưu phạm vi..." : "Thay đổi được lưu tự động"}
              </div>
            </div>
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
              closeOnBackdrop={false}
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

          {detail.words.length === 0 ? (
            <div className="rounded-lg border border-dashed border-line bg-[#fffefb] px-4 py-8 text-center text-[0.88rem] text-muted">
              Bộ này chưa có từ nào. Chọn “Thêm từ thủ công” để bắt đầu.
            </div>
          ) : (
          <div className="max-h-[52vh] overflow-auto rounded-lg border border-line [&_thead]:sticky [&_thead]:top-0 [&_thead]:z-10 [&_thead]:bg-white">
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
                  <tr key={w.id} className="hover:bg-goldpale/30">
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
          )}

          {editingWordId !== null && (
            <Modal title="Sửa từ" onClose={cancelEditWord} closeOnBackdrop={false}>
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
        </Modal>
      )}
    </div>
  );
}
