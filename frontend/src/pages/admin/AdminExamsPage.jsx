import { ClipboardList, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

import { adminDeleteExam, adminFetchExams } from "../../api/adminExams.api";
import Badge from "../../components/common/Badge";
import ConfirmDialog from "../../components/common/ConfirmDialog";
import EmptyState from "../../components/common/EmptyState";
import ErrorState from "../../components/common/ErrorState";
import PageHeader from "../../components/common/PageHeader";
import Skeleton from "../../components/common/Skeleton";
import { useAsyncData } from "../../hooks/useAsyncData";
import { getErrorMessage } from "../../utils/errors";
import { formatDate } from "../../utils/format";
import { formatMinutes, formatNegative } from "../../utils/time";
import { btnPrimary, btnSecondary, cardClass } from "../../utils/ui";

export default function AdminExamsPage() {
  const { data, loading, error, reload } = useAsyncData(adminFetchExams, "admin-exams");

  const [toDelete, setToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  async function confirmDelete() {
    setDeleting(true);
    setDeleteError("");
    try {
      await adminDeleteExam(toDelete.id);
      setToDelete(null);
      reload();
    } catch (err) {
      setDeleteError(getErrorMessage(err));
    } finally {
      setDeleting(false);
    }
  }

  const addButton = (
    <Link to="/admin/exams/new" className={btnPrimary}>
      <Plus className="h-4 w-4" aria-hidden="true" />
      New mock paper
    </Link>
  );

  return (
    <div>
      <PageHeader
        title="Mock exam papers"
        description="Build timed papers from approved questions. Only published papers are visible to students."
        actions={addButton}
      />

      {loading && (
        <div className="space-y-3" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      )}

      {!loading && error && <ErrorState message={error} onRetry={reload} />}

      {!loading && !error && data && data.length === 0 && (
        <div className={cardClass}>
          <EmptyState
            icon={ClipboardList}
            title="No mock papers yet"
            description="Create a paper, add approved questions, and publish it for students."
            action={addButton}
          />
        </div>
      )}

      {!loading && !error && data && data.length > 0 && (
        <ul className="space-y-3">
          {data.map((exam) => (
            <li
              key={exam.id}
              className={`${cardClass} flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between`}
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate font-semibold text-slate-900">{exam.title}</p>
                  <Badge tone={exam.status === "published" ? "green" : "amber"}>
                    {exam.status === "published" ? "Published" : "Draft"}
                  </Badge>
                </div>
                {exam.description && (
                  <p className="mt-0.5 line-clamp-2 text-sm text-slate-600">{exam.description}</p>
                )}
                <p className="mt-1 text-xs text-slate-500">
                  {exam.question_count} {exam.question_count === 1 ? "question" : "questions"} ·{" "}
                  {formatMinutes(exam.duration_minutes)} · {formatNegative(exam.negative_marking)} · Updated{" "}
                  {formatDate(exam.updated_at)}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Link to={`/admin/exams/${exam.id}/edit`} className={btnSecondary}>
                  <Pencil className="h-4 w-4" aria-hidden="true" />
                  Edit
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    setDeleteError("");
                    setToDelete(exam);
                  }}
                  className={btnSecondary}
                  aria-label={`Delete ${exam.title}`}
                >
                  <Trash2 className="h-4 w-4 text-red-600" aria-hidden="true" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {toDelete && (
        <ConfirmDialog
          title="Delete mock paper"
          message={`Delete "${toDelete.title}"? Students' past results for this paper are kept. This cannot be undone.`}
          busy={deleting}
          error={deleteError}
          onConfirm={confirmDelete}
          onCancel={() => setToDelete(null)}
        />
      )}
    </div>
  );
}