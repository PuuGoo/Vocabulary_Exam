import StudyPlannerCard from "@/components/StudyPlannerCard";

export default function StudyPlannerPage({ searchParams }: { searchParams: { googleError?: string } }) {
  return <section className="mx-auto max-w-2xl space-y-5"><h1 className="text-2xl font-bold">Study Planner</h1>{searchParams.googleError && <p role="alert" className="text-red-700">Kết nối Google chưa hoàn tất. Bạn có thể thử kết nối lại.</p>}<StudyPlannerCard setup /></section>;
}
