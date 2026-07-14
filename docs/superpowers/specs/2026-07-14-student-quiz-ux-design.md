# Student learn/quiz UX + admin word edit popup — Design

Date: 2026-07-14

## Goal

Address a backlog of student-facing UX gaps in the Học bài (flashcard) and Quiz
flows, plus an admin word-editing UX gap, gathered from user feedback:

1. No way to retest specifically the words a student has gotten wrong.
2. Flashcard known/unknown marks don't persist across visits.
3. No way to jump to an arbitrary flashcard index.
4. No keyboard shortcuts on the flashcard page.
5. Quiz group ("1-10", "11-20", ...) selector is unwieldy with many groups.
6. No whole-set progress/result overview while taking or after submitting a quiz.
7. Focus doesn't move to the first answer box when switching quiz groups.
8. Admin word add/edit form is inline in the page, requiring scrolling.

## Data model changes

Add a new table `word_progress` to `src/db/schema.ts`:

```ts
export const wordProgress = pgTable(
  "word_progress",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    wordId: integer("word_id").notNull().references(() => words.id, { onDelete: "cascade" }),
    known: boolean("known").notNull(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    uniqPair: uniqueIndex("word_progress_user_word_idx").on(table.userId, table.wordId),
  })
);
```

This is distinct from `mistakes`: `mistakes` tracks quiz/flashcard wrong-answer
history used for the "Ôn từ sai" review list; `word_progress` tracks the
student's own self-assessment (❌/✅ button) per word so the flashcard UI can be
restored on revisit, independent of whether that word has ever been wrong in a
graded quiz.

A Drizzle migration will be generated for this table (`drizzle-kit generate`).

## Part 1 — Học bài (flashcard) page

**Persisted known/unknown state**
- `POST /api/mistakes` (the existing "mark known/unknown" endpoint used by the
  flashcard page) additionally upserts into `word_progress` with the same
  `learned` value, alongside its existing `mistakes` insert/delete logic. No
  change to existing `mistakes` semantics or the `/review` page.
- `GET /api/sets/[id]` additionally returns `progress: Record<number, boolean>`
  — the requesting session's `word_progress` rows for that set's words (keyed
  by word id, `true` = known). The Học bài page seeds its `known` state map
  from this on load instead of starting empty. Harmless no-op for admin
  sessions previewing a set, since the admin UI doesn't render this map.

**Jump to any card**
- Add a small number input + "Đi tới" button (and Enter-to-submit) near the
  card counter ("Thẻ N / Total"). Clamps to `[1, total]`, sets `index` and
  resets `flipped`.

**Keyboard shortcuts**
- `ArrowLeft` → `goPrev()`, `ArrowRight` → `goNext()`, `Space` or `Enter` →
  toggle `flipped`. Attached via a `keydown` listener on `window`, ignored
  when the event target is an `input`/`textarea` (so the jump-to-card input
  and any text field keep normal typing behavior). `preventDefault()` on
  Space to avoid page scroll.

## Part 2 — Retest wrong words

**`/review` page restructure**
- Group mistakes by `setId` (client-side `groupBy` over the existing
  `GET /api/mistakes` rows — no API shape change needed since each row already
  carries `setId`/`setName`/`setType`).
- Each set-group renders as a card: "Bộ {setName} — {n} từ sai", the existing
  flippable list of mistake words for that set, and action buttons:
  - "Điền từ" → `/quiz/{setId}?mode=fill&retest=1`
  - "Trắc nghiệm" → `/quiz/{setId}?mode=mc&retest=1` (only when `setType ===
    "ielts_vocab"`)

**Quiz page `retest=1` support**
- After `set` loads, if `retest=1`: call `GET /api/mistakes`, filter to rows
  where `setId` matches, and replace `set.words` (client state) with the
  subset of words whose id is in that filtered list, preserving original
  order. All existing grouping/grading/TOC logic operates unmodified on this
  filtered list.
- If the filtered list is empty (student already cleared all mistakes for
  this set in another tab), show the existing "no words" empty state.

**Closing the loop on grading**
- In `grade()` and `submitTimed()`, when `retest` mode is active: for each
  word answered correctly, additionally call `DELETE /api/mistakes/{id}`
  (need the mistake row id — fetch it once alongside the filtered word list
  when building the retest set, keyed by `wordId`). Wrong answers keep the
  existing increment-via-`POST /api/results` behavior unchanged.

## Part 3 — Quiz page: group navigation, whole-set TOC, autofocus

**Grading state becomes per-group**
- Replace the single `checked`/`groupScore` state with
  `checkedGroups: Record<number, { score: number; total: number }>`.
