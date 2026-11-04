import { CheckCircle2, ChevronRight, Circle, FileText } from "lucide-react";
import { Link, useParams } from "react-router-dom";

import { fetchSubject } from "../../api/content.api";
import Breadcrumbs from "../../components/common/Breadcrumbs";
import EmptyState from "../../components/common/EmptyState";
import ErrorState from "../../components/common/ErrorState";
import ProgressBar from "../../components/common/ProgressBar";
import Skeleton from "../../components/common/Skeleton";
import { useAsyncData } from "../../hooks/useAsyncData";
import { progressTone } from "../../utils/progress";
import { btnPrimary, cardClass } from "../../utils/ui";

export default function SubjectDetailPage() {
  const { subjectId } = useParams();
  const { data: subject, loading, error, reload } = useAsyncData(
    () => fetchSubject(subjectId),
    subjectId
  );

  if (loading) {
    return (
      <div aria-busy="true" className="space-y-4">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-32" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (error || !subject) {
    return (
      <div>
        <Breadcrumbs items={[{ label: "Subjects", to: "/subjects" }, { label: "Not available" }]} />
        <ErrorState message={error || "Subject not found."} onRetry={reload} />
      </div>
    );
  }

  const nextChapter = subject.chapters.find((c) => !c.is_completed);
  const allDone = subject.chapters_total > 0 && !nextChapter;

  return (
    <div>
      <Breadcrumbs items={[{ label: "Subjects", to: "/subjects" }, { label: subject.name }]} />

      <section className={`${cardClass} p-5 sm:p-6`}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h2 className="text-2xl font-bold tracking-tight text-slate-900">{subject.name}</h2>
            {subject.description && (
              <p className="mt-1 text-sm text-slate-600">{subject.description}</p>
            )}
          </div>
          {nextChapter && (
            <Link to={`/chapters/${nextChapter.id}`} className={`${btnPrimary} shrink-0`}>
              {subject.chapters_completed === 0 ? "Start learning" : "Continue learning"}
            </Link>
          )}
          {allDone && (
            <span className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              All chapters completed
            </span>
          )}
        </div>

        <div className="mt-5">
          <div className="mb-2 flex items-baseline justify-between text-sm">
            <span className="text-slate-600">
              {subject.chapters_completed} of {subject.chapters_total} chapters completed
            </span>
            <span className="font-semibold text-slate-800">{subject.progress_percent}%</span>
          </div>
          <ProgressBar
            value={subject.progress_percent}
            label={`${subject.name} progress`}
            tone={progressTone(subject.progress_percent)}
          />
        </div>
      </section>

      <section className={`${cardClass} mt-6`}>
        <div className="border-b border-slate-100 px-5 py-4">
          <h3 className="font-semibold text-slate-900">Chapters</h3>
        </div>

        {subject.chapters.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No chapters published yet"
            description="Chapters for this subject will appear here once they are published."
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {subject.chapters.map((chapter, index) => (
              <li key={chapter.id}>
                <Link
                  to={`/chapters/${chapter.id}`}
                  className="flex items-center gap-4 px-5 py-4 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-blue-600"
                >
                  {chapter.is_completed ? (
                    <CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-500" aria-label="Completed" />
                  ) : (
                    <Circle className="h-6 w-6 shrink-0 text-slate-300" aria-label="Not completed" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-slate-900">
                      <span className="mr-2 text-slate-400">{index + 1}.</span>
                      {chapter.title}
                    </p>
                    {chapter.summary && (
                      <p className="mt-0.5 line-clamp-2 text-sm text-slate-500">{chapter.summary}</p>
                    )}
                  </div>
                  <ChevronRight className="h-5 w-5 shrink-0 text-slate-400" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}