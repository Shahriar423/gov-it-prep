import { ClipboardList } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";

import { fetchBuilder } from "../../api/autoExam.api";
import { fetchExams } from "../../api/exams.api";
import Badge from "../../components/common/Badge";
import EmptyState from "../../components/common/EmptyState";
import ErrorState from "../../components/common/ErrorState";
import PageHeader from "../../components/common/PageHeader";
import Skeleton from "../../components/common/Skeleton";
import ExamBuilder from "../../components/exam/ExamBuilder";
import { useAsyncData } from "../../hooks/useAsyncData";
import { useAuth } from "../../hooks/useAuth";
import { formatDate } from "../../utils/format";
import { progressTone } from "../../utils/progress";
import { formatMinutes, formatScore } from "../../utils/time";
import { btnPrimary, cardClass } from "../../utils/ui";

function percentTone(percent) {
  const tone = progressTone(percent);
  return tone === "green" ? "green" : tone === "blue" ? "blue" : "amber";
}

export default function ExamsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data, loading, error, reload } = useAsyncData(
    () => Promise.all([fetchBuilder(), fetchExams()]),
    "exams-page"
  );

  function openExam(type, id) {
    navigate(type === "mcq" ? `/exams/attempts/${id}` : `/exams/written/${id}`);
  }

  return (
    <div>
      <PageHeader
        title="Exams"
        description="Timed exams from the approved bank. Answers and explanations stay hidden until you submit. Each attempt is saved in your history."
      />

      {loading && (
        <div className="space-y-4" aria-busy="true">
          <Skeleton className="h-96" />
          <Skeleton className="h-40" />
        </div>
      )}

      {!loading && error && <ErrorState message={error} onRetry={reload} />}

      {!loading && !error && data && (() => {
        const [builder, listing] = data;
        const active = builder.active_exam;
        const noQuestions = builder.categories.every((c) => c.mcq_total === 0 && c.written_total === 0);

        return (
          <div className="space-y-8">
            {active && (
              <section
                aria-label="Exam in progress"
                className="flex flex-col gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-semibold text-blue-900">
                    {active.type === "mcq" ? "MCQ exam" : "Written exam"} in progress
                  </p>
                  <p className="text-sm text-blue-800">
                    {active.title} ·{" "}
                    {active.remaining_seconds > 0
                      ? `about ${formatMinutes(Math.max(1, Math.ceil(active.remaining_seconds / 60)))} left`
                      : "time is up"}
                  </p>
                </div>
                <Link
                  to={active.type === "mcq" ? `/exams/attempts/${active.id}` : `/exams/written/${active.id}`}
                  className={btnPrimary}
                >
                  Resume exam
                </Link>
              </section>
            )}

            {noQuestions ? (
              <div className={cardClass}>
                <EmptyState
                  icon={ClipboardList}
                  title="No approved questions yet"
                  description={
                    user?.role === "admin"
                      ? "Add and approve questions in the Question bank (MCQ) or Written questions, and set up the exam structure."
                      : "Exams become available as soon as questions are published."
                  }
                  action={
                    user?.role === "admin" ? (
                      <Link to="/admin/exam-structure" className={btnPrimary}>
                        Open exam structure
                      </Link>
                    ) : null
                  }
                />
              </div>
            ) : (
              <ExamBuilder builder={builder} hasActiveExam={Boolean(active)} onCreated={openExam} />
            )}

            <section aria-label="Recent MCQ results">
              <h3 className="mb-3 font-semibold text-slate-900">Recent MCQ results</h3>
              {listing.history.length === 0 ? (
                <div className={cardClass}>
                  <EmptyState
                    icon={ClipboardList}
                    title="No MCQ results yet"
                    description="Your submitted MCQ exams will be listed here with their scores. Written exams are not scored."
                  />
                </div>
              ) : (
                <ul className={`${cardClass} divide-y divide-slate-100`}>
                  {listing.history.map((h) => (
                    <li key={h.id}>
                      <Link
                        to={`/exams/attempts/${h.id}/result`}
                        className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-blue-600"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-medium text-slate-900">{h.title}</p>
                          <p className="text-xs text-slate-500">
                            {formatDate(h.submitted_at)}
                            {h.timed_out ? " · timed out" : ""}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-3">
                          <span className="text-sm text-slate-600">
                            {formatScore(h.score)} / {h.max_score}
                          </span>
                          <Badge tone={percentTone(h.score_percent)}>{h.score_percent}%</Badge>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        );
      })()}
    </div>
  );
}