"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Legacy route kept for backward compatibility. The "Từ của tôi" workspace now
 * lives at /my-words and is backed by real API data (bookmarks, mistakes, dictionary).
 */
export default function VocabularyVaultRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/my-words");
  }, [router]);
  return (
    <div className="flex min-h-[50vh] items-center justify-center text-sm text-muted">
      Đang chuyển đến "Từ của tôi"...
    </div>
  );
}
