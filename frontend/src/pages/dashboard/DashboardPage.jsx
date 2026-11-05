import {
  BookOpen,
  Calendar,
  ClipboardCheck,
  Clock,
  Layers,
  ListChecks,
  RotateCcw,
  Timer,
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

// A short, useful sentence under the greeting
function subtitleFor(stats) {
  if (!stats) return "Here is your preparation progress at a glance.";
  if (stats.weak_spots_due > 0) {
    const n = stats.weak_spots_due;
    return `You have ${n} ${n === 1 ? "question" : "questions"} due for revision. A quick review now keeps them fresh.`;
  }
  if (stats.chapters_total > 0 && stats.chapters_completed === 0) {
    return "Pick a subject and complete your first chapter to start tracking your progress.";
  }
  if (stats.chapters_total > 0 && stats.chapters_completed < stats.chapters_total) {
    return `You have completed ${stats.chapters_completed} of ${stats.chapters_total} chapters. Keep going!`;
  }
  return "Here is your preparation progress at a glance.";
}

// The clock updates only itself, so the rest of the dashboard is not redrawn every second
function LiveClock() {
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

  return (
    <div
      className="flex shrink-0 flex-col gap-1.5 rounded-xl bg-white/15 px-4 py-3 text-sm ring-1 ring-white/25 backdrop-blur"
      aria-live="off"
    >
      <span className="inline-flex items-center gap-2">
        <Calendar className="h-4 w-4 text-purple-100" aria-hidden="true" />
        <span className="font-medium">{dateLabel}</span>
      </span>
      <span className="inline-flex items-center gap-2">
        <Clock className="h-4 w-4 text-purple-100" aria-hidden="true" />
        <time className="font-medium tabular-nums">{timeLabel}</time>
      </span>
    </div>
  );
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

const PRIMARY_PILL =
  "inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-purple-700 shadow-sm transition hover:bg-purple-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white";
const SECONDARY_PILL =
  "inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-2 text-sm font-semibold text-white ring-1 ring-white/30 transition hover:bg-white/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white";

export default function DashboardPage() {
  const { user } = useAuth();
  const { data, loading, error, reload } = useDashboard();

  const stats = data?.stats;
  const subjects = data?.subjects ?? [];
  const recent = data?.recent_attempts ?? [];
  const isAdmin = user?.role === "admin";
  const dueCount = stats?.weak_spots_due ?? 0;

  return (
    <div className="space-y-6">
      {/* Welcome banner */}
      <section className="relative overflow-hidden rounded-2xl bg-linear-to-br from-purple-700 via-purple-600 to-pink-500 p-6 text-white shadow-lg shadow-purple-500/20 sm:p-8">
        <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/10" aria-hidden="true" />
        <div className="pointer-events-none absolute -bottom-24 right-28 h-64 w-64 rounded-full bg-white/10" aria-hidden="true" />

        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
              {getGreeting()}, {getFirstName(user?.name)}
            </h2>
            <p className="mt-2 max-w-xl text-sm text-purple-100 sm:text-base">{subtitleFor(stats)}</p>

            <div className="mt-5 flex flex-wrap gap-2">
              <Link to="/practice" className={PRIMARY_PILL}>
                <ListChecks className="h-4 w-4" aria-hidden="true" />
                Start practice
              </Link>
              <Link to="/exams" className={SECONDARY_PILL}>
                <Timer className="h-4 w-4" aria-hidden="true" />
                Take an exam
              </Link>
              <Link to="/weak-spots" className={SECONDARY_PILL}>
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                {dueCount > 0 ? `Revise weak spots (${dueCount})` : "Weak spots"}
              </Link>
            </div>
          </div>

          <LiveClock />
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
            <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm lg:col-span-2">
              <div className="flex items-start justify-between gap-3 border-b border-slate-100 bg-linear-to-r from-purple-50/70 to-transparent px-5 py-4">
                <div>
                  <h3 className="font-semibold text-slate-900">Subject progress</h3>
                  <p className="text-sm text-slate-500">Chapters completed in each subject</p>
                </div>
                {subjects.length > 0 && (
                  <Link to="/subjects" className="shrink-0 text-sm font-semibold text-purple-700 hover:underline">
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
                        className="block px-5 py-4 transition hover:bg-purple-50/50 focus-visible:outline-2 focus-visible:outline-purple-600"
                      >
                        <div className="flex items-baseline justify-between gap-3">
                          <p className="truncate font-medium text-slate-900">{subject.name}</p>
                          <p className="shrink-0 text-sm font-semibold text-purple-700">
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
              <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-100 bg-linear-to-r from-purple-50/70 to-transparent px-5 py-4">
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
                          className="flex items-center justify-between gap-3 px-5 py-3 transition hover:bg-purple-50/50 focus-visible:outline-2 focus-visible:outline-purple-600"
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