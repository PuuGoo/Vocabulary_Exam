"use client";

import { useCallback, useEffect, useState } from "react";
import { cx } from "@/components/ui";
import { toast } from "@/components/Toast";
import { CONTENT_STATUS_LABELS, REGISTER_LABELS, USAGE_CONTEXT_LABELS, IELTS_SKILL_LABELS } from "@/lib/vocabularyMeta";
import type { ContentStatus, IeltsSkill, UsageContext, WordRegister } from "@/db/schema";

/**
 * Advanced vocabulary editor (§53–55). Core fields stay in the existing word
 * form; everything optional lives behind one collapsed panel so admins are not
 * faced with twenty inputs by default.
 */

type Collocation = { id?: number | null; phrase: string; meaning: string; example: string; register: string; contentStatus: ContentStatus };
type Pattern = { id?: number | null; pattern: string; meaning: string; example: string; contentStatus: ContentStatus };
type Pronunciation = { id?: number | null; ipa: string; partOfSpeech: string; sense: string; isPrimary: boolean };
type FamilyMember = { wordId: number; term: string; relation: string };
type Meta = {
  contentStatus: ContentStatus;
  register: string;
  cefrLevel: string;
  frequency: string;
  ieltsRelevant: boolean;
  ieltsBandRelevance: string;
  ieltsSkills: IeltsSkill[];
  usageContext: UsageContext[];
  notes: string;
};

const EMPTY_META: Meta = {
  contentStatus: "approved", register: "", cefrLevel: "", frequency: "",
  ieltsRelevant: false, ieltsBandRelevance: "", ieltsSkills: [], usageContext: [], notes: "",
};

type SearchMatch = { wordId: number; term: string | null; meaning: string; setName: string };

