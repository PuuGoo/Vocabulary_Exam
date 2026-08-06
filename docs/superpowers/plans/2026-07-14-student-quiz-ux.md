# Student Quiz/Learn UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the four UX improvements approved in
`docs/superpowers/specs/2026-07-14-student-quiz-ux-design.md`: persisted
flashcard progress + jump/keyboard nav, a retest-wrong-words flow, a
whole-set quiz progress/result table-of-contents with per-group grading and
autofocus, and a shared modal for admin word add/edit.

**Architecture:** Next.js 14 App Router + Drizzle/Postgres. No component
test framework exists in this repo (only `node:test` for pure functions, see
`src/lib/gemini.test.ts`) — pure logic gets unit tests, page-level React
changes are verified manually against the dev server, matching existing
project convention.

**Tech Stack:** Next.js 14, React 18, Drizzle ORM 0.33 (`postgres` driver),
Zod, Tailwind, `node:test` + `tsx` for unit tests.

---

## Before you start

Read `docs/superpowers/specs/2026-07-14-student-quiz-ux-design.md` in full —
this plan implements it. Also skim these existing files, since every task
modifies or extends them:

- `src/db/schema.ts` — Drizzle schema, no migration files are checked in;
  schema changes are applied with `npm run db:push` (drizzle-kit push
  against `DATABASE_URL`).
- `src/app/api/mistakes/route.ts`, `src/app/api/mistakes/[id]/route.ts`
- `src/app/api/sets/[id]/route.ts`
- `src/app/(student)/learn/[setId]/page.tsx`
- `src/app/(student)/review/page.tsx`
- `src/app/(student)/quiz/[setId]/page.tsx`
- `src/app/admin/sets/page.tsx`
- `src/components/ui.ts` (the `cx` shared class-name map)

Make sure `.env` has a working `DATABASE_URL` before Task 2 (schema push)
and before manually verifying any task that hits the API.

---

### Task 1: Add a `test` npm script

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add the script**

In `package.json`, add a `"test"` entry to `"scripts"` (keep existing scripts
as-is, just add this key):

```json
"test": "node --import tsx --test src/lib/gemini.test.ts"
```

- [ ] **Step 2: Verify it runs the existing test**

Run: `npm test`
Expected: output shows `# pass 1` (the existing `gemini.test.ts` test
passes). This confirms the runner works before we add more test files to it
in later tasks.

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "chore: add npm test script for node:test unit tests"
```

---

### Task 2: `word_progress` table

**Files:**
- Modify: `src/db/schema.ts`

- [ ] **Step 1: Add the table**

In `src/db/schema.ts`, add this new table definition right after the
`mistakes` table (after its closing `);` and before `passwordResets`):

```ts
export const wordProgress = pgTable(
  "word_progress",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    wordId: integer("word_id")
      .notNull()
      .references(() => words.id, { onDelete: "cascade" }),
    known: boolean("known").notNull(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    uniqPair: uniqueIndex("word_progress_user_word_idx").on(table.userId, table.wordId),
  })
);
```

- [ ] **Step 2: Add the type export**

Near the bottom of the file, alongside the other `export type ... = typeof
...` lines, add:

```ts
export type WordProgress = typeof wordProgress.$inferSelect;
```

- [ ] **Step 3: Push the schema to the database**

Run: `npm run db:push`
Expected: drizzle-kit reports it created the `word_progress` table (review
the printed diff before confirming, if prompted — it should only show the
new table, nothing destructive).

- [ ] **Step 4: Commit**

```bash
git add src/db/schema.ts
git commit -m "feat(db): add word_progress table for per-user flashcard state"
```

---

### Task 3: Pure helper `quizGroups.ts`

**Files:**
- Create: `src/lib/quizGroups.ts`
- Create: `src/lib/quizGroups.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Write the failing test**

Create `src/lib/quizGroups.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { groupIndexForQuestion, circleStatus } from "./quizGroups";

test("groupIndexForQuestion maps a 1-based question number to a 0-based group index", () => {
  assert.equal(groupIndexForQuestion(1, 10), 0);
  assert.equal(groupIndexForQuestion(10, 10), 0);
  assert.equal(groupIndexForQuestion(11, 10), 1);
  assert.equal(groupIndexForQuestion(25, 10), 2);
});

test("circleStatus reflects graded/answered/correct state", () => {
  assert.equal(circleStatus(false, false, false), "empty");
  assert.equal(circleStatus(false, true, false), "answered");
  assert.equal(circleStatus(true, true, true), "correct");
  assert.equal(circleStatus(true, true, false), "wrong");
  assert.equal(circleStatus(true, false, false), "wrong");
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `node --import tsx --test src/lib/quizGroups.test.ts`
Expected: FAIL — `Cannot find module './quizGroups'`.

- [ ] **Step 3: Implement**

Create `src/lib/quizGroups.ts`:

```ts
export function groupIndexForQuestion(questionNumber: number, groupSize: number): number {
  return Math.floor((questionNumber - 1) / groupSize);
}

export type CircleStatus = "empty" | "answered" | "correct" | "wrong";

export function circleStatus(graded: boolean, answered: boolean, correct: boolean): CircleStatus {
  if (graded) return correct ? "correct" : "wrong";
  return answered ? "answered" : "empty";
}
```

- [ ] **Step 4: Run it and confirm it passes**

Run: `node --import tsx --test src/lib/quizGroups.test.ts`
Expected: `# pass 2`

- [ ] **Step 5: Add it to the `test` npm script**

In `package.json`, update the `"test"` script from Task 1 to:

```json
"test": "node --import tsx --test src/lib/gemini.test.ts src/lib/quizGroups.test.ts"
```

