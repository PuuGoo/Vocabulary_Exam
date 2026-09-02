export const LEARNING_MODE_META = {
  learn: { label: "Học bài" }, fill: { label: "Điền từ" }, mc: { label: "Trắc nghiệm" }, match: { label: "Ghép cặp" }, dictation: { label: "Nghe & viết" }, listen: { label: "Nghe rảnh tay" }, pronunciation: { label: "Luyện phát âm" }, sentence: { label: "Xếp câu" }, timed: { label: "Thi thử tính giờ" }, practice: { label: "Luyện câu hỏi" }, multiple_choice: { label: "Trắc nghiệm" }, speaking: { label: "Speaking" }, shuffle: { label: "Xáo trộn" },
} as const;
export type LearningMode = keyof typeof LEARNING_MODE_META;