- `grade()` sets `checkedGroups[group] = { score, total }` instead of the
  single `checked`/`groupScore` state.
- `resetGroup()` deletes `checkedGroups[group]`.
- `effectiveChecked` (used for inline per-word correct/wrong styling) becomes
  `timedMode ? timedSubmitted : group in checkedGroups`.
- `goGroup()` no longer resets grading state on navigation — a group's graded
  state persists as the student moves between groups.

**Group navigation controls** (replacing the pill-button row)
- A `<select>` showing "Nhóm {n}/{totalGroups} (câu {start}-{end})" — changing
  it calls `goGroup`.
- A number input + button/Enter "Đi tới câu số ___" — computes
  `targetGroup = Math.floor((n - 1) / GROUP_SIZE)`, calls `goGroup`, and
  requests focus on that specific word's input (see Autofocus below).
- Existing ◀ Nhóm trước / Nhóm sau ▶ buttons at the bottom are kept as-is.

**Whole-set circle TOC**
- Rendered above the current group's question list, one circle per question
  in the *entire* set (not just the current group), numbered.
- Color rules per word `w` in group `g`:
  - `g` is graded (`g in checkedGroups`, or `timedSubmitted` in timed mode):
    green if `isWordCorrect(w)`, red otherwise.
  - `g` not graded yet: light green if the word has an answer in `answers`,
    else neutral/gray.
- Clicking a circle: `goGroup(groupOfWord)` and requests focus on that word's
  input (fill/verb modes) or scrolls its row into view and briefly highlights
  it (mc mode, since there's no focusable input).

**Autofocus on group change**
- Maintain a `Map<number, HTMLInputElement>` ref (word id → first input of
  that word's row) populated via callback refs on the first input of each
  word row (`term` for fill mode, `v1` for verb mode; not applicable to mc
  mode).
- A `pendingFocus` piece of state holds either a specific word id (from a TOC
  circle click or the "Đi tới câu số" jump) or a sentinel meaning "first word
  in the new group" (from the group `<select>` or Nhóm trước/sau buttons).
- `useEffect` keyed on `[group, currentWords, pendingFocus]` resolves the
  target element from the ref map once the new group's words are rendered,
  calls `.focus()` and `.scrollIntoView({ behavior: "smooth", block: "center"
  })`, then clears `pendingFocus`.

## Part 4 — Admin word add/edit popup

- Add a small reusable `Modal` component (`src/components/Modal.tsx`):
  fixed-position dimmed overlay, centered panel, closes on backdrop click,
  `Esc` key, or an explicit close button. Renders via a portal-less fixed
  `div` (no new deps needed).
- `AdminSetsPage`: the "+ Thêm từ thủ công" button and each row's "Sửa"
  button both open the `Modal` with the existing add/edit form markup moved
  inside it (same fields, same `saveWord`/`saveEditWord` handlers). The
  inline `showAddWord` block and the inline "editing row" `<tr>` are removed;
  the words table becomes read-only display + action buttons only.
- No scroll-then-focus behavior is needed since the form is no longer
  inline — opening the modal is itself the fix for "phải tự kéo xuống".

## API surface summary of changes

- `src/db/schema.ts`: add `wordProgress` table + relations + type export.
  New migration.
- `POST /api/mistakes`: also upsert `word_progress`.
- `GET /api/sets/[id]`: also return `progress` map for the requesting
  student.
- `DELETE /api/mistakes/[id]`: unchanged, reused by retest grading.
- No new routes required — retest reuses `GET /api/mistakes` client-side.

## Out of scope (explicitly deferred, per user answers during brainstorming)

- No changes to the top navigation tab bar (Chọn bộ & làm bài / Ôn từ sai /
  Bảng xếp hạng / Lịch sử) — user confirmed the group-selector fix in Part 3
  covers the actual pain point.
- No visible "X/Y words learned" progress indicator on the `/study` set list
  — Part 1 only restores per-word button state on the flashcard page itself.

## Testing / verification plan

- Manual verification via the `verify` skill / dev server for each part:
  - Học bài: mark a word known/unknown, navigate away and back, confirm
    button state restored; jump-to-card input; arrow keys and space/enter
    shortcuts (and that they don't fire while typing in the jump input).
  - Ôn từ sai: confirm grouping by set, retest buttons, correct answers
    during retest removing the word from the list, wrong answers keeping it.
  - Quiz: many-group set, group `<select>`, jump-to-question input, TOC
    circle colors before/after grading across multiple groups, circle click
    navigation + focus, autofocus on group switch (fill and verb modes).
  - Admin: add word via modal, edit word via modal, confirm table no longer
    expands inline.
