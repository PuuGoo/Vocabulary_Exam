export const ASSIGNMENT_MODES = ["fill", "mc", "match", "dictation", "pronunciation", "sentence", "timed"] as const;
export type AssignmentMode = (typeof ASSIGNMENT_MODES)[number];

export const ASSIGNMENT_MODE_LABELS: Record<AssignmentMode, string> = {
  fill: "Điền từ",
  mc: "Trắc nghiệm",
  match: "Ghép cặp",
  dictation: "Nghe & viết",
  pronunciation: "Luyện phát âm",
  sentence: "Xếp câu",
  timed: "Thi tính giờ",
};

export type AttemptForAssignment = {
  setId: number | null;
  mode: string;
  score: number;
  total: number;
  timed: boolean;
  createdAt: Date;
};

export type AssignmentForProgress = {
  setId: number;
  mode: string;
  minScore: number;
  dueAt: Date | null;
  createdAt: Date;
};

export type AssignmentStatus = "pending" | "in_progress" | "overdue" | "completed" | "completed_late" | "excused";

export function modesForSetType(type: string): AssignmentMode[] {
  return type === "irregular_verb"
    ? ["fill", "match", "dictation", "pronunciation", "timed"]
    : ["fill", "mc", "match", "dictation", "pronunciation", "sentence", "timed"];
}

export function attemptMatchesMode(attempt: AttemptForAssignment, assignment: AssignmentForProgress) {
  if (attempt.setId !== assignment.setId || attempt.total <= 0 || attempt.createdAt < assignment.createdAt) return false;
  if (assignment.mode === "timed") return attempt.mode === "fill" && attempt.timed;
  return attempt.mode === assignment.mode && !attempt.timed;
}

export function assignmentProgress(
  assignment: AssignmentForProgress,
  attempts: AttemptForAssignment[],
  now = new Date()
) {
  const matching = attempts.filter((attempt) => attemptMatchesMode(attempt, assignment));
  const withAccuracy = matching.map((attempt) => ({
    attempt,
    accuracy: Math.round((attempt.score / attempt.total) * 1000) / 10,
  }));
  const qualifying = withAccuracy
    .filter((item) => item.accuracy >= assignment.minScore)
    .sort((a, b) => a.attempt.createdAt.getTime() - b.attempt.createdAt.getTime());
  const completedAt = qualifying[0]?.attempt.createdAt || null;
  const bestAccuracy = withAccuracy.length ? Math.max(...withAccuracy.map((item) => item.accuracy)) : null;
  let status: AssignmentStatus;
  if (completedAt) status = assignment.dueAt && completedAt > assignment.dueAt ? "completed_late" : "completed";
  else if (assignment.dueAt && now > assignment.dueAt) status = "overdue";
  else if (matching.length > 0) status = "in_progress";
  else status = "pending";
  return { status, completedAt, bestAccuracy, attemptCount: matching.length };
}

export function assignmentHref(input: { setId: number; mode: string; timeLimitMinutes: number | null }) {
  const setId = input.setId;
  if (input.mode === "mc") return `/quiz/${setId}?mode=mc`;
  if (input.mode === "match") return `/match/${setId}`;
  if (input.mode === "dictation") return `/dictation/${setId}`;
  if (input.mode === "pronunciation") return `/pronunciation/${setId}`;
  if (input.mode === "sentence") return `/sentence/${setId}`;
  if (input.mode === "timed") return `/quiz/${setId}?mode=fill&timed=1&minutes=${input.timeLimitMinutes || 15}`;
  return `/quiz/${setId}?mode=fill`;
}
