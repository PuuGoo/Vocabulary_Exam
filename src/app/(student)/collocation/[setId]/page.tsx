"use client";

import VocabularyDrillSession from "@/components/VocabularyDrillSession";

export default function CollocationPracticePage() {
  return (
    <VocabularyDrillSession
      kind="collocation"
      title="Luyện collocation"
      intro="Điền từ còn thiếu trong cụm, hoặc viết lại cả cụm từ nghĩa tiếng Việt. Đáp án chỉ chấp nhận các dạng đã được biên soạn."
      emptyTitle="Bộ từ chưa có collocation"
      emptyDetail="Admin cần thêm collocation cho các từ trong bộ này (ví dụ: make a decision) trước khi luyện."
    />
  );
}
