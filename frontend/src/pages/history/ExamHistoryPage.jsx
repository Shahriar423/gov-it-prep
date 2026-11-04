import {
  BarChart3,
  CheckCircle2,
  Clock,
  FileText,
  Filter,
  History,
  PenLine,
  Search,
  Target,
  Timer,
  Trophy,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { fetchExamAnalytics, fetchExamHistory } from "../../api/history.api";
import Badge from "../../components/common/Badge";
import Breadcrumbs from "../../components/common/Breadcrumbs";
import EmptyState from "../../components/common/EmptyState";
import ErrorState from "../../components/common/ErrorState";
import Skeleton from "../../components/common/Skeleton";
import StatCard from "../../components/common/StatCard";
import { formatDate } from "../../utils/format";
import { btnPrimary, btnSecondary, cardClass, inputClass } from "../../utils/ui";

function formatDuration(seconds) {
  if (seconds == null || Number.isNaN(seconds)) return "—";
  const s = Math.max(0, Math.round(seconds));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    return `${h}h ${m % 60}m`;
  }
  return m > 0 ? `${m}m ${rem}s` : `${rem}s`;
}

function statusTone(label) {
  const l = (label || "").toLowerCase();
  if (l.includes("completed") || l.includes("submitted")) return "green";
  if (l.includes("progress")) return "blue";
  if (l.includes("timed") || l.includes("expired")) return "amber";
  if (l.includes("pending")) return "amber";
  return "slate";
}

function scoreTone(percent) {
  if (percent == null) return "slate";
  if (percent >= 70) return "green";
  if (percent >= 40) return "amber";
  return "red";
}

function StatsSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <Skeleton key={i} className="h-28" />
      ))}
    </div>
  );
}

function SummaryStats({ stats, tab }) {
  if (!stats) return <StatsSkeleton />;

  const cards =
    tab === "written"
      ? [
          {
            icon: PenLine,
            tone: "violet",
            label: "Written exams submitted",
            value: stats.total_written_submitted,
            caption:
              stats.written_in_progress > 0
                ? `${stats.written_in_progress} still in progress`
                : "All finished sessions",
          },
          {
            icon: Clock,
            tone: "amber",
            label: "Pending evaluation",
            value: stats.written_pending_evaluation,
            caption: "Written exams are not auto-scored",
          },
          {
            icon: Timer,
            tone: "blue",
            label: "In progress",
            value: stats.written_in_progress,
            caption: "Active written sessions",
          },
        ]
      : [
          {
            icon: CheckCircle2,
            tone: "green",
            label: "MCQ exams completed",
            value: stats.total_mcq_completed,
            caption:
              stats.mcq_in_progress > 0
                ? `${stats.mcq_in_progress} still in progress`
                : "Graded attempts only",
          },
          {
            icon: Target,
            tone: "blue",
            label: "Average MCQ score",
            value:
              stats.average_mcq_score_percent != null
                ? `${stats.average_mcq_score_percent}%`
                : "—",
            caption:
              stats.average_mcq_accuracy_percent != null
                ? `Accuracy ${stats.average_mcq_accuracy_percent}%`
                : "No scored attempts yet",
          },
          {
            icon: Trophy,
            tone: "amber",
            label: "Best MCQ score",
            value:
              stats.best_mcq_score_percent != null
                ? `${stats.best_mcq_score_percent}%`
                : "—",
            caption: "Across all completed MCQ exams",
          },
          {
            icon: Timer,
            tone: "violet",
            label: "Avg. time per MCQ exam",
            value: formatDuration(stats.average_time_seconds_mcq),
            caption: "From start to submission",
          },
          {
            icon: PenLine,
            tone: "slate",
            label: "Written submitted",
            value: stats.total_written_submitted,
            caption: "See Written tab for details",
          },
          {
            icon: Clock,
            tone: "amber",
            label: "Written pending evaluation",
            value: stats.written_pending_evaluation,
            caption: "No automated written scoring yet",
          },
        ];

  return (
    <section aria-label="Summary statistics" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {cards.map((c) => (
        <StatCard
          key={c.label}
          icon={c.icon}
          tone={c.tone}
          label={c.label}
          value={c.value}
          caption={c.caption}
        />
      ))}
    </section>
  );
}