Run: `npm test`
Expected: `# pass 3` (gemini + 2 quizGroups tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/quizGroups.ts src/lib/quizGroups.test.ts package.json
git commit -m "feat: add quizGroups helper for group/circle status math"
```

---

### Task 4: Pure helper `reviewGroups.ts`

**Files:**
- Create: `src/lib/reviewGroups.ts`
- Create: `src/lib/reviewGroups.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Write the failing test**

Create `src/lib/reviewGroups.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { groupMistakesBySet, type MistakeRow } from "./reviewGroups";

function row(overrides: Partial<MistakeRow>): MistakeRow {
  return {
    id: 1,
    timesWrong: 1,
    lastWrongAt: "2026-01-01T00:00:00.000Z",
    wordId: 1,
    meaning: "nghĩa",
    term: "term",
    v1: null,
    v2: null,
    v3: null,
    ipa: null,
    setId: 1,
    setName: "Bộ A",
    setType: "ielts_vocab",
    ...overrides,
  };
}

test("groupMistakesBySet groups rows by setId, preserving first-seen order", () => {
  const rows = [
    row({ id: 1, setId: 2, setName: "Bộ B", wordId: 10 }),
    row({ id: 2, setId: 1, setName: "Bộ A", wordId: 11 }),
    row({ id: 3, setId: 2, setName: "Bộ B", wordId: 12 }),
  ];
  const groups = groupMistakesBySet(rows);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].setId, 2);
  assert.equal(groups[0].items.length, 2);
  assert.equal(groups[1].setId, 1);
  assert.equal(groups[1].items.length, 1);
});

test("groupMistakesBySet returns an empty array for no rows", () => {
  assert.deepEqual(groupMistakesBySet([]), []);
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `node --import tsx --test src/lib/reviewGroups.test.ts`
Expected: FAIL — `Cannot find module './reviewGroups'`.

- [ ] **Step 3: Implement**

Create `src/lib/reviewGroups.ts`:

```ts
export type MistakeRow = {
  id: number;
  timesWrong: number;
  lastWrongAt: string;
  wordId: number;
  meaning: string;
  term: string | null;
  v1: string | null;
  v2: string | null;
  v3: string | null;
  ipa: string | null;
  setId: number;
  setName: string;
  setType: "irregular_verb" | "ielts_vocab";
};

export type MistakeSetGroup = {
  setId: number;
  setName: string;
  setType: "irregular_verb" | "ielts_vocab";
  items: MistakeRow[];
};

export function groupMistakesBySet(rows: MistakeRow[]): MistakeSetGroup[] {
  const groups = new Map<number, MistakeSetGroup>();
  for (const row of rows) {
    let group = groups.get(row.setId);
    if (!group) {
      group = { setId: row.setId, setName: row.setName, setType: row.setType, items: [] };
      groups.set(row.setId, group);
    }
    group.items.push(row);
  }
  return Array.from(groups.values());
}
```

- [ ] **Step 4: Run it and confirm it passes**

Run: `node --import tsx --test src/lib/reviewGroups.test.ts`
Expected: `# pass 2`

- [ ] **Step 5: Add it to the `test` npm script**

In `package.json`, update `"test"` to:

```json
"test": "node --import tsx --test src/lib/gemini.test.ts src/lib/quizGroups.test.ts src/lib/reviewGroups.test.ts"
```

Run: `npm test`
Expected: `# pass 5`

- [ ] **Step 6: Commit**

```bash
git add src/lib/reviewGroups.ts src/lib/reviewGroups.test.ts package.json
git commit -m "feat: add reviewGroups helper to group mistakes by set"
```

---

### Task 5: `POST /api/mistakes` persists `word_progress`

**Files:**
- Modify: `src/app/api/mistakes/route.ts`

- [ ] **Step 1: Import `wordProgress`**

In `src/app/api/mistakes/route.ts`, change the schema import line:

```ts
import { mistakes, words, vocabSets } from "@/db/schema";
```

to:

```ts
import { mistakes, words, vocabSets, wordProgress } from "@/db/schema";
```

- [ ] **Step 2: Upsert progress in `POST`**

In the same file, the `POST` handler currently ends with:

```ts
  if (parsed.data.learned) {
    await db.delete(mistakes).where(and(eq(mistakes.userId, session.userId), eq(mistakes.wordId, parsed.data.wordId)));
  } else {
    await db
      .insert(mistakes)
      .values({ userId: session.userId, wordId: parsed.data.wordId, setId: parsed.data.setId, timesWrong: 1, lastWrongAt: new Date() })
      .onConflictDoUpdate({
        target: [mistakes.userId, mistakes.wordId],
        set: { timesWrong: sql`${mistakes.timesWrong} + 1`, lastWrongAt: new Date() },
      });
  }

  return NextResponse.json({ ok: true });
```

Insert a new block right before `return NextResponse.json({ ok: true });`
(after the `if/else`), so the handler ends with:

```ts
  if (parsed.data.learned) {
    await db.delete(mistakes).where(and(eq(mistakes.userId, session.userId), eq(mistakes.wordId, parsed.data.wordId)));
  } else {
    await db
      .insert(mistakes)
      .values({ userId: session.userId, wordId: parsed.data.wordId, setId: parsed.data.setId, timesWrong: 1, lastWrongAt: new Date() })
      .onConflictDoUpdate({
        target: [mistakes.userId, mistakes.wordId],
        set: { timesWrong: sql`${mistakes.timesWrong} + 1`, lastWrongAt: new Date() },
      });
  }

  await db
    .insert(wordProgress)
    .values({ userId: session.userId, wordId: parsed.data.wordId, known: parsed.data.learned })
    .onConflictDoUpdate({
      target: [wordProgress.userId, wordProgress.wordId],
      set: { known: parsed.data.learned, updatedAt: new Date() },
    });

  return NextResponse.json({ ok: true });
```

- [ ] **Step 3: Manually verify**

Start the dev server (`npm run dev`), log in as a student, open a set's
Học bài page, click ❌ Chưa nhớ on the first card. In a DB client (or
`psql`), run:

```sql
select * from word_progress order by updated_at desc limit 1;
```

Expected: one row with `known = false` for that word/user. Click ✅ Đã nhớ on
the same card and re-run the query — `known` should now be `true` on the
same row (not a duplicate).

- [ ] **Step 4: Commit**

```bash
git add src/app/api/mistakes/route.ts
git commit -m "feat(api): persist flashcard known/unknown state to word_progress"
```

---

### Task 6: `GET /api/sets/[id]` returns `progress`

**Files:**
- Modify: `src/app/api/sets/[id]/route.ts`

- [ ] **Step 1: Update imports**

Change:

```ts
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { vocabSets, words } from "@/db/schema";
```

to:

```ts
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { vocabSets, words, wordProgress } from "@/db/schema";
```

- [ ] **Step 2: Build and return the progress map in `GET`**

Replace the body of the `GET` handler:

```ts
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const setId = Number(params.id);
  const set = await db.query.vocabSets.findFirst({ where: eq(vocabSets.id, setId) });
  if (!set) return NextResponse.json({ error: "Không tìm thấy bộ từ vựng." }, { status: 404 });

  const wordList = await db.select().from(words).where(eq(words.setId, setId)).orderBy(words.id);
  return NextResponse.json({ set: { ...set, words: wordList } });
}
```

with:

```ts
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const setId = Number(params.id);
  const set = await db.query.vocabSets.findFirst({ where: eq(vocabSets.id, setId) });
  if (!set) return NextResponse.json({ error: "Không tìm thấy bộ từ vựng." }, { status: 404 });

  const wordList = await db.select().from(words).where(eq(words.setId, setId)).orderBy(words.id);

  const progress: Record<number, boolean> = {};
  if (wordList.length > 0) {
    const progressRows = await db
      .select({ wordId: wordProgress.wordId, known: wordProgress.known })
      .from(wordProgress)
      .where(
        and(
          eq(wordProgress.userId, session.userId),
          inArray(
            wordProgress.wordId,
            wordList.map((w) => w.id)
          )
        )
      );
    for (const row of progressRows) progress[row.wordId] = row.known;
  }

  return NextResponse.json({ set: { ...set, words: wordList }, progress });
}
```

- [ ] **Step 3: Manually verify**

With the dev server running and a word already marked in Task 5's
verification, open the browser dev tools Network tab, load
`/learn/{setId}`, inspect the response of `GET /api/sets/{setId}` — confirm
it has a top-level `progress` key mapping that word's id to `false`/`true`.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/sets/[id]/route.ts
git commit -m "feat(api): return per-user word progress map from set detail endpoint"
```

---

### Task 7: Học bài (flashcard) page — persisted state, jump-to-card, keyboard shortcuts

**Files:**
- Modify: `src/app/(student)/learn/[setId]/page.tsx`

- [ ] **Step 1: Replace the full file**

Replace the entire contents of
`src/app/(student)/learn/[setId]/page.tsx` with:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { cx } from "@/components/ui";
import SpeakButton from "@/components/SpeakButton";
import { toast } from "@/components/Toast";

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
type SetDetail = { id: number; name: string; type: "irregular_verb" | "ielts_vocab"; words: Word[] };

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function LearnPage() {
  const params = useParams<{ setId: string }>();
  const router = useRouter();

  const [set, setSet] = useState<SetDetail | null>(null);
  const [order, setOrder] = useState<Word[]>([]);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [known, setKnown] = useState<Record<number, boolean>>({});
  const [jumpValue, setJumpValue] = useState("");

  useEffect(() => {
    fetch(`/api/sets/${params.setId}`)
      .then((r) => r.json())
      .then((d) => {
        setSet(d.set);
        setOrder(d.set.words);
        setKnown(d.progress || {});
      });
  }, [params.setId]);

  const isVerb = set?.type === "irregular_verb";
  const word = order[index];
  const total = order.length;

  function goNext() {
    setFlipped(false);
    setIndex((i) => Math.min(i + 1, total - 1));
  }
  function goPrev() {
    setFlipped(false);
    setIndex((i) => Math.max(i - 1, 0));
  }
  function goToIndex(n: number) {
    if (total === 0) return;
    const clamped = Math.min(Math.max(n, 1), total) - 1;
    setFlipped(false);
    setIndex(clamped);
  }
  function submitJump() {
    const n = Number(jumpValue);
    if (!jumpValue.trim() || Number.isNaN(n)) {
      toast("Nhập số thứ tự thẻ hợp lệ.");
      return;
    }
    goToIndex(n);
    setJumpValue("");
  }
  function reshuffle() {
    if (!set) return;
    setOrder(shuffle(set.words));
    setIndex(0);
    setFlipped(false);
    toast("Đã xáo trộn lại thứ tự thẻ.");
  }
  function restartInOrder() {
    if (!set) return;
    setOrder(set.words);
    setIndex(0);
    setFlipped(false);
  }

  async function mark(learned: boolean) {
    if (!set || !word) return;
    setKnown((prev) => ({ ...prev, [word.id]: learned }));
    await fetch("/api/mistakes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ wordId: word.id, setId: set.id, learned }),
    });
    goNext();
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        goPrev();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        goNext();
      } else if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        setFlipped((f) => !f);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total]);

  if (!set) return <div className={cx.panel}><div className={cx.empty}>Đang tải...</div></div>;
  if (total === 0) return <div className={cx.panel}><div className={cx.empty}>Bộ từ vựng này chưa có từ nào.</div></div>;

  const answerText = isVerb ? `${word.v1} — ${word.v2} — ${word.v3}` : word.term || "";
  const speakText = isVerb ? word.v1 || "" : word.term || "";

  return (
    <div className={cx.panel}>
      <div className="flex justify-between items-center mb-2.5 flex-wrap gap-2">
        <h2 className={cx.h2}>📖 Học bài — {set.name}</h2>
        <button className={`${cx.btn} ${cx.btnGhost}`} onClick={() => router.push("/study")}>
          ← Chọn bộ khác
        </button>
      </div>
      <div className={cx.desc}>
        Bấm vào thẻ để lật xem đáp án. Tự đánh giá bạn đã nhớ từ này chưa. Dùng phím ← → để chuyển thẻ, phím
        Space/Enter để lật thẻ.
      </div>

      <div className="flex items-center justify-center gap-2 flex-wrap mb-3">
        <div className="text-[0.85rem] text-muted">
          Thẻ {index + 1} / {total}
        </div>
        <input
          type="number"
          min={1}
          max={total}
          placeholder="Số thẻ"
          value={jumpValue}
          onChange={(e) => setJumpValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submitJump();
          }}
          className={`${cx.input} !mb-0 !w-24 !py-1`}
        />
        <button className={`${cx.btn} ${cx.btnGhost} !px-3 !py-1.5`} onClick={submitJump}>
          Đi tới
        </button>
      </div>

      <div
        onClick={() => setFlipped((f) => !f)}
        className="cursor-pointer select-none border-2 border-dashed border-gold rounded-2xl bg-white min-h-[220px] flex flex-col items-center justify-center px-6 py-10 mb-5 text-center hover:border-golddark transition-colors"
      >
        {!flipped ? (
          <>
            <div className="text-[0.7rem] text-muted uppercase tracking-widest mb-3">Nghĩa tiếng Việt</div>
            <div className="font-serif text-2xl font-bold">{word.meaning}</div>
            <div className="text-muted text-[0.78rem] mt-4">(Bấm để xem đáp án)</div>
          </>
        ) : (
          <>
            <div className="text-[0.7rem] text-muted uppercase tracking-widest mb-3">
              {isVerb ? "V1 — V2 — V3" : "Từ tiếng Anh"}
            </div>
            <div className="font-serif text-2xl font-bold flex items-center gap-3 flex-wrap justify-center">
              {answerText}
              <SpeakButton text={speakText} />
            </div>
            {word.ipa && <div className="text-golddark text-lg mt-1">{word.ipa}</div>}
            {!isVerb && word.wtype && <div className="text-muted text-[0.8rem] mt-2">({word.wtype})</div>}
            {!isVerb && word.example && <div className="text-muted text-[0.85rem] italic mt-3 max-w-md">VD: {word.example}</div>}
          </>
        )}
      </div>

      <div className="flex gap-2.5 justify-center mb-4 flex-wrap">
        <button
          className={`${cx.btn} border ${known[word.id] === false ? "!bg-badbg !border-bad !text-bad" : cx.btnGhost}`}
          onClick={() => mark(false)}
        >
          ❌ Chưa nhớ
        </button>
        <button
          className={`${cx.btn} border ${known[word.id] === true ? "!bg-okbg !border-ok !text-ok" : cx.btnGhost}`}
          onClick={() => mark(true)}
        >
          ✅ Đã nhớ
        </button>
      </div>

      <div className="flex justify-between items-center flex-wrap gap-2">
        <button className={`${cx.btn} ${cx.btnGhost}`} disabled={index === 0} onClick={goPrev}>
          ◀ Thẻ trước
        </button>
        <div className="flex gap-2.5">
          <button className={`${cx.btn} ${cx.btnGhost}`} onClick={restartInOrder}>
            ↺ Từ đầu
          </button>
          <button className={`${cx.btn} ${cx.btnGhost}`} onClick={reshuffle}>
            🔀 Xáo trộn
          </button>
        </div>
        <button className={`${cx.btn} ${cx.btnGhost}`} disabled={index === total - 1} onClick={goNext}>
          Thẻ sau ▶
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Manually verify**

With the dev server running:
1. Open a set's Học bài page, mark a couple of cards ❌/✅, navigate to
   `/study` and back — confirm the marks are still shown highlighted.
2. Type a number into "Số thẻ" and click "Đi tới" — confirm it jumps to
   that card (clamped to `[1, total]` for out-of-range input).
3. Press `→`/`←` — confirm card navigation. Press `Space` — confirm the
   card flips. Click into the "Số thẻ" input and press `→` — confirm it
   does NOT navigate cards (normal text-field caret behavior instead).

- [ ] **Step 3: Commit**

```bash
git add "src/app/(student)/learn/[setId]/page.tsx"
git commit -m "feat(learn): persist known state, add jump-to-card and keyboard shortcuts"
```

---

### Task 8: Ôn từ sai page — grouped by set, retest links

**Files:**
- Modify: `src/app/(student)/review/page.tsx`

- [ ] **Step 1: Replace the full file**

Replace the entire contents of `src/app/(student)/review/page.tsx` with:

```tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { cx } from "@/components/ui";
import { toast } from "@/components/Toast";
import SpeakButton from "@/components/SpeakButton";
import { groupMistakesBySet, type MistakeRow } from "@/lib/reviewGroups";

export default function ReviewPage() {
  const [rows, setRows] = useState<MistakeRow[] | null>(null);
  const [revealed, setRevealed] = useState<Record<number, boolean>>({});

  async function load() {
    const res = await fetch("/api/mistakes");
    const data = await res.json();
    setRows(data.mistakes || []);
  }

  useEffect(() => {
    load();
  }, []);

  async function markLearned(id: number) {
    await fetch(`/api/mistakes/${id}`, { method: "DELETE" });
    toast("Đã đánh dấu là thuộc rồi — bỏ khỏi danh sách ôn tập.");
    setRows((prev) => (prev ? prev.filter((r) => r.id !== id) : prev));
  }

  const groups = rows ? groupMistakesBySet(rows) : [];

  return (
    <div className={cx.panel}>
      <h2 className={cx.h2}>Ôn từ sai</h2>
      <div className={cx.desc}>
        Danh sách các từ bạn từng làm sai, nhóm theo từng bộ từ vựng. Bấm vào thẻ để xem đáp án, đánh dấu
        &quot;Đã thuộc&quot; để bỏ khỏi danh sách, hoặc làm lại bài kiểm tra chỉ với các từ đang sai của một bộ.
      </div>

      {rows === null ? (
        <div className={cx.empty}>Đang tải...</div>
      ) : groups.length === 0 ? (
        <div className={cx.empty}>Bạn chưa có từ nào cần ôn lại — làm tốt lắm! 🎉</div>
      ) : (
        groups.map((g) => (
          <div key={g.setId} className="mb-5">
            <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
              <h3 className="font-serif text-[1rem]">
                {g.setName} <span className="text-muted text-[0.8rem] font-sans">— {g.items.length} từ sai</span>
              </h3>
              <div className="flex gap-2 flex-wrap">
                <Link className={`${cx.btn} ${cx.btnGold} !px-3 !py-1.5`} href={`/quiz/${g.setId}?mode=fill&retest=1`}>
                  Làm lại (Điền từ)
                </Link>
                {g.setType === "ielts_vocab" && (
                  <Link className={`${cx.btn} ${cx.btnGhost} !px-3 !py-1.5`} href={`/quiz/${g.setId}?mode=mc&retest=1`}>
                    Làm lại (Trắc nghiệm)
                  </Link>
                )}
              </div>
            </div>

            {g.items.map((r) => (
              <div key={r.id} className="border border-line rounded-[10px] p-4 mb-3 bg-white">
                <div className="flex justify-between items-start gap-3 flex-wrap">
                  <div className="flex-1 min-w-[200px]">
                    <div className="text-[0.72rem] text-muted mb-1">Sai {r.timesWrong} lần</div>
                    <div className="cursor-pointer" onClick={() => setRevealed((prev) => ({ ...prev, [r.id]: !prev[r.id] }))}>
                      <div className="font-bold">{r.meaning}</div>
                      {revealed[r.id] && (
                        <div className="mt-1.5 flex items-center gap-2 text-[0.95rem] flex-wrap">
                          {r.setType === "irregular_verb" ? (
                            <span>
                              {r.v1} — {r.v2} — {r.v3}
                            </span>
                          ) : (
                            <span>{r.term}</span>
                          )}
                          {r.ipa && <span className="text-golddark">{r.ipa}</span>}
                          <SpeakButton text={(r.setType === "irregular_verb" ? r.v1 : r.term) || ""} />
                        </div>
                      )}
                      {!revealed[r.id] && <div className="text-muted text-[0.8rem] mt-1">(Bấm để xem đáp án)</div>}
                    </div>
                  </div>
                  <button className={`${cx.btn} ${cx.btnGhost} !px-3 !py-1.5`} onClick={() => markLearned(r.id)}>
                    ✓ Đã thuộc
                  </button>
                </div>
              </div>
            ))}
          </div>
        ))
      )}
    </div>
  );
}
```

- [ ] **Step 2: Manually verify**

With at least two wrong words across two different sets (use the flashcard
❌ button or fail a quiz to generate them), open `/review` — confirm two
set-grouped cards render, each with its own "Làm lại" links, and that
"Trắc nghiệm" only appears for `ielts_vocab` sets, not `irregular_verb`.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(student)/review/page.tsx"
git commit -m "feat(review): group mistakes by set and add retest links"
```

---

### Task 9: Quiz page — retest mode, per-group grading, group nav, whole-set TOC, autofocus

**Files:**
- Modify: `src/app/(student)/quiz/[setId]/page.tsx`

- [ ] **Step 1: Replace the full file**

Replace the entire contents of `src/app/(student)/quiz/[setId]/page.tsx`
with:

```tsx
"use client";

import { useEffect, useMemo, useRef, useState, Suspense } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { cx } from "@/components/ui";
import SpeakButton from "@/components/SpeakButton";
import { toast } from "@/components/Toast";
import { groupIndexForQuestion, circleStatus } from "@/lib/quizGroups";

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
type SetDetail = { id: number; name: string; type: "irregular_verb" | "ielts_vocab"; words: Word[] };

const GROUP_SIZE = 10;

function norm(s: string | undefined | null) {
  return (s || "").toString().trim().toLowerCase().replace(/\s+/g, " ");
}
function checkMatch(userVal: string | undefined, answerKey: string | null | undefined) {
  const u = norm(userVal);
  if (!u) return false;
  return (answerKey || "").split("/").map(norm).includes(u);
}
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function fmtClock(totalSeconds: number) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export default function QuizPlayerPage() {
  return (
    <Suspense fallback={null}>
      <QuizPlayerInner />
    </Suspense>
  );
}

function QuizPlayerInner() {
  const params = useParams<{ setId: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const mode = (search.get("mode") as "fill" | "mc") || "fill";
  const timedMode = search.get("timed") === "1";
  const minutes = Number(search.get("minutes") || 15);
  const retest = search.get("retest") === "1";

  const [set, setSet] = useState<SetDetail | null>(null);
  const [mistakeIdByWordId, setMistakeIdByWordId] = useState<Record<number, number>>({});
  const [group, setGroup] = useState(0);
  const [answers, setAnswers] = useState<Record<number, Record<string, string>>>({});
  const [mcOptions, setMcOptions] = useState<Record<number, string[]>>({});

  // grading, keyed by group index so a group's graded state survives navigating away and back
  const [checkedGroups, setCheckedGroups] = useState<Record<number, { score: number; total: number }>>({});

  // timed mode grading (whole-set, single submit)
  const [secondsLeft, setSecondsLeft] = useState(minutes * 60);
  const [timedSubmitted, setTimedSubmitted] = useState(false);
  const [timedScore, setTimedScore] = useState<{ score: number; total: number } | null>(null);
  const startedAtRef = useRef<number>(Date.now());
  const submittedRef = useRef(false);

  // navigation / autofocus
  const [jumpQuestion, setJumpQuestion] = useState("");
  const [pendingFocus, setPendingFocus] = useState<number | "first" | null>(null);
  const inputRefs = useRef(new Map<number, HTMLInputElement>()).current;
  const rowRefs = useRef(new Map<number, HTMLDivElement>()).current;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const res = await fetch(`/api/sets/${params.setId}`);
      const data = await res.json();
      let loadedSet: SetDetail = data.set;
      let mistakeMap: Record<number, number> = {};
      if (retest) {
        const mRes = await fetch("/api/mistakes");
        const mData = await mRes.json();
        const relevant = (mData.mistakes || []).filter((m: { setId: number }) => m.setId === loadedSet.id);
        const wordIds = new Set(relevant.map((m: { wordId: number }) => m.wordId));
        mistakeMap = Object.fromEntries(relevant.map((m: { wordId: number; id: number }) => [m.wordId, m.id]));
        loadedSet = { ...loadedSet, words: loadedSet.words.filter((w) => wordIds.has(w.id)) };
      }
      if (!cancelled) {
        setSet(loadedSet);
        setMistakeIdByWordId(mistakeMap);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.setId, retest]);

  const totalGroups = set ? Math.ceil(set.words.length / GROUP_SIZE) : 0;
  const start = group * GROUP_SIZE;
  const end = set ? Math.min(start + GROUP_SIZE, set.words.length) : 0;
  const isVerb = set?.type === "irregular_verb";
  const effectiveChecked = timedMode ? timedSubmitted : checkedGroups[group] !== undefined;

  const currentWords = useMemo(() => (set ? set.words.slice(start, end) : []), [set, start, end]);

  // build MC options for the words in the current group, once
  useEffect(() => {
    if (!set || isVerb || mode !== "mc") return;
    const allMeanings = set.words.map((w) => w.meaning);
    setMcOptions((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const w of currentWords) {
        if (!next[w.id]) {
          const distractors = shuffle(allMeanings.filter((m) => m !== w.meaning)).slice(0, 3);
          next[w.id] = shuffle([w.meaning, ...distractors]);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [set, currentWords, isVerb, mode]);

  // countdown timer for timed mode
  useEffect(() => {
    if (!timedMode || !set || timedSubmitted) return;
    if (secondsLeft <= 0) {
      submitTimed();
      return;
    }
    const t = setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timedMode, set, secondsLeft, timedSubmitted]);

  // focus the requested word's input (or the first word of the group) after navigation
  useEffect(() => {
    if (pendingFocus === null) return;
    const targetId = pendingFocus === "first" ? currentWords[0]?.id : pendingFocus;
    if (targetId == null) {
      setPendingFocus(null);
      return;
    }
    const input = inputRefs.get(targetId);
    const row = rowRefs.get(targetId);
    if (input) {
      input.focus();
      input.scrollIntoView({ behavior: "smooth", block: "center" });
    } else if (row) {
      row.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    setPendingFocus(null);
  }, [group, currentWords, pendingFocus, inputRefs, rowRefs]);

  function setAnswer(wordId: number, part: string, value: string) {
    setAnswers((prev) => ({ ...prev, [wordId]: { ...prev[wordId], [part]: value } }));
  }

  function resetGroup() {
    setAnswers((prev) => {
      const next = { ...prev };
      currentWords.forEach((w) => delete next[w.id]);
      return next;
    });
    setCheckedGroups((prev) => {
      const next = { ...prev };
      delete next[group];
      return next;
    });
  }

  function goGroup(g: number, focusWordId?: number) {
    setGroup(g);
    setPendingFocus(focusWordId ?? "first");
  }

  function submitJumpQuestion() {
    if (!set) return;
    const n = Number(jumpQuestion);
    if (!jumpQuestion.trim() || Number.isNaN(n) || n < 1 || n > set.words.length) {
      toast("Nhập số thứ tự câu hợp lệ.");
      return;
    }
    const targetWord = set.words[n - 1];
    goGroup(groupIndexForQuestion(n, GROUP_SIZE), targetWord.id);
    setJumpQuestion("");
  }

  function isWordCorrect(w: Word): boolean {
    if (isVerb) {
      const a = answers[w.id] || {};
      return checkMatch(a.v1, w.v1) && checkMatch(a.v2, w.v2) && checkMatch(a.v3, w.v3);
    } else if (mode === "fill") {
      return checkMatch(answers[w.id]?.term, w.term);
    } else {
      return answers[w.id]?.mc === w.meaning;
    }
  }

  function isWordAnswered(w: Word): boolean {
    const a = answers[w.id];
    if (!a) return false;
    if (isVerb) return Boolean(a.v1 || a.v2 || a.v3);
    return Boolean(a.term || a.mc);
  }

  async function clearSolvedMistakes(list: Word[]) {
    const solved = list.filter((w) => isWordCorrect(w) && mistakeIdByWordId[w.id] != null);
    if (solved.length === 0) return;
    await Promise.all(solved.map((w) => fetch(`/api/mistakes/${mistakeIdByWordId[w.id]}`, { method: "DELETE" })));
    setMistakeIdByWordId((prev) => {
      const next = { ...prev };
      solved.forEach((w) => delete next[w.id]);
      return next;
    });
  }

  async function postResult(score: number, total: number, durationSeconds?: number) {
    if (!set) return;
    const wrongWordIds = set.words
      .slice(timedMode ? 0 : start, timedMode ? set.words.length : end)
      .filter((w) => !isWordCorrect(w))
      .map((w) => w.id);
    await fetch("/api/results", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        setId: set.id,
        setName: set.name,
        mode,
        score,
        total,
        timed: timedMode,
        durationSeconds,
        wrongWordIds,
      }),
    });
  }

  async function grade() {
    if (!set) return;
    let correct = 0;
    let total = 0;
    for (const w of currentWords) {
      if (isVerb) {
        total += 3;
        const a = answers[w.id] || {};
        correct += (checkMatch(a.v1, w.v1) ? 1 : 0) + (checkMatch(a.v2, w.v2) ? 1 : 0) + (checkMatch(a.v3, w.v3) ? 1 : 0);
      } else if (mode === "fill") {
        total += 1;
        correct += checkMatch(answers[w.id]?.term, w.term) ? 1 : 0;
      } else {
        total += 1;
        correct += answers[w.id]?.mc === w.meaning ? 1 : 0;
      }
    }
    setCheckedGroups((prev) => ({ ...prev, [group]: { score: correct, total } }));
    await postResult(correct, total);
    if (retest) await clearSolvedMistakes(currentWords);
  }

  async function submitTimed() {
    if (!set || submittedRef.current) return;
    submittedRef.current = true;
    let correct = 0;
    let total = 0;
    for (const w of set.words) {
      if (isVerb) {
        total += 3;
        const a = answers[w.id] || {};
        correct += (checkMatch(a.v1, w.v1) ? 1 : 0) + (checkMatch(a.v2, w.v2) ? 1 : 0) + (checkMatch(a.v3, w.v3) ? 1 : 0);
      } else if (mode === "fill") {
        total += 1;
        correct += checkMatch(answers[w.id]?.term, w.term) ? 1 : 0;
      } else {
        total += 1;
        correct += answers[w.id]?.mc === w.meaning ? 1 : 0;
      }
    }
    const durationSeconds = Math.round((Date.now() - startedAtRef.current) / 1000);
    setTimedSubmitted(true);
    setTimedScore({ score: correct, total });
    await postResult(correct, total, durationSeconds);
    if (retest) await clearSolvedMistakes(set.words);
  }

  if (!set) return <div className={cx.panel}><div className={cx.empty}>Đang tải bài kiểm tra...</div></div>;

  if (retest && set.words.length === 0) {
    return (
      <div className={cx.panel}>
        <div className={cx.empty}>
          🎉 Bạn không còn từ sai nào trong bộ này.
          <div className="mt-3">
            <button className={`${cx.btn} ${cx.btnGhost}`} onClick={() => router.push("/review")}>
              ← Về trang Ôn từ sai
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cx.panel}>
      <div className="flex justify-between items-center mb-2.5 flex-wrap gap-2">
        <h2 className={cx.h2}>
          {set.name}{" "}
          {timedMode && <span className={cx.badgeGold}>Thi thử có tính giờ</span>}{" "}
          {retest && <span className={cx.badgeGold}>Làm lại từ sai</span>}
        </h2>
        <button className={`${cx.btn} ${cx.btnGhost}`} onClick={() => router.push("/study")}>
          ← Chọn bộ khác
        </button>
      </div>

      {timedMode && (
        <div className="flex items-center justify-between gap-3 flex-wrap bg-goldpale rounded-lg px-4 py-3 mb-4">
          <div className="font-serif text-lg">
            ⏱ Thời gian còn lại: <span className={secondsLeft <= 60 ? "text-bad font-bold" : "font-bold"}>{fmtClock(secondsLeft)}</span>
          </div>
          {!timedSubmitted ? (
            <button className={`${cx.btn} ${cx.btnGold}`} onClick={submitTimed}>
              Nộp bài thi
            </button>
          ) : (
            <div className="font-serif text-lg">
              Kết quả: <b>{timedScore?.score}</b>/{timedScore?.total}
            </div>
          )}
        </div>
      )}

      <div className="flex items-center justify-center gap-2 flex-wrap mb-3">
        <label className="text-[0.8rem] text-muted">Nhóm:</label>
        <select
          className={`${cx.input} !mb-0 !w-auto !py-1.5`}
          value={group}
          onChange={(e) => goGroup(Number(e.target.value))}
        >
          {Array.from({ length: totalGroups }).map((_, g) => {
            const s2 = g * GROUP_SIZE + 1;
            const e2 = Math.min((g + 1) * GROUP_SIZE, set.words.length);
            return (
              <option key={g} value={g}>
                Nhóm {g + 1}/{totalGroups} (câu {s2}-{e2})
              </option>
            );
          })}
        </select>
        <input
          type="number"
          min={1}
          max={set.words.length}
          placeholder="Đi tới câu số"
          value={jumpQuestion}
          onChange={(e) => setJumpQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submitJumpQuestion();
          }}
          className={`${cx.input} !mb-0 !w-36 !py-1.5`}
        />
        <button className={`${cx.btn} ${cx.btnGhost} !px-3 !py-1.5`} onClick={submitJumpQuestion}>
          Đi tới
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5 justify-center mb-4">
        {set.words.map((w, idx) => {
          const g = groupIndexForQuestion(idx + 1, GROUP_SIZE);
          const graded = timedMode ? timedSubmitted : checkedGroups[g] !== undefined;
          const status = circleStatus(graded, isWordAnswered(w), graded ? isWordCorrect(w) : false);
          const cls =
            status === "correct"
              ? "bg-ok text-white border-ok"
              : status === "wrong"
              ? "bg-bad text-white border-bad"
              : status === "answered"
              ? "bg-goldpale border-gold text-golddark"
              : "bg-white border-line text-muted";
          return (
            <button
              key={w.id}
              type="button"
              title={`Câu ${idx + 1}`}
              onClick={() => goGroup(g, w.id)}
              className={`w-7 h-7 rounded-full text-[0.7rem] font-semibold border flex items-center justify-center ${cls}`}
            >
              {idx + 1}
            </button>
          );
        })}
      </div>

      <div className="text-[0.82rem] text-muted text-center mb-3.5">
        {mode === "mc" ? "Trắc nghiệm" : isVerb ? "Điền V1 / V2 / V3" : "Điền từ tiếng Anh"}
      </div>

      <div>
        {currentWords.map((w, idx) => (
          <div
            key={w.id}
            ref={(el) => {
              if (el) rowRefs.set(w.id, el);
              else rowRefs.delete(w.id);
            }}
            className="grid grid-cols-[30px_1fr] gap-2.5 items-start py-3.5 border-b border-dashed border-line last:border-none"
          >
            <div className="text-muted text-[0.88rem] text-right pt-1">{start + idx + 1}.</div>
            <div>
              {isVerb ? (
                <>
                  <div className="font-bold mb-2">{w.meaning}</div>
                  <div className="flex gap-2 flex-wrap">
                    {(["v1", "v2", "v3"] as const).map((part) => {
                      const val = answers[w.id]?.[part] || "";
                      const ok = effectiveChecked ? checkMatch(val, w[part]) : null;
                      return (
                        <div key={part} className="flex flex-col flex-1 min-w-[100px]">
                          <span className="text-[0.66rem] text-muted mb-0.5 tracking-wide">{part.toUpperCase()}</span>
                          <input
                            type="text"
                            disabled={effectiveChecked}
                            value={val}
                            onChange={(e) => setAnswer(w.id, part, e.target.value)}
                            ref={
                              part === "v1"
                                ? (el) => {
                                    if (el) inputRefs.set(w.id, el);
                                    else inputRefs.delete(w.id);
                                  }
                                : undefined
                            }
                            className={`${cx.input} !mb-0 ${
                              effectiveChecked ? (ok ? "!border-ok !bg-okbg" : "!border-bad !bg-badbg") : ""
                            }`}
                          />
                        </div>
                      );
                    })}
                  </div>
                  {effectiveChecked && (
                    <div className="mt-2 text-[0.84rem] flex items-center gap-2 flex-wrap">
                      {isWordCorrect(w) ? (
                        <span className="text-ok">✔ Chính xác cả 3.</span>
                      ) : (
                        <>
                          <span className="text-bad">✘ Đáp án đúng:</span>{" "}
                          <span className="text-muted">
                            {w.v1} — {w.v2} — {w.v3}
                          </span>
                          {w.ipa && <span className="text-golddark">{w.ipa}</span>}
                          <SpeakButton text={w.v1 || ""} />
                        </>
                      )}
                    </div>
                  )}
                </>
              ) : mode === "fill" ? (
                <>
                  <div className="font-bold mb-2">{w.meaning}</div>
                  <div className="flex flex-col max-w-xs">
                    <span className="text-[0.66rem] text-muted mb-0.5 tracking-wide">TỪ TIẾNG ANH</span>
                    <input
                      type="text"
                      disabled={effectiveChecked}
                      value={answers[w.id]?.term || ""}
                      onChange={(e) => setAnswer(w.id, "term", e.target.value)}
                      ref={(el) => {
                        if (el) inputRefs.set(w.id, el);
                        else inputRefs.delete(w.id);
                      }}
                      className={`${cx.input} !mb-0 ${
                        effectiveChecked ? (checkMatch(answers[w.id]?.term, w.term) ? "!border-ok !bg-okbg" : "!border-bad !bg-badbg") : ""
                      }`}
                    />
                  </div>
                  {effectiveChecked && (
                    <div className="mt-2 text-[0.84rem] flex items-center gap-2">
                      {checkMatch(answers[w.id]?.term, w.term) ? (
                        <span className="text-ok">✔ Chính xác.</span>
                      ) : (
                        <>
                          <span className="text-bad">✘ Đáp án đúng:</span> <span className="text-muted">{w.term}</span>
                          {w.ipa && <span className="text-golddark">{w.ipa}</span>}
                          <SpeakButton text={w.term || ""} />
                        </>
                      )}
                      {w.example && <span className="text-muted italic">VD: {w.example}</span>}
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="font-bold mb-2 flex items-center gap-2 flex-wrap">
                    {w.term}
                    {w.ipa && <span className="text-golddark text-[0.9rem] font-normal">{w.ipa}</span>}
                    <SpeakButton text={w.term || ""} />
                  </div>
                  <div className="flex flex-col gap-1.5 mt-1">
                    {(mcOptions[w.id] || []).map((opt) => {
                      const chosen = answers[w.id]?.mc === opt;
                      let cls = "border-line bg-white";
                      if (chosen) cls = "border-gold bg-goldpale font-semibold";
                      if (effectiveChecked) {
                        if (opt === w.meaning) cls = "border-ok bg-okbg text-ok";
                        else if (chosen) cls = "border-bad bg-badbg text-bad";
                      }
                      return (
                        <div
                          key={opt}
                          onClick={() => !effectiveChecked && setAnswer(w.id, "mc", opt)}
                          className={`border rounded-lg px-2.5 py-2 cursor-pointer text-[0.88rem] ${cls}`}
                        >
                          {opt}
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {!timedMode && checkedGroups[group] && (
        <div className="flex justify-center my-4">
          <div className="w-[110px] h-[110px] rounded-full border-[3px] border-dashed border-golddark flex flex-col items-center justify-center -rotate-[8deg] text-golddark font-serif text-center leading-tight">
            <div className="text-2xl font-bold">
              {checkedGroups[group].score}/{checkedGroups[group].total}
            </div>
            <div className="text-[0.62rem] tracking-widest uppercase mt-0.5">Đã chấm</div>
          </div>
        </div>
      )}

      {!timedMode && (
        <div className="flex gap-2.5 justify-center mt-3.5 flex-wrap">
          <button className={`${cx.btn} ${cx.btnGold}`} disabled={effectiveChecked} onClick={grade}>
            Kiểm tra đáp án
          </button>
          <button className={`${cx.btn} ${cx.btnGhost}`} onClick={resetGroup}>
            Làm lại nhóm này
          </button>
        </div>
      )}
      <div className="flex justify-between mt-3.5">
        <button className={`${cx.btn} ${cx.btnGhost}`} disabled={group === 0} onClick={() => goGroup(group - 1)}>
          ◀ Nhóm trước
        </button>
        <button className={`${cx.btn} ${cx.btnGhost}`} disabled={group === totalGroups - 1} onClick={() => goGroup(group + 1)}>
          Nhóm sau ▶
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Manually verify**

With the dev server running and a set that has more than 20 words (so it
has 3+ groups):
1. Open a normal (non-retest, non-timed) quiz. Confirm the group `<select>`
   and "Đi tới câu số" input replace the old pill-button row.
2. Answer a few questions in group 1, grade it, switch to group 2 via the
   dropdown — confirm group 1's TOC circles stay green/red (not reset) and
   its "Đã chấm" score circle reappears when you navigate back to group 1.
3. Type a question number from a later group into "Đi tới câu số" and
   submit — confirm it jumps to the right group and focuses that question's
   input (fill/verb mode) or scrolls to it (mc mode).
4. Click a TOC circle for an answered-but-ungraded question — confirm it
   navigates + focuses without needing to already be graded.
5. Use the group `<select>` and the "Nhóm trước/sau" buttons — confirm the
   first input of the new group receives focus automatically.
6. From `/review`, click a "Làm lại (Điền từ)" link for a set with wrong
   words — confirm the quiz only contains those words, and that answering
   one correctly and grading removes it from `/review` afterward (still
   present if answered wrong).
7. Run a timed-mode quiz to completion — confirm the whole-set TOC turns
   green/red for every question after "Nộp bài thi", not just the last
   group viewed.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(student)/quiz/[setId]/page.tsx"
git commit -m "feat(quiz): per-group grading, group nav controls, whole-set TOC, autofocus, retest mode"
```

---

### Task 10: Shared `Modal` component

**Files:**
- Create: `src/components/Modal.tsx`

- [ ] **Step 1: Implement**

Create `src/components/Modal.tsx`:

```tsx
"use client";

import { useEffect } from "react";

export default function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 bg-ink/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-[10px] p-5 w-full max-w-2xl max-h-[85vh] overflow-auto shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-serif text-[1.05rem]">{title}</h3>
          <button type="button" onClick={onClose} className="text-muted hover:text-ink text-xl leading-none px-1" aria-label="Đóng">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/Modal.tsx
git commit -m "feat: add shared Modal component"
```

(This task has no standalone manual-verification step — it's exercised in
Task 11.)

---

### Task 11: Admin sets page — add/edit word via popup

**Files:**
- Modify: `src/app/admin/sets/page.tsx`

- [ ] **Step 1: Add the import**

At the top of `src/app/admin/sets/page.tsx`, add:

```ts
import Modal from "@/components/Modal";
```

- [ ] **Step 2: Remove the inline "add word" block, replace with a Modal**

Find this block (the `{showAddWord && ( ... )}` section rendered inside the
`{detail && ( ... )}` block, right after the row of action buttons):

```tsx
          {showAddWord && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-3">
              {detail.type === "irregular_verb" ? (
```

... through its matching closing:

```tsx
              <div className="md:col-span-2">
                <button className={`${cx.btn} ${cx.btnGold}`} onClick={saveWord}>
                  Lưu từ
                </button>
              </div>
            </div>
          )}
```

Replace that entire block with:

```tsx
          {showAddWord && (
            <Modal title="Thêm từ mới" onClose={() => setShowAddWord(false)}>
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
```

- [ ] **Step 3: Remove the inline "editing row" branch, replace with a Modal**

Find the table body's conditional rendering:

```tsx
                {detail.words.map((w) =>
                  editingWordId === w.id ? (
                    <tr key={w.id} className="bg-goldpale/40">
                      <td className={cx.td} colSpan={6}>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 py-2">
```

... through its matching closing:

```tsx
                          <div className="md:col-span-2 flex gap-2">
                            <button className={`${cx.btn} ${cx.btnGold} !px-3 !py-1.5`} onClick={saveEditWord}>
                              Lưu
                            </button>
                            <button className={`${cx.btn} ${cx.btnGhost} !px-3 !py-1.5`} onClick={cancelEditWord}>
                              Huỷ
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    <tr key={w.id}>
```

Replace the whole `detail.words.map((w) => editingWordId === w.id ? (...) : (...))` conditional with a plain, always-read-only row map:

```tsx
                {detail.words.map((w) => (
                  <tr key={w.id}>
```

(Keep the existing read-only `<tr>` body — the columns, the IPA cell, and
the "Sửa"/"Xoá" action buttons — exactly as it already is; only change is
removing the `editingWordId === w.id ? (...) : (` wrapper and its matching
`)` before this `<tr>`, so every row always renders in read-only form.)

Then, immediately after the closing `</table>` `</div>` for the words list
(still inside the `{detail && ( ... )}` block, before that block's own
closing `</div>`), add:

```tsx
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
```

`saveEditWord` already calls `setEditingWordId(null)` on success (existing
code), which closes this modal the same way `cancelEditWord` does.

- [ ] **Step 4: Manually verify**

With the dev server running as an admin:
1. Open a set's detail view, click "+ Thêm từ thủ công" — confirm a popup
   opens centered over the page (not an inline block requiring scroll), fill
   it out, save — confirm the word appears in the table and the popup
   closes.
2. Click "Sửa" on an existing word — confirm a popup opens pre-filled with
   that word's data (not an inline table row), edit a field, save — confirm
   the table updates and the popup closes.
3. Open the edit popup and press `Esc`, and separately click outside the
   popup — confirm both close it without saving.

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/sets/page.tsx
git commit -m "feat(admin): use popup modal for add/edit word instead of inline form"
```

---

### Task 12: Final verification pass

**Files:** none (verification only; fix-forward commits only if issues are found)

- [ ] **Step 1: Run the full automated test suite**

Run: `npm test`
Expected: all tests pass (`gemini.test.ts`, `quizGroups.test.ts`,
`reviewGroups.test.ts`).

- [ ] **Step 2: Run a full manual walkthrough**

With the dev server running, as a student account, walk through the full
flow once end-to-end, using a set with 15+ words:
1. Học bài: mark several cards, leave and return, confirm marks persist;
   jump to a card by number; use arrow keys and space to navigate/flip.
2. Take a normal (non-timed) quiz across 2+ groups, get some answers wrong
   on purpose, grade each group, confirm the whole-set TOC shows the right
   colors for every group simultaneously, and confirm the group `<select>`
   and jump-to-question controls work.
3. Go to `/review`, confirm the wrong words show up grouped by set, retest
   the set, answer everything correctly, confirm those words disappear from
   `/review` afterward.
4. As an admin account, add a new word and edit an existing word via the
   popup modal on `/admin/sets`.

- [ ] **Step 3: Fix any issues found, then do a final commit if needed**

If Step 2 surfaces a bug, fix it in the relevant file from Tasks 1–11 and
commit with a message describing the fix, e.g.:

```bash
git add <fixed files>
git commit -m "fix: <describe the issue found during manual verification>"
```

If nothing was found, no commit is needed for this task.
