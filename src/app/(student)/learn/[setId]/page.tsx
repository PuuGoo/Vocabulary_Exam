"use client";

import { useParams } from "next/navigation";
import LearnExperience from "@/components/learning/LearnExperience";

export default function LearnPage() {
  const params = useParams<{ setId: string }>();
  return <LearnExperience authenticatedSetId={Number(params.setId)} sourceKey={`set:${params.setId}`} />;
}
