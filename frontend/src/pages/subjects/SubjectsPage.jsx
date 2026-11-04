import { BookOpen, Layers } from "lucide-react";
import { useMemo } from "react";
import { Link } from "react-router-dom";

import { fetchSubjects } from "../../api/content.api";
import EmptyState from "../../components/common/EmptyState";
import ErrorState from "../../components/common/ErrorState";
import PageHeader from "../../components/common/PageHeader";
import ProgressBar from "../../components/common/ProgressBar";
import Skeleton from "../../components/common/Skeleton";
import { useAsyncData } from "../../hooks/useAsyncData";
import { useAuth } from "../../hooks/useAuth";
import { progressTone } from "../../utils/progress";
import { btnPrimary } from "../../utils/ui";

/** Preferred display order (case-insensitive). Unknown subjects keep API order after these. */
const SUBJECT_PRIORITY = ["it", "english", "bangla", "general knowledge"];

function sortSubjects(list) {
  if (!Array.isArray(list) || list.length === 0) return list || [];
  const rank = (name) => {
    const key = String(name || "").trim().toLowerCase();
    const idx = SUBJECT_PRIORITY.indexOf(key);
    return idx === -1 ? SUBJECT_PRIORITY.length : idx;
  };
  return [...list].sort((a, b) => {
    const ra = rank(a.name);
    const rb = rank(b.name);
    if (ra !== rb) return ra - rb;
    return String(a.name || "").localeCompare(String(b.name || ""), undefined, { sensitivity: "base" });
  });
}

export default function SubjectsPage() {
  const { user } = useAuth();
  const { data, loading, error, reload } = useAsyncData(fetchSubjects, "subjects");
  const subjects = useMemo(() => sortSubjects(data), [data]);

  return (
    <div>
      <PageHeader
        title="Subjects"
        description="Pick a subject to study its chapters and track your progress."
      />

      {loading && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-48" />
          ))}
        </div>
      )}

      {!loading && error && <ErrorState message={error} onRetry={reload} />}

      {!loading && !error && data && data.length === 0 && (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <EmptyState
            icon={Layers}
            title="No subjects available yet"
            description={
              user?.role === "admin"
                ? "Create your first subject in the Admin area."
                : "Study subjects will appear here as soon as they are published."
            }
            action={
              user?.role === "admin" ? (
                <Link to="/admin/subjects" className={btnPrimary}>
                  Manage subjects
                </Link>
              ) : null
            }
          />
        </div>
      )}

      {!loading && !error && subjects.length > 0 && (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {subjects.map((subject) => (
            <li key={subject.id}>
              <Link
                to={`/subjects/${subject.id}`}
                className="group flex h-full flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-blue-300 hover:shadow-md focus-visible:outline-2 focus-visible:outline-blue-600"
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                    <BookOpen className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <span className="text-sm font-semibold text-slate-700">
                    {subject.chapters_total === 0 ? "—" : `${subject.progress_percent}%`}
                  </span>
                </div>
                <h3 className="mt-4 font-semibold text-slate-900 group-hover:text-blue-700">
                  {subject.name}
                </h3>
                <p className="mt-1 line-clamp-2 text-sm text-slate-600">
                  {subject.description || "No description yet."}
                </p>
                <div className="mt-auto pt-4">
                  <ProgressBar
                    value={subject.progress_percent}
                    label={`${subject.name} progress`}
                    tone={progressTone(subject.progress_percent)}
                  />
                  <p className="mt-2 text-xs text-slate-500">
                    {subject.chapters_total === 0
                      ? "No chapters published yet"
                      : `${subject.chapters_completed} of ${subject.chapters_total} chapters completed`}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}