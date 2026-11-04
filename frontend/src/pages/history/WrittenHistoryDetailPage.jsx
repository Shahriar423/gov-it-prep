import { PenLine } from "lucide-react";
import { Link, useParams } from "react-router-dom";

import { fetchWrittenHistoryDetail } from "../../api/history.api";
import Badge from "../../components/common/Badge";
import Breadcrumbs from "../../components/common/Breadcrumbs";
import ErrorState from "../../components/common/ErrorState";
import Skeleton from "../../components/common/Skeleton";
import { useAsyncData } from "../../hooks/useAsyncData";
import { formatDate } from "../../utils/format";
import { btnSecondary, cardClass } from "../../utils/ui";

function formatDuration(seconds) {
  if (seconds == null) return "—";
  const s = Math.max(0, Math.round(seconds));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return m > 0 ? `${m}m ${rem}s` : `${rem}s`;
}

export default function WrittenHistoryDetailPage() {
  const { sessionId } = useParams();
  const { data, loading, error, reload } = useAsyncData(
    () => fetchWrittenHistoryDetail(sessionId),
    sessionId
  );

  if (loading) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-6 w-56" />
        <Skeleton className="h-40" />
        <Skeleton className="h-32" />
      </div>
    );
  }

  if (error) {
    return <ErrorState message={error} onRetry={reload} />;
  }

  if (!data) return null;

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: "Dashboard", to: "/dashboard" },
          { label: "Exam history", to: "/exams/history" },
          { label: data.title || "Written exam" },
        ]}
      />

      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">{data.title}</h1>
            <Badge tone="violet">Written</Badge>
            <Badge tone={data.status === "in_progress" ? "blue" : "green"}>
              {data.status_label}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-slate-600">
            Session details for this written exam attempt.
          </p>
        </div>
        <Link to="/exams/history" className={btnSecondary}>
          Back to history
        </Link>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className={`${cardClass} p-4`}>
          <p className="text-xs font-medium text-slate-500">Questions</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{data.question_count}</p>
        </div>
        <div className={`${cardClass} p-4`}>
          <p className="text-xs font-medium text-slate-500">Total marks</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{data.total_marks}</p>
          <p className="text-xs text-slate-500">{data.marks_per_question} per question</p>
        </div>
        <div className={`${cardClass} p-4`}>
          <p className="text-xs font-medium text-slate-500">Duration allowed</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{data.duration_minutes}m</p>
        </div>
        <div className={`${cardClass} p-4`}>
          <p className="text-xs font-medium text-slate-500">Time taken</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">
            {formatDuration(data.time_taken_seconds)}
          </p>
        </div>
      </section>

      <section className={`${cardClass} p-5`}>
        <h2 className="font-semibold text-slate-900">Session timeline</h2>
        <dl className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <dt className="text-xs font-medium text-slate-500">Started</dt>
            <dd className="text-sm text-slate-800">
              {data.started_at ? formatDate(data.started_at) : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-slate-500">Ended</dt>
            <dd className="text-sm text-slate-800">
              {data.ended_at ? formatDate(data.ended_at) : "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-slate-500">End reason</dt>
            <dd className="text-sm text-slate-800">
              {data.end_reason === "finished_early"
                ? "Finished early"
                : data.end_reason === "time_up"
                  ? "Time up"
                  : data.end_reason || "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium text-slate-500">Evaluation</dt>
            <dd className="text-sm text-slate-800">
              {data.evaluation_status === "pending_evaluation"
                ? "Pending evaluation"
                : "Not applicable"}
            </dd>
          </div>
        </dl>
      </section>

      <section className={`${cardClass} border-amber-200 bg-amber-50/50 p-5`}>
        <div className="flex gap-3">
          <PenLine className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" />
          <div>
            <h2 className="font-semibold text-slate-900">About written exam history</h2>
            <p className="mt-1 text-sm text-slate-700">{data.note}</p>
            <p className="mt-2 text-sm text-slate-600">
              Each written question is worth {data.marks_per_question} marks. There is currently no
              examiner evaluation workflow in the portal, so marks and feedback are not available.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}