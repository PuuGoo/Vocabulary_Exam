"use client";

import { useParams } from "next/navigation";
import LearnExperience from "@/components/learning/LearnExperience";

export default function FourStageStudySessionPage() {
  const params = useParams<{ setId: string }>();
  const numericId = Number(params.setId);
  return (
    <LearnExperience
      authenticatedSetId={Number.isFinite(numericId) && numericId > 0 ? numericId : undefined}
      sourceKey={`set:${params.setId}`}
    />
  );
}