export default function WordDepthEditor({ wordId, term, word, onSaved }: {
  wordId: number;
  term: string;
  word?: Partial<Record<keyof Meta, unknown>> | null;
  onSaved?: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [collocations, setCollocations] = useState<Collocation[]>([]);
  const [patterns, setPatterns] = useState<Pattern[]>([]);
  const [pronunciations, setPronunciations] = useState<Pronunciation[]>([]);
  const [topics, setTopics] = useState<string[]>([]);
  const [knownTopics, setKnownTopics] = useState<string[]>([]);
  const [familyLabel, setFamilyLabel] = useState("");
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([]);
  const [meta, setMeta] = useState<Meta>(EMPTY_META);
  const [memberQuery, setMemberQuery] = useState("");
  const [memberMatches, setMemberMatches] = useState<SearchMatch[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/word-content?wordId=${wordId}`, { cache: "no-store" });
      if (!response.ok) throw new Error();
      const data = await response.json();
      const content = data.content?.[String(wordId)] || data.content?.[wordId] || {};
      setCollocations((content.collocations || []).map((item: Collocation) => ({
        id: item.id, phrase: item.phrase, meaning: item.meaning || "", example: item.example || "",
        register: item.register || "", contentStatus: (item.contentStatus || "approved") as ContentStatus,
      })));
      setPatterns((content.patterns || []).map((item: Pattern & { pattern: string }) => ({
        id: item.id, pattern: item.pattern, meaning: item.meaning || "", example: item.example || "",
        contentStatus: (item.contentStatus || "approved") as ContentStatus,
      })));
      setPronunciations((content.pronunciations || []).map((item: Pronunciation) => ({
        id: item.id, ipa: item.ipa, partOfSpeech: item.partOfSpeech || "", sense: item.sense || "",
        isPrimary: Boolean(item.isPrimary),
      })));
      setTopics(content.topics || []);
      setKnownTopics(data.topics || []);
      const family = (content.families || [])[0];
      setFamilyLabel(family?.label || "");
      setFamilyMembers((family?.members || [])
        .filter((member: FamilyMember) => member.wordId !== wordId)
        .map((member: FamilyMember & { term: string | null }) => ({
          wordId: member.wordId, term: member.term || "", relation: member.relation || "",
        })));
    } catch {
      toast("Không tải được dữ liệu nâng cao của từ này.");
    } finally {
      setLoading(false);
    }
  }, [wordId]);

  useEffect(() => {
    void load();
    setMeta((current) => ({
      ...current,
      contentStatus: ((word?.contentStatus as ContentStatus) || "approved"),
      register: (word?.register as string) || "",
      cefrLevel: (word?.cefrLevel as string) || "",
      frequency: (word?.frequency as string) || "",
      ieltsRelevant: Boolean(word?.ieltsRelevant),
      ieltsBandRelevance: (word?.ieltsBandRelevance as string) || "",
      ieltsSkills: (word?.ieltsSkills as IeltsSkill[]) || [],
      usageContext: (word?.usageContext as UsageContext[]) || [],
      notes: (word?.notes as string) || "",
    }));
  }, [load, word]);

  async function searchMembers() {
    const query = memberQuery.trim();
    if (query.length < 2) { setMemberMatches([]); return; }
    const response = await fetch(`/api/admin/words/search?q=${encodeURIComponent(query)}`);
    const data = response.ok ? await response.json() : { matches: [] };
    setMemberMatches((data.matches || [])
      .filter((match: SearchMatch) => match.wordId !== wordId)
      .slice(0, 8)
      .map((match: SearchMatch) => ({ ...match, term: match.term || "" })));
  }

  async function save() {
    setSaving(true);
    try {
      const contentResponse = await fetch("/api/admin/word-content", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wordId,
          collocations: collocations.filter((item) => item.phrase.trim()).map((item) => ({
            id: item.id ?? null, phrase: item.phrase.trim(), meaning: item.meaning.trim() || null,
            example: item.example.trim() || null, register: item.register || null, contentStatus: item.contentStatus,
          })),
          patterns: patterns.filter((item) => item.pattern.trim()).map((item) => ({
            id: item.id ?? null, pattern: item.pattern.trim(), meaning: item.meaning.trim() || null,
            example: item.example.trim() || null, contentStatus: item.contentStatus,
          })),
          pronunciations: pronunciations.filter((item) => item.ipa.trim()).map((item) => ({
            id: item.id ?? null, ipa: item.ipa.trim(), partOfSpeech: item.partOfSpeech.trim() || null,
            sense: item.sense.trim() || null, isPrimary: item.isPrimary,
          })),
          topics: topics.map((topic) => topic.trim()).filter(Boolean),
          family: familyLabel.trim()
            ? { label: familyLabel.trim(), members: familyMembers.map((member) => ({ wordId: member.wordId, relation: member.relation || null })) }
            : null,
        }),
      });
      if (!contentResponse.ok) throw new Error("content");

      const metaResponse = await fetch(`/api/admin/words/${wordId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contentStatus: meta.contentStatus,
          register: meta.register,
          cefrLevel: meta.cefrLevel,
          frequency: meta.frequency,
          ieltsRelevant: meta.ieltsRelevant,
          ieltsBandRelevance: meta.ieltsBandRelevance,
          ieltsSkills: meta.ieltsSkills,
          usageContext: meta.usageContext,
          notes: meta.notes,
        }),
      });
      if (!metaResponse.ok) throw new Error("meta");
      toast("Đã lưu dữ liệu nâng cao.");
      onSaved?.();
    } catch {
      toast("Không lưu được dữ liệu nâng cao.");
    } finally {
      setSaving(false);
    }
  }

  const toggleList = <T extends string>(list: T[], value: T) =>
    list.includes(value) ? list.filter((item) => item !== value) : [...list, value];

  return (
    <div className="md:col-span-2 rounded-xl border border-line bg-[#FBFAFE] p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-bold uppercase tracking-wide text-muted">Nâng cao · collocation, cấu trúc, chủ đề</p>
        <button type="button" className={`${cx.btn} ${cx.btnGold} !min-h-9 !px-3 !py-1.5`} disabled={saving || loading} onClick={() => void save()}>
          {saving ? "Đang lưu…" : "Lưu nâng cao"}
        </button>
      </div>
      {loading ? <p className="mt-2 text-xs text-muted" role="status">Đang tải…</p> : (
        <div className="mt-3 space-y-4">
          <section>
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-ink">Collocations</h4>
              <button type="button" className={`${cx.btn} ${cx.btnGhost} !min-h-8 !px-2 !py-1 text-xs`} onClick={() => setCollocations((current) => [...current, { phrase: "", meaning: "", example: "", register: "", contentStatus: "approved" }])}>+ Thêm</button>
            </div>
            <ul className="mt-2 space-y-2">
              {collocations.map((item, index) => (
                <li key={index} className="rounded-lg border border-line bg-white p-2">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <label className="block">
                      <span className={cx.label}>Cụm từ</span>
                      <input className={`${cx.input} !mb-0`} value={item.phrase} placeholder="make a decision" aria-label="Cụm collocation"
                        onChange={(event) => setCollocations((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, phrase: event.target.value } : row))} />
                    </label>
                    <label className="block">
                      <span className={cx.label}>Nghĩa</span>
                      <input className={`${cx.input} !mb-0`} value={item.meaning} aria-label="Nghĩa của collocation"
                        onChange={(event) => setCollocations((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, meaning: event.target.value } : row))} />
                    </label>
                    <label className="block sm:col-span-2">
                      <span className={cx.label}>Ví dụ</span>
                      <input className={`${cx.input} !mb-0`} value={item.example} aria-label="Ví dụ của collocation"
                        onChange={(event) => setCollocations((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, example: event.target.value } : row))} />
                    </label>
                    <label className="block">
                      <span className={cx.label}>Register</span>
                      <select className={`${cx.input} !mb-0`} value={item.register} aria-label="Register của collocation"
                        onChange={(event) => setCollocations((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, register: event.target.value } : row))}>
                        <option value="">—</option>
                        {Object.entries(REGISTER_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                    </label>
                    <label className="block">
                      <span className={cx.label}>Trạng thái</span>
                      <select className={`${cx.input} !mb-0`} value={item.contentStatus} aria-label="Trạng thái collocation"
                        onChange={(event) => setCollocations((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, contentStatus: event.target.value as ContentStatus } : row))}>
                        {Object.entries(CONTENT_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                    </label>
                  </div>
                  <button type="button" className="mt-2 text-xs font-bold text-bad" onClick={() => setCollocations((current) => current.filter((_, rowIndex) => rowIndex !== index))}>Xoá</button>
                </li>
              ))}
              {!collocations.length && <li className="text-xs text-muted">Chưa có collocation. Học sinh sẽ không thấy chế độ luyện collocation cho từ này.</li>}
            </ul>
          </section>

          <section>
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-ink">Patterns</h4>
              <button type="button" className={`${cx.btn} ${cx.btnGhost} !min-h-8 !px-2 !py-1 text-xs`} onClick={() => setPatterns((current) => [...current, { pattern: "", meaning: "", example: "", contentStatus: "approved" }])}>+ Thêm</button>
            </div>
            <ul className="mt-2 space-y-2">
              {patterns.map((item, index) => (
                <li key={index} className="rounded-lg border border-line bg-white p-2">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <label className="block sm:col-span-2">
                      <span className={cx.label}>Cấu trúc</span>
                      <input className={`${cx.input} !mb-0 font-mono`} value={item.pattern} placeholder="prevent sb from doing sth" aria-label="Cấu trúc"
                        onChange={(event) => setPatterns((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, pattern: event.target.value } : row))} />
                    </label>
                    <label className="block">
                      <span className={cx.label}>Nghĩa</span>
                      <input className={`${cx.input} !mb-0`} value={item.meaning} aria-label="Nghĩa của cấu trúc"
                        onChange={(event) => setPatterns((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, meaning: event.target.value } : row))} />
                    </label>
                    <label className="block">
                      <span className={cx.label}>Trạng thái</span>
                      <select className={`${cx.input} !mb-0`} value={item.contentStatus} aria-label="Trạng thái cấu trúc"
                        onChange={(event) => setPatterns((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, contentStatus: event.target.value as ContentStatus } : row))}>
                        {Object.entries(CONTENT_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                    </label>
                  </div>
                  <button type="button" className="mt-2 text-xs font-bold text-bad" onClick={() => setPatterns((current) => current.filter((_, rowIndex) => rowIndex !== index))}>Xoá</button>
                </li>
              ))}
              {!patterns.length && <li className="text-xs text-muted">Chưa có cấu trúc. Có thể ghi cấu trúc vào cột “Loại từ” nếu dùng dạng nhiều nhóm (phân cách bằng ;).</li>}
            </ul>
          </section>

          <section>
            <h4 className="text-xs font-bold text-ink">Chủ đề</h4>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {[...new Set([...knownTopics, ...topics])].map((topic) => (
                <button key={topic} type="button" aria-pressed={topics.includes(topic)}
                  className={`min-h-8 rounded-full border px-2.5 text-xs font-semibold ${topics.includes(topic) ? "border-gold bg-goldpale text-golddark" : "border-line bg-white text-muted"}`}
                  onClick={() => setTopics((current) => toggleList(current, topic))}>
                  {topic}
                </button>
              ))}
            </div>
            <input className={`${cx.input} mt-2`} placeholder="Thêm chủ đề mới, phân cách bằng dấu |" aria-label="Thêm chủ đề"
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                const value = (event.target as HTMLInputElement).value;
                const added = value.split(/[|;]/).map((item) => item.trim()).filter(Boolean);
                if (added.length) setTopics((current) => [...new Set([...current, ...added])]);
                (event.target as HTMLInputElement).value = "";
              }} />
          </section>

          <section>
            <h4 className="text-xs font-bold text-ink">Họ từ</h4>
            <input className={`${cx.input} mt-2`} value={familyLabel} placeholder="Nhãn họ từ, ví dụ: economy" aria-label="Nhãn họ từ"
              onChange={(event) => setFamilyLabel(event.target.value)} />
            <ul className="mt-1 space-y-1">
              {familyMembers.map((member) => (
                <li key={member.wordId} className="flex items-center justify-between gap-2 rounded-lg border border-line bg-white px-2 py-1 text-xs">
                  <span><b>{member.term}</b>{member.relation ? <span className="text-muted"> · {member.relation}</span> : null}</span>
                  <button type="button" className="font-bold text-bad" aria-label={`Bỏ ${member.term} khỏi họ từ`}
                    onClick={() => setFamilyMembers((current) => current.filter((item) => item.wordId !== member.wordId))}>Xoá</button>
                </li>
              ))}
            </ul>
            <div className="mt-2 flex gap-2">
              <input className={`${cx.input} !mb-0`} value={memberQuery} placeholder="Tìm từ để thêm vào họ từ" aria-label="Tìm từ trong họ"
                onChange={(event) => setMemberQuery(event.target.value)}
                onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void searchMembers(); } }} />
              <button type="button" className={`${cx.btn} ${cx.btnGhost} !mb-0`} onClick={() => void searchMembers()}>Tìm</button>
            </div>
            {memberMatches.length > 0 && (
              <ul className="mt-2 space-y-1">
                {memberMatches.map((match) => (
                  <li key={match.wordId}>
                    <button type="button" className="w-full rounded-lg border border-line bg-white px-2 py-1 text-left text-xs hover:border-gold"
                      onClick={() => {
                        setFamilyMembers((current) => current.some((item) => item.wordId === match.wordId)
                          ? current
                          : [...current, { wordId: match.wordId, term: match.term || "", relation: "" }]);
                        setMemberMatches([]);
                        setMemberQuery("");
                      }}>
                      <b>{match.term}</b> <span className="text-muted">· {match.meaning} · {match.setName}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h4 className="text-xs font-bold text-ink">Phát âm theo từ loại (UK IPA)</h4>
            <p className="text-[0.7rem] text-muted">IPA hiện tại của từ ({term || "—"}) không bị ghi đè; thêm biến thể có cấu trúc tại đây (ví dụ record: noun /rek.ɔːd/, verb /rɪˈkɔːd/).</p>
            <ul className="mt-2 space-y-2">
              {pronunciations.map((item, index) => (
                <li key={index} className="grid gap-2 rounded-lg border border-line bg-white p-2 sm:grid-cols-4">
                  <input className={`${cx.input} !mb-0 font-mono`} value={item.ipa} aria-label="IPA biến thể" placeholder="/rek.ɔːd/"
                    onChange={(event) => setPronunciations((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, ipa: event.target.value } : row))} />
                  <input className={`${cx.input} !mb-0`} value={item.partOfSpeech} aria-label="Từ loại" placeholder="noun"
                    onChange={(event) => setPronunciations((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, partOfSpeech: event.target.value } : row))} />
                  <input className={`${cx.input} !mb-0`} value={item.sense} aria-label="Nghĩa của biến thể" placeholder="a record of something"
                    onChange={(event) => setPronunciations((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, sense: event.target.value } : row))} />
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={item.isPrimary} aria-label="Biến thể chính"
                      onChange={(event) => setPronunciations((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, isPrimary: event.target.checked } : row))} />Chính</label>
                    <button type="button" className="text-xs font-bold text-bad" onClick={() => setPronunciations((current) => current.filter((_, rowIndex) => rowIndex !== index))}>Xoá</button>
                  </div>
                </li>
              ))}
            </ul>
            <button type="button" className={`${cx.btn} ${cx.btnGhost} !min-h-8 mt-2 !px-2 !py-1 text-xs`}
              onClick={() => setPronunciations((current) => [...current, { ipa: "", partOfSpeech: "", sense: "", isPrimary: current.length === 0 }])}>+ Thêm biến thể</button>
          </section>

          <section className="grid gap-2 sm:grid-cols-2">
            <label className="block">
              <span className={cx.label}>Trạng thái nội dung</span>
              <select className={`${cx.input} !mb-0`} value={meta.contentStatus} aria-label="Trạng thái nội dung"
                onChange={(event) => setMeta({ ...meta, contentStatus: event.target.value as ContentStatus })}>
                {Object.entries(CONTENT_STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label className="block">
              <span className={cx.label}>Register</span>
              <select className={`${cx.input} !mb-0`} value={meta.register} aria-label="Register"
                onChange={(event) => setMeta({ ...meta, register: event.target.value as WordRegister | "" })}>
                <option value="">—</option>
                {Object.entries(REGISTER_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label className="block">
              <span className={cx.label}>CEFR</span>
              <select className={`${cx.input} !mb-0`} value={meta.cefrLevel} aria-label="CEFR"
                onChange={(event) => setMeta({ ...meta, cefrLevel: event.target.value })}>
                <option value="">—</option>
                {["A1", "A2", "B1", "B2", "C1", "C2"].map((level) => <option key={level} value={level}>{level}</option>)}
              </select>
            </label>
            <label className="block">
              <span className={cx.label}>Mức độ liên quan IELTS</span>
              <input className={`${cx.input} !mb-0`} value={meta.ieltsBandRelevance} placeholder="7+ / band 6-7 (để trống nếu không chắc)" aria-label="Mức band IELTS"
                onChange={(event) => setMeta({ ...meta, ieltsBandRelevance: event.target.value })} />
            </label>
            <label className="flex items-center gap-2 text-xs font-semibold">
              <input type="checkbox" checked={meta.ieltsRelevant} aria-label="Từ liên quan IELTS"
                onChange={(event) => setMeta({ ...meta, ieltsRelevant: event.target.checked })} />
              Từ vựng IELTS
            </label>
            <label className="block">
              <span className={cx.label}>Tần suất</span>
              <input className={`${cx.input} !mb-0`} value={meta.frequency} placeholder="high / academic-2000" aria-label="Tần suất"
                onChange={(event) => setMeta({ ...meta, frequency: event.target.value })} />
            </label>
            <fieldset className="sm:col-span-2">
              <legend className={cx.label}>Kỹ năng IELTS</legend>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(IELTS_SKILL_LABELS).map(([value, label]) => (
                  <button key={value} type="button" aria-pressed={meta.ieltsSkills.includes(value as IeltsSkill)}
                    className={`min-h-8 rounded-full border px-2.5 text-xs font-semibold ${meta.ieltsSkills.includes(value as IeltsSkill) ? "border-gold bg-goldpale text-golddark" : "border-line bg-white text-muted"}`}
                    onClick={() => setMeta({ ...meta, ieltsSkills: toggleList(meta.ieltsSkills, value as IeltsSkill) })}>{label}</button>
                ))}
              </div>
            </fieldset>
            <fieldset className="sm:col-span-2">
              <legend className={cx.label}>Ngữ cảnh sử dụng</legend>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(USAGE_CONTEXT_LABELS).map(([value, label]) => (
                  <button key={value} type="button" aria-pressed={meta.usageContext.includes(value as UsageContext)}
                    className={`min-h-8 rounded-full border px-2.5 text-xs font-semibold ${meta.usageContext.includes(value as UsageContext) ? "border-gold bg-goldpale text-golddark" : "border-line bg-white text-muted"}`}
                    onClick={() => setMeta({ ...meta, usageContext: toggleList(meta.usageContext, value as UsageContext) })}>{label}</button>
                ))}
              </div>
            </fieldset>
            <label className="block sm:col-span-2">
              <span className={cx.label}>Ghi chú</span>
              <textarea className={`${cx.input} !mb-0 min-h-[70px]`} value={meta.notes} aria-label="Ghi chú"
                onChange={(event) => setMeta({ ...meta, notes: event.target.value })} />
            </label>
          </section>
        </div>
      )}
    </div>
  );
}
