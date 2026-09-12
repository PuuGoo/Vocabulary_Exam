"use client";

import VocabularyDrillSession from "@/components/VocabularyDrillSession";

export default function PatternPracticePage() {
  return (
    <VocabularyDrillSession
      kind="pattern"
      title="Luyện cấu trúc"
      intro="Điền giới từ / danh động từ còn thiếu trong cấu trúc, hoặc viết lại cả cấu trúc. Nhiều nhóm cấu trúc (phân cách bằng ;) đều được luyện riêng."
      emptyTitle="Bộ từ chưa có cấu trúc"
      emptyDetail="Admin cần thêm pattern (ví dụ: prevent sb from doing sth) hoặc ghi cấu trúc vào cột Loại từ."
    />
  );
}