function AttemptCard({ item }) {
  const isMcq = item.exam_type === "mcq";
  const detailTo = isMcq
    ? item.can_view_result
      ? `/exams/attempts/${item.id}/result`
      : item.status === "in_progress"
        ? `/exams/attempts/${item.id}`
        : null
    : `/exams/history/written/${item.id}`;

  return (
    <article className={`${cardClass} p-4 sm:p-5`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-base font-semibold text-slate-900">{item.title}</h3>
            <Badge tone={isMcq ? "blue" : "violet"}>{isMcq ? "MCQ" : "Written"}</Badge>
            <Badge tone={statusTone(item.status_label)}>{item.status_label}</Badge>
          </div>

          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
            {item.submitted_at && <span>Submitted {formatDate(item.submitted_at)}</span>}
            {!item.submitted_at && item.started_at && (
              <span>Started {formatDate(item.started_at)}</span>
            )}
            {item.time_taken_seconds != null && (
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                {formatDuration(item.time_taken_seconds)}
              </span>
            )}
            {item.question_count > 0 && <span>{item.question_count} questions</span>}
            {item.total_marks != null && <span>{item.total_marks} marks</span>}
          </div>

          {(item.subject_names?.length > 0 || item.chapter_titles?.length > 0) && (
            <p className="mt-1.5 text-xs text-slate-500">
              {[...(item.subject_names || []), ...(item.chapter_titles || [])]
                .slice(0, 4)
                .join(" · ")}
            </p>
          )}

          {isMcq && item.score_percent != null && (
            <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
              <span className="font-semibold text-slate-900">
                Score <Badge tone={scoreTone(item.score_percent)}>{item.score_percent}%</Badge>
              </span>
              {item.score != null && item.max_score != null && (
                <span className="text-slate-600">
                  {item.score} / {item.max_score}
                </span>
              )}
              {item.accuracy_percent != null && (
                <span className="text-slate-600">Accuracy {item.accuracy_percent}%</span>
              )}
              <span className="inline-flex items-center gap-1 text-emerald-700">
                <CheckCircle2 className="h-3.5 w-3.5" /> {item.correct ?? 0}
              </span>
              <span className="inline-flex items-center gap-1 text-red-600">
                <XCircle className="h-3.5 w-3.5" /> {item.wrong ?? 0}
              </span>
              <span className="text-slate-500">Unanswered {item.unanswered ?? 0}</span>
            </div>
          )}
        </div>

        <div className="flex shrink-0 flex-wrap gap-2">
          {detailTo && (
            <Link
              to={detailTo}
              className={item.can_view_result || !isMcq ? btnPrimary : btnSecondary}
            >
              {isMcq
                ? item.can_view_result
                  ? "View answer sheet"
                  : "Continue exam"
                : "View details"}
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}

function AnalyticsSection({ data, loading, error, onRetry }) {
  if (loading) {
    return (
      <section className={`${cardClass} p-5`}>
        <Skeleton className="mb-4 h-6 w-48" />
        <Skeleton className="h-40" />
      </section>
    );
  }
  if (error) {
    return <ErrorState message={error} onRetry={onRetry} />;
  }
  if (!data || !data.has_enough_data) {
    return (
      <section className={`${cardClass} p-5`}>
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-blue-600" aria-hidden="true" />
          <h3 className="font-semibold text-slate-900">Performance analytics</h3>
        </div>
        <p className="mt-2 text-sm text-slate-500">
          Complete at least one MCQ exam to see score trends and subject breakdowns.
        </p>
      </section>
    );
  }

  const maxTrend = Math.max(...data.score_trend.map((p) => p.score_percent), 1);
  const totalAns = data.total_correct + data.total_wrong + data.total_unanswered || 1;

  return (
    <section className="space-y-4">
      <div className="flex items-center gap-2">
        <BarChart3 className="h-5 w-5 text-blue-600" aria-hidden="true" />
        <h3 className="text-lg font-semibold text-slate-900">Performance analytics</h3>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className={`${cardClass} p-5`}>
          <h4 className="text-sm font-semibold text-slate-800">MCQ score trend</h4>
          <p className="text-xs text-slate-500">Last {data.score_trend.length} graded attempts</p>
          {data.score_trend.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">No graded MCQ attempts yet.</p>
          ) : (
            <ul className="mt-4 space-y-2">
              {data.score_trend.map((p) => (
                <li key={p.attempt_id} className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="truncate text-slate-700">{p.title}</span>
                      <span className="font-semibold text-slate-900">{p.score_percent}%</span>
                    </div>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-blue-500 transition-all"
                        style={{ width: `${(p.score_percent / maxTrend) * 100}%` }}
                      />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className={`${cardClass} p-5`}>
          <h4 className="text-sm font-semibold text-slate-800">Answer distribution</h4>
          <p className="text-xs text-slate-500">Across all graded MCQ questions</p>
          <div className="mt-4 space-y-3">
            {[
              { label: "Correct", value: data.total_correct, color: "bg-emerald-500" },
              { label: "Incorrect", value: data.total_wrong, color: "bg-red-400" },
              { label: "Unanswered", value: data.total_unanswered, color: "bg-slate-300" },
            ].map((row) => (
              <div key={row.label}>
                <div className="flex justify-between text-xs text-slate-600">
                  <span>{row.label}</span>
                  <span>
                    {row.value} ({Math.round((row.value / totalAns) * 100)}%)
                  </span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={`h-full rounded-full ${row.color}`}
                    style={{ width: `${(row.value / totalAns) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className={`${cardClass} p-5 lg:col-span-2`}>
          <h4 className="text-sm font-semibold text-slate-800">Subject-wise accuracy</h4>
          {data.subject_performance.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">No subject breakdown available yet.</p>
          ) : (
            <ul className="mt-3 divide-y divide-slate-100">
              {data.subject_performance.map((s) => (
                <li key={s.name} className="flex flex-wrap items-center gap-3 py-2.5">
                  <span className="min-w-[8rem] flex-1 text-sm font-medium text-slate-800">
                    {s.name}
                  </span>
                  <span className="text-xs text-slate-500">
                    {s.correct}/{s.questions} correct
                  </span>
                  <div className="h-2 w-28 overflow-hidden rounded-full bg-slate-100 sm:w-40">
                    <div
                      className="h-full rounded-full bg-blue-500"
                      style={{ width: `${Math.min(100, s.accuracy_percent)}%` }}
                    />
                  </div>
                  <span className="w-12 text-right text-sm font-semibold text-slate-900">
                    {s.accuracy_percent}%
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {data.chapter_performance.length > 0 && (
          <div className={`${cardClass} p-5 lg:col-span-2`}>
            <h4 className="text-sm font-semibold text-slate-800">Chapter-wise accuracy</h4>
            <ul className="mt-3 divide-y divide-slate-100">
              {data.chapter_performance.slice(0, 10).map((c) => (
                <li
                  key={`${c.subject_name}-${c.name}`}
                  className="flex flex-wrap items-center gap-3 py-2.5"
                >
                  <div className="min-w-[10rem] flex-1">
                    <p className="text-sm font-medium text-slate-800">{c.name}</p>
                    <p className="text-xs text-slate-500">{c.subject_name}</p>
                  </div>
                  <span className="text-xs text-slate-500">
                    {c.correct}/{c.questions}
                  </span>
                  <div className="h-2 w-28 overflow-hidden rounded-full bg-slate-100 sm:w-40">
                    <div
                      className="h-full rounded-full bg-violet-500"
                      style={{ width: `${Math.min(100, c.accuracy_percent)}%` }}
                    />
                  </div>
                  <span className="w-12 text-right text-sm font-semibold text-slate-900">
                    {c.accuracy_percent}%
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}

export default function ExamHistoryPage() {
  const [tab, setTab] = useState("mcq");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState("newest");
  const [page, setPage] = useState(1);
  const [showFilters, setShowFilters] = useState(false);

  const [listState, setListState] = useState({
    loading: true,
    error: "",
    data: null,
  });
  const [analyticsState, setAnalyticsState] = useState({
    loading: true,
    error: "",
    data: null,
  });

  const pageSize = 15;

  const loadList = useCallback(async () => {
    setListState((s) => ({ ...s, loading: true, error: "" }));
    try {
      const data = await fetchExamHistory({
        exam_type: tab,
        status: status || undefined,
        q: q.trim() || undefined,
        page,
        page_size: pageSize,
        sort,
      });
      setListState({ loading: false, error: "", data });
    } catch (err) {
      setListState({
        loading: false,
        error: err?.response?.data?.detail || err?.message || "Failed to load history",
        data: null,
      });
    }
  }, [tab, status, q, page, sort]);

  const loadAnalytics = useCallback(async () => {
    setAnalyticsState((s) => ({ ...s, loading: true, error: "" }));
    try {
      const data = await fetchExamAnalytics();
      setAnalyticsState({ loading: false, error: "", data });
    } catch (err) {
      setAnalyticsState({
        loading: false,
        error: err?.response?.data?.detail || err?.message || "Failed to load analytics",
        data: null,
      });
    }
  }, []);

  useEffect(() => {
    loadList();
  }, [loadList]);

  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  useEffect(() => {
    setPage(1);
  }, [tab, status, sort]);

  const stats = listState.data?.stats;
  const items = listState.data?.items ?? [];
  const total = listState.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const handleSearch = (e) => {
    e.preventDefault();
    setPage(1);
    loadList();
  };

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: "Dashboard", to: "/dashboard" },
          { label: "Exam history" },
        ]}
      />

      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Exam history</h1>
          <p className="mt-1 text-sm text-slate-600">
            Review past attempts, scores, and performance trends. Only your own attempts are shown.
          </p>
        </div>
      </header>

      <div className="flex gap-1 rounded-lg border border-slate-200 bg-slate-100 p-1 sm:w-fit">
        {[
          { id: "mcq", label: "MCQ history", icon: FileText },
          { id: "written", label: "Written history", icon: PenLine },
        ].map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition ${
              tab === id
                ? "bg-white text-blue-700 shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>

      <SummaryStats stats={stats} tab={tab} />

      <section className={`${cardClass} p-4`}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <form onSubmit={handleSearch} className="flex flex-1 flex-wrap items-center gap-2">
            <div className="relative min-w-[12rem] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search by exam title…"
                className={`${inputClass} pl-9`}
                aria-label="Search attempts"
              />
            </div>
            <button type="submit" className={btnSecondary}>
              Search
            </button>
            <button
              type="button"
              className={btnSecondary}
              onClick={() => setShowFilters((v) => !v)}
              aria-expanded={showFilters}
            >
              <Filter className="h-4 w-4" />
              Filters
            </button>
          </form>

          <div className="flex items-center gap-2">
            <label htmlFor="history-sort" className="text-xs font-medium text-slate-500">
              Sort
            </label>
            <select
              id="history-sort"
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              className={inputClass}
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="score_desc">Highest score</option>
              <option value="score_asc">Lowest score</option>
            </select>
          </div>
        </div>

        {showFilters && (
          <div className="mt-3 flex flex-wrap gap-3 border-t border-slate-100 pt-3">
            <div>
              <label
                htmlFor="history-status"
                className="mb-1 block text-xs font-medium text-slate-500"
              >
                Status
              </label>
              <select
                id="history-status"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className={inputClass}
              >
                <option value="">All statuses</option>
                {tab === "mcq" ? (
                  <>
                    <option value="submitted">Completed</option>
                    <option value="expired">Timed out</option>
                    <option value="in_progress">In progress</option>
                  </>
                ) : (
                  <>
                    <option value="ended">Ended / submitted</option>
                    <option value="in_progress">In progress</option>
                  </>
                )}
              </select>
            </div>
          </div>
        )}
      </section>

      <section aria-label="Attempt list" className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">
            {total} {total === 1 ? "attempt" : "attempts"}
          </h2>
        </div>

        {listState.loading && (
          <div className="space-y-3" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-28" />
            ))}
          </div>
        )}

        {!listState.loading && listState.error && (
          <ErrorState message={listState.error} onRetry={loadList} />
        )}

        {!listState.loading && !listState.error && items.length === 0 && (
          <EmptyState
            icon={History}
            title="No attempts yet"
            description={
              tab === "mcq"
                ? "When you complete an MCQ exam, it will appear here with scores and answer sheets."
                : "When you finish a written exam, the session will be listed here."
            }
            action={
              <Link to="/exams" className={btnPrimary}>
                Go to exams
              </Link>
            }
          />
        )}

        {!listState.loading &&
          !listState.error &&
          items.map((item) => <AttemptCard key={`${item.exam_type}-${item.id}`} item={item} />)}

        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 pt-2">
            <button
              type="button"
              className={btnSecondary}
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </button>
            <span className="text-sm text-slate-600">
              Page {page} of {totalPages}
            </span>
            <button
              type="button"
              className={btnSecondary}
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
            </button>
          </div>
        )}
      </section>

      {tab === "mcq" && (
        <AnalyticsSection
          data={analyticsState.data}
          loading={analyticsState.loading}
          error={analyticsState.error}
          onRetry={loadAnalytics}
        />
      )}
    </div>
  );
}