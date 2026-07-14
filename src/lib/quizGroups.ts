export function groupIndexForQuestion(questionNumber: number, groupSize: number): number {
  return Math.floor((questionNumber - 1) / groupSize);
}

export type CircleStatus = "empty" | "answered" | "correct" | "wrong";

export function circleStatus(graded: boolean, answered: boolean, correct: boolean): CircleStatus {
  if (graded) return correct ? "correct" : "wrong";
  return answered ? "answered" : "empty";
}
