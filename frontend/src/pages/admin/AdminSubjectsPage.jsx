import { Layers, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

import {
  adminCreateSubject,
  adminDeleteSubject,
  adminFetchSubjects,
  adminUpdateSubject,
} from "../../api/adminContent.api";
import ConfirmDialog from "../../components/common/ConfirmDialog";
import EmptyState from "../../components/common/EmptyState";
import ErrorState from "../../components/common/ErrorState";
import Modal from "../../components/common/Modal";
import PageHeader from "../../components/common/PageHeader";
import Skeleton from "../../components/common/Skeleton";
import { useAsyncData } from "../../hooks/useAsyncData";
import { getErrorMessage } from "../../utils/errors";
import { btnPrimary, btnSecondary, cardClass, inputClass, labelClass } from "../../utils/ui";

function SubjectFormModal({ subject, onClose, onSaved }) {
  const isEdit = Boolean(subject);
  const [name, setName] = useState(subject?.name ?? "");
  const [description, setDescription] = useState(subject?.description ?? "");
  const [order, setOrder] = useState(subject ? String(subject.order) : "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    const payload = {
      name: name.trim(),
      description: description.trim(),
      order: order === "" ? null : Number(order),
    };
    if (payload.name.length < 2) return setError("Subject name must be at least 2 characters.");
    if (payload.order !== null && (!Number.isInteger(payload.order) || payload.order < 0)) {
      return setError("Order must be a whole number, 0 or higher.");
    }

    setSaving(true);
    try {
      if (isEdit) await adminUpdateSubject(subject.id, payload);
      else await adminCreateSubject(payload);
      onSaved();
    } catch (err) {
      setError(getErrorMessage(err));
      setSaving(false);
    }
  }

  return (
    <Modal title={isEdit ? "Edit subject" : "Add subject"} onClose={onClose} closeDisabled={saving}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="subjectName" className={labelClass}>
            Name
          </label>
          <input
            id="subjectName"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            autoFocus
            required
            placeholder="e.g. Computer Networking"
            className={`${inputClass} mt-1`}
          />
        </div>
        <div>
          <label htmlFor="subjectDescription" className={labelClass}>
            Description <span className="font-normal text-slate-500">(optional)</span>
          </label>
          <textarea
            id="subjectDescription"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={500}
            rows={3}
            className={`${inputClass} mt-1`}
          />
        </div>
        <div>
          <label htmlFor="subjectOrder" className={labelClass}>
            Order <span className="font-normal text-slate-500">(optional)</span>
          </label>
          <input
            id="subjectOrder"
            type="number"
            min={0}
            value={order}
            onChange={(e) => setOrder(e.target.value)}
            className={`${inputClass} mt-1`}
          />
          <p className="mt-1 text-xs text-slate-500">
            Lower numbers appear first. Leave empty to add it at the end.
          </p>
        </div>

        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} disabled={saving} className={btnSecondary}>
            Cancel
          </button>
          <button type="submit" disabled={saving} className={btnPrimary}>
            {saving ? "Saving…" : isEdit ? "Save changes" : "Add subject"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default function AdminSubjectsPage() {
  const { data, loading, error, reload } = useAsyncData(adminFetchSubjects, "admin-subjects");

  const [formState, setFormState] = useState(null); // null | { subject: null | subject }
  const [toDelete, setToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  async function confirmDelete() {
    setDeleting(true);
    setDeleteError("");
    try {
      await adminDeleteSubject(toDelete.id);
      setToDelete(null);
      reload();
    } catch (err) {
      setDeleteError(getErrorMessage(err));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Subjects"
        description="Create subjects, then add chapters inside them."
        actions={
          <button type="button" onClick={() => setFormState({ subject: null })} className={btnPrimary}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Add subject
          </button>
        }
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
            icon={Layers}
            title="No subjects yet"
            description="Add your first subject, for example Networking, SQL, or Operating Systems."
            action={
              <button type="button" onClick={() => setFormState({ subject: null })} className={btnPrimary}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                Add subject
              </button>
            }
          />
        </div>
      )}

      {!loading && !error && data && data.length > 0 && (
        <ul className="space-y-3">
          {data.map((subject) => (
            <li
              key={subject.id}
              className={`${cardClass} flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between`}
            >
              <div className="min-w-0">
                <p className="truncate font-semibold text-slate-900">{subject.name}</p>
                {subject.description && (
                  <p className="mt-0.5 line-clamp-2 text-sm text-slate-600">{subject.description}</p>
                )}
                <p className="mt-1 text-xs text-slate-500">
                  Order {subject.order} · {subject.chapters_total}{" "}
                  {subject.chapters_total === 1 ? "chapter" : "chapters"} ({subject.chapters_published}{" "}
                  published)
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <Link to={`/admin/subjects/${subject.id}/chapters`} className={btnPrimary}>
                  Manage chapters
                </Link>
                <button
                  type="button"
                  onClick={() => setFormState({ subject })}
                  className={btnSecondary}
                  aria-label={`Edit ${subject.name}`}
                >
                  <Pencil className="h-4 w-4" aria-hidden="true" />
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDeleteError("");
                    setToDelete(subject);
                  }}
                  className={btnSecondary}
                  aria-label={`Delete ${subject.name}`}
                >
                  <Trash2 className="h-4 w-4 text-red-600" aria-hidden="true" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {formState && (
        <SubjectFormModal
          subject={formState.subject}
          onClose={() => setFormState(null)}
          onSaved={() => {
            setFormState(null);
            reload();
          }}
        />
      )}

      {toDelete && (
        <ConfirmDialog
          title="Delete subject"
          message={`Delete "${toDelete.name}"? This cannot be undone. A subject that still has chapters cannot be deleted.`}
          busy={deleting}
          error={deleteError}
          onConfirm={confirmDelete}
          onCancel={() => setToDelete(null)}
        />
      )}
    </div>
  );
}