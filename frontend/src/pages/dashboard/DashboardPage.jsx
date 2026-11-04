import {
  BookOpen,
  Calendar,
  ClipboardCheck,
  Clock,
  Layers,
  RotateCcw,
  TrendingUp,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import EmptyState from "../../components/common/EmptyState";
import ErrorState from "../../components/common/ErrorState";
import ProgressBar from "../../components/common/ProgressBar";
import Skeleton from "../../components/common/Skeleton";
import StatCard from "../../components/common/StatCard";
import { useAuth } from "../../hooks/useAuth";
import { useDashboard } from "../../hooks/useDashboard";
import { formatDate, getFirstName, getGreeting } from "../../utils/format";
import { progressTone } from "../../utils/progress";
import { btnPrimary } from "../../utils/ui";

function scoreBadgeClass(percent) {
  if (percent >= 70) return "bg-emerald-50 text-emerald-700";
  if (percent >= 40) return "bg-amber-50 text-amber-700";
  return "bg-red-50 text-red-700";
}


function useLiveDateTime() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const dateLabel = now.toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const timeLabel = now.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  return { dateLabel, timeLabel, now };
}

function DashboardSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading dashboard">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-36" />
        ))}
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Skeleton className="h-72 lg:col-span-2" />
        <Skeleton className="h-72" />
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const { data, loading, error, reload } = useDashboard();
  const { dateLabel, timeLabel } = useLiveDateTime();

  const stats = data?.stats;
  const subjects = data?.subjects ?? [];
  const recent = data?.recent_attempts ?? [];
  const isAdmin = user?.role === "admin";

  return (
    <div className="space-y-6">
      {/* Header */}
      <section className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">
            {getGreeting()}, {getFirstName(user?.name)}
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            {/* Here is your preparation progress at a glance. */}
          </p>
        </div>
        <div
          className="flex shrink-0 flex-col items-start gap-1 text-sm text-slate-600 sm:items-end"
          aria-live="polite"
        >
          <span className="inline-flex items-center gap-1.5">
            <Calendar className="h-4 w-4 text-blue-600" aria-hidden="true" />
            <span className="font-medium text-slate-800">{dateLabel}</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Clock className="h-4 w-4 text-blue-600" aria-hidden="true" />
            <time className="font-medium tabular-nums text-slate-800">{timeLabel}</time>
          </span>
        </div>
      </section>

      {loading && <DashboardSkeleton />}

      {!loading && error && <ErrorState message={error} onRetry={reload} />}

      {!loading && !error && stats && (
        <>
          {/* Summary cards */}
          <section aria-label="Summary" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              icon={TrendingUp}
              tone="blue"
              label="Overall progress"
              value={`${stats.overall_progress_percent}%`}
              caption={
                stats.chapters_total === 0
                  ? "No chapters published yet"
                  : "Share of all chapters you have completed"
              }
            >
              <ProgressBar
                value={stats.overall_progress_percent}
                label="Overall progress"
                tone={progressTone(stats.overall_progress_percent)}
              />
            </StatCard>

            <StatCard
              icon={BookOpen}
              tone="violet"
              label="Chapters completed"
              value={`${stats.chapters_completed} / ${stats.chapters_total}`}
              caption={`Across ${stats.subjects_count} ${stats.subjects_count === 1 ? "subject" : "subjects"}`}
            />

            <StatCard
              icon={ClipboardCheck}
              tone="green"
              label="Exams taken"
              value={stats.exams_taken}
              caption={
                stats.average_score_percent === null
                  ? "No scored exams yet"
                  : `Average score ${stats.average_score_percent}% (recent exams)`
              }
            />

            <StatCard
              icon={RotateCcw}
              tone="amber"
              label="Weak spots due"
              value={stats.weak_spots_due}
              caption={
                stats.weak_spots_total === 0
                  ? "Wrong answers will appear here for revision"
                  : `${stats.weak_spots_total} in your revision list`
              }
            />
          </section>

          <div className="grid gap-6 lg:grid-cols-3">
            {/* Subject progress */}
            <section className="rounded-xl border border-slate-200 bg-white shadow-sm lg:col-span-2">
              <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
                <div>
                  <h3 className="font-semibold text-slate-900">Subject progress</h3>
                  <p className="text-sm text-slate-500">Chapters completed in each subject</p>
                </div>
                {subjects.length > 0 && (
                  <Link to="/subjects" className="shrink-0 text-sm font-medium text-blue-700 hover:underline">
                    View all
                  </Link>
                )}
              </div>

              {subjects.length === 0 ? (
                <EmptyState
                  icon={Layers}
                  title="No subjects available yet"
                  description={
                    isAdmin
                      ? "Create subjects and chapters in the Admin area."
                      : "Study subjects will appear here as soon as they are published."
                  }
                  action={
                    isAdmin ? (
                      <Link to="/admin/subjects" className={btnPrimary}>
                        Manage subjects
                      </Link>
                    ) : null
                  }
                />
              ) : (
                <ul className="divide-y divide-slate-100">
                  {subjects.map((subject) => (
                    <li key={subject.id}>
                      <Link
                        to={`/subjects/${subject.id}`}
                        className="block px-5 py-4 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-blue-600"
                      >
                        <div className="flex items-baseline justify-between gap-3">
                          <p className="truncate font-medium text-slate-900">{subject.name}</p>
                          <p className="shrink-0 text-sm font-semibold text-slate-700">
                            {subject.chapters_total === 0 ? "—" : `${subject.progress_percent}%`}
                          </p>
                        </div>
                        <div className="mt-2">
                          <ProgressBar
                            value={subject.progress_percent}
                            label={`${subject.name} progress`}
                            tone={progressTone(subject.progress_percent)}
                          />
                        </div>
                        <p className="mt-2 text-xs text-slate-500">
                          {subject.chapters_total === 0
                            ? "No chapters yet"
                            : `${subject.chapters_completed} of ${subject.chapters_total} chapters completed`}
                        </p>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Right column */}
            <div className="space-y-6">
              <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-100 px-5 py-4">
                  <h3 className="font-semibold text-slate-900">Recent exam results</h3>
                </div>

                {recent.length === 0 ? (
                  <EmptyState
                    icon={ClipboardCheck}
                    title="No exams taken yet"
                    description="Your latest scores will be listed here after you submit an exam."
                  />
                ) : (
                  <ul className="divide-y divide-slate-100">
                    {recent.map((attempt) => (
                      <li key={attempt.id}>
                        <Link
                          to={`/exams/attempts/${attempt.id}/result`}
                          className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-blue-600"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-slate-900">{attempt.title}</p>
                            <p className="text-xs text-slate-500">{formatDate(attempt.submitted_at)}</p>
                          </div>
                          <span
                            className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${scoreBadgeClass(attempt.score_percent)}`}
                          >
                            {attempt.score_percent}%
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <h3 className="font-semibold text-slate-900">Revision queue</h3>
                {stats.weak_spots_total === 0 ? (
                  <p className="mt-2 text-sm text-slate-500">
                    Nothing to revise yet. Questions you answer incorrectly will be saved here
                    automatically.
                  </p>
                ) : (
                  <>
                    <p className="mt-2 text-sm text-slate-600">
                      <span className="font-semibold text-slate-900">{stats.weak_spots_due}</span>{" "}
                      {stats.weak_spots_due === 1 ? "question is" : "questions are"} due for revision
                      now, out of {stats.weak_spots_total} saved.
                    </p>
                    <Link to="/weak-spots" className={`${btnPrimary} mt-4`}>
                      {stats.weak_spots_due > 0 ? "Start revision" : "View weak spots"}
                    </Link>
                  </>
                )}
              </section>
            </div>
          </div>
        </>
      )}
    </div>
  );
}