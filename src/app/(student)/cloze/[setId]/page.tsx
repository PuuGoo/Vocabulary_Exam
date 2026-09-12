"use client";

import VocabularyDrillSession from "@/components/VocabularyDrillSession";

export default function ContextClozePage() {
  return (
    <VocabularyDrillSession
      kind="cloze"
      title="Điền từ trong ngữ cảnh"
      intro="Câu ví dụ có sẵn được che từ cần điền. Chỉ những câu có từ xuất hiện rõ ràng, không mơ hồ mới được dùng làm bài."
      emptyTitle="Bộ từ chưa có câu ví dụ phù hợp"
      emptyDetail="Thêm câu ví dụ chứa đúng từ đó (ví dụ: They had to abandon the project.) để tạo bài điền ngữ cảnh."
    />
  );
}
