import { FileText, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";

import { adminDeleteChapter, adminFetchChapters } from "../../api/adminContent.api";
import Breadcrumbs from "../../components/common/Breadcrumbs";
import ConfirmDialog from "../../components/common/ConfirmDialog";
import EmptyState from "../../components/common/EmptyState";
import ErrorState from "../../components/common/ErrorState";
import PageHeader from "../../components/common/PageHeader";
import Skeleton from "../../components/common/Skeleton";
import { useAsyncData } from "../../hooks/useAsyncData";
import { getErrorMessage } from "../../utils/errors";
import { formatDate } from "../../utils/format";
import { btnPrimary, btnSecondary, cardClass } from "../../utils/ui";

export default function AdminChaptersPage() {
  const { subjectId } = useParams();
  const { data, loading, error, reload } = useAsyncData(
    () => adminFetchChapters(subjectId),
    subjectId
  );

  const [toDelete, setToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  async function confirmDelete() {
    setDeleting(true);
    setDeleteError("");
    try {
      await adminDeleteChapter(toDelete.id);
      setToDelete(null);
      reload();
    } catch (err) {
      setDeleteError(getErrorMessage(err));
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <div aria-busy="true" className="space-y-3">
        <Skeleton className="h-6 w-56" />
        <Skeleton className="h-16" />
        <Skeleton className="h-24" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div>
        <Breadcrumbs items={[{ label: "Admin subjects", to: "/admin/subjects" }, { label: "Not available" }]} />
        <ErrorState message={error || "Subject not found."} onRetry={reload} />
      </div>
    );
  }

  const { subject, chapters } = data;
  const newChapterLink = `/admin/subjects/${subject.id}/chapters/new`;

  return (
    <div>
      <Breadcrumbs
        items={[{ label: "Admin subjects", to: "/admin/subjects" }, { label: subject.name }]}
      />
      <PageHeader
        title={`${subject.name}: chapters`}
        description="Draft chapters are only visible to admins. Publish a chapter to show it to students."
        actions={
          <Link to={newChapterLink} className={btnPrimary}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add chapter
          </Link>
        }
      />

      {chapters.length === 0 ? (
        <div className={cardClass}>
          <EmptyState
            icon={FileText}
            title="No chapters yet"
            description="Write the first chapter for this subject."
            action={
              <Link to={newChapterLink} className={btnPrimary}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                Add chapter
              </Link>
            }
          />
        </div>
      ) : (
        <ul className="space-y-3">
          {chapters.map((chapter) => (
            <li
              key={chapter.id}
              className={`${cardClass} flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between`}
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate font-semibold text-slate-900">{chapter.title}</p>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                      chapter.is_published
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-amber-50 text-amber-700"
                    }`}
                  >
                    {chapter.is_published ? "Published" : "Draft"}
                  </span>
                </div>
                {chapter.summary && (
                  <p className="mt-0.5 line-clamp-2 text-sm text-slate-600">{chapter.summary}</p>
                )}
                <p className="mt-1 text-xs text-slate-500">
                  Order {chapter.order} · Updated {formatDate(chapter.updated_at)}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Link to={`/admin/chapters/${chapter.id}/edit`} className={btnSecondary}>
                  <Pencil className="h-4 w-4" aria-hidden="true" />
                  Edit
                </Link>
                <button
                  type="button"
                  onClick={() => {
                    setDeleteError("");
                    setToDelete(chapter);
                  }}
                  className={btnSecondary}
                  aria-label={`Delete ${chapter.title}`}
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
          title="Delete chapter"
          message={`Delete "${toDelete.title}"? Students' progress for this chapter will also be removed. This cannot be undone.`}
          busy={deleting}
          error={deleteError}
          onConfirm={confirmDelete}
          onCancel={() => setToDelete(null)}
        />
      )}
    </div>
  );
}