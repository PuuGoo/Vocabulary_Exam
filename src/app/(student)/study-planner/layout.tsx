import { getSession } from "@/lib/auth";
import { loadPlannerConnectionForUser } from "@/lib/studyPlanner/queries";
import StudyPlannerNav from "@/components/StudyPlannerNav";
import StudyPlannerRevisionPoller from "@/components/StudyPlannerRevisionPoller";
import PlannerSyncIndicator from "@/components/planner/PlannerSyncIndicator";

/**
 * Phase 6/8 — Shared Study Planner application shell.
 *
 * Holds the sub-navigation for the 13 planner routes and mounts the revision
 * poller, which only *observes* the planner revision: the Drive webhook and
 * the reconcile cron perform synchronization, never the browser.
 */
export const dynamic = "force-dynamic";

export default async function StudyPlannerLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  const connection = session ? await loadPlannerConnectionForUser(session.userId) : null;
  return (
    <div className="mx-auto w-full max-w-6xl space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <StudyPlannerNav connected={Boolean(connection)} />
        {connection ? (
          <div className="flex items-center gap-2 pt-3">
            <PlannerSyncIndicator />
            <StudyPlannerRevisionPoller />
          </div>
        ) : null}
      </div>
      {children}
    </div>
  );
}
