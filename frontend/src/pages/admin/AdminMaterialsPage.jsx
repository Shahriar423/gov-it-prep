import { FileText, Search, Trash2, Upload } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { adminFetchSubjects } from "../../api/adminContent.api";
import { deleteMaterial, fetchMaterialOptions, fetchMaterials } from "../../api/adminMaterials.api";
import MaterialUploadModal from "../../components/admin/MaterialUploadModal";
import Badge from "../../components/common/Badge";
import ConfirmDialog from "../../components/common/ConfirmDialog";
import EmptyState from "../../components/common/EmptyState";
import ErrorState from "../../components/common/ErrorState";
import PageHeader from "../../components/common/PageHeader";
import Pagination from "../../components/common/Pagination";
import Skeleton from "../../components/common/Skeleton";
import { useAsyncData } from "../../hooks/useAsyncData";
import { getErrorMessage } from "../../utils/errors";
import { formatDate } from "../../utils/format";
import {
  KIND_LABELS,
  KIND_TONE,
  STATUS_LABELS,
  STATUS_TONE,
  examTagsLabel,
  formatBytes,
} from "../../utils/materialMeta";
import { btnPrimary, btnSecondary, cardClass, inputClass, labelClass } from "../../utils/ui";

const PAGE_SIZE = 20;
const EMPTY_FILTERS = { kind: "", status: "", subjectId: "", exam: "" };

export default function AdminMaterialsPage() {
  const navigate = useNavigate();

  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [searchText, setSearchText] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [uploadOpen, setUploadOpen] = useState(false);

  const params = {
    kind: filters.kind,
    status: filters.status,
    subject_id: filters.subjectId,
    exam: filters.exam,
    q: appliedSearch,
    page,
    page_size: PAGE_SIZE,
  };
  const { data, loading, error, reload } = useAsyncData(
    () => fetchMaterials(params),
    JSON.stringify(params)
  );
  const subjectsState = useAsyncData(adminFetchSubjects, "materials-subjects");
  const optionsState = useAsyncData(fetchMaterialOptions, "materials-options");
  const subjects = subjectsState.data ?? [];
  const options = optionsState.data;

  const [toDelete, setToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const hasFilters = Object.values(filters).some(Boolean) || appliedSearch !== "";
  const needsSubject = !subjectsState.loading && subjects.length === 0;
  const canUpload = Boolean(options) && subjects.length > 0;

  function setFilter(key, value) {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(1);
  }

  function applySearch(e) {
    e.preventDefault();
    setAppliedSearch(searchText.trim());
    setPage(1);
  }

  function clearFilters() {
    setFilters(EMPTY_FILTERS);
    setSearchText("");
    setAppliedSearch("");
    setPage(1);
  }

  async function confirmDelete() {
    setDeleting(true);
    setDeleteError("");
    try {
      await deleteMaterial(toDelete.id);
      setToDelete(null);
      if (data && data.items.length === 1 && page > 1) setPage(page - 1);
      else reload();
    } catch (err) {
      setDeleteError(getErrorMessage(err));
    } finally {
      setDeleting(false);
    }
  }

  const uploadButton = (
    <button type="button" onClick={() => setUploadOpen(true)} disabled={!canUpload} className={btnPrimary}>
      <Upload className="h-4 w-4" aria-hidden="true" />
      Upload PDF
    </button>
  );

  return (
    <div>
      <PageHeader
        title="Source materials"
        description="Upload English, text-based PDFs: study notes and previous-year papers. Their text is extracted and stored for question generation."
        actions={uploadButton}
      />

      {needsSubject && (
        <p className="mb-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Create a subject first. Every material belongs to a subject.{" "}
          <Link to="/admin/subjects" className="font-medium underline">
            Manage subjects
          </Link>
        </p>
      )}
      {optionsState.error && (
        <p role="alert" className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {optionsState.error}
        </p>
      )}

      {/* Filters */}
      <section aria-label="Filters" className={`${cardClass} mb-6 p-4`}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label htmlFor="mf-kind" className={labelClass}>
              Type
            </label>
            <select
              id="mf-kind"
              value={filters.kind}
              onChange={(e) => setFilter("kind", e.target.value)}
              className={`${inputClass} mt-1`}
            >
              <option value="">All types</option>
              {Object.entries(KIND_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="mf-status" className={labelClass}>
              Status
            </label>
            <select
              id="mf-status"
              value={filters.status}
              onChange={(e) => setFilter("status", e.target.value)}
              className={`${inputClass} mt-1`}
            >
              <option value="">All statuses</option>
              {Object.entries(STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="mf-subject" className={labelClass}>
              Subject
            </label>
            <select
              id="mf-subject"
              value={filters.subjectId}
              onChange={(e) => setFilter("subjectId", e.target.value)}
              className={`${inputClass} mt-1`}
            >
              <option value="">All subjects</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="mf-exam" className={labelClass}>
              Recruitment exam
            </label>
            <select
              id="mf-exam"
              value={filters.exam}
              onChange={(e) => setFilter("exam", e.target.value)}
              className={`${inputClass} mt-1`}
            >
              <option value="">All exams</option>
              {(options?.target_exams ?? []).map((exam) => (
                <option key={exam} value={exam}>
                  {exam}
                </option>
              ))}
            </select>
          </div>
        </div>

        <form onSubmit={applySearch} className="mt-4 flex flex-col gap-2 sm:flex-row">
          <div className="flex-1">
            <label htmlFor="mf-search" className="sr-only">
              Search by title
            </label>
            <input
              id="mf-search"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              maxLength={100}
              placeholder="Search by title…"
              className={inputClass}
            />
          </div>
          <button type="submit" className={btnSecondary}>
            <Search className="h-4 w-4" aria-hidden="true" />
            Search
          </button>
          {hasFilters && (
            <button type="button" onClick={clearFilters} className={btnSecondary}>
              Clear filters
            </button>
          )}
        </form>
      </section>

      {loading && (
        <div className="space-y-3" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      )}

      {!loading && error && <ErrorState message={error} onRetry={reload} />}

      {!loading && !error && data && data.items.length === 0 && (
        <div className={cardClass}>
          <EmptyState
            icon={FileText}
            title={hasFilters ? "No materials match these filters" : "No source materials yet"}
            description={
              hasFilters
                ? "Try removing a filter or searching for different text."
                : "Upload your first PDF of study notes or previous-year questions."
            }
            action={hasFilters ? null : uploadButton}
          />
        </div>
      )}

      {!loading && !error && data && data.items.length > 0 && (
        <>
          <p className="mb-3 text-sm text-slate-600">
            {data.total} {data.total === 1 ? "material" : "materials"}
          </p>
          <ul className="space-y-3">
            {data.items.map((m) => (
              <li key={m.id} className={`${cardClass} p-4`}>
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={STATUS_TONE[m.status]}>{STATUS_LABELS[m.status]}</Badge>
                      <Badge tone={KIND_TONE[m.kind] || "slate"}>{KIND_LABELS[m.kind] || m.kind}</Badge>
                      {m.year && <Badge tone="slate">{m.year}</Badge>}
                    </div>
                    <Link
                      to={`/admin/materials/${m.id}`}
                      className="mt-2 block truncate font-semibold text-slate-900 hover:text-blue-700"
                    >
                      {m.title}
                    </Link>
                    <p className="mt-1 text-xs text-slate-500">
                      {m.subject ? m.subject.name : "Subject removed"}
                      {m.chapter ? ` › ${m.chapter.title}` : ""} · {examTagsLabel(m.exam_tags)}
                    </p>
                    {m.status === "ready" && (
                      <p className="mt-1 text-xs text-slate-500">
                        {m.page_count} pages · {m.chunk_count} chunks · {m.word_count.toLocaleString()} words
                      </p>
                    )}
                    {m.status === "failed" && m.error && (
                      <p className="mt-1 line-clamp-2 text-sm text-red-700">{m.error}</p>
                    )}
                    <p className="mt-1 text-xs text-slate-400">
                      {m.original_filename} · {formatBytes(m.file_size_bytes)} · Uploaded{" "}
                      {formatDate(m.created_at)}
                    </p>
                  </div>

                  <div className="flex shrink-0 gap-2">
                    <Link to={`/admin/materials/${m.id}`} className={btnSecondary}>
                      Open
                    </Link>
                    <button
                      type="button"
                      onClick={() => {
                        setDeleteError("");
                        setToDelete(m);
                      }}
                      className={btnSecondary}
                      aria-label={`Delete ${m.title}`}
                    >
                      <Trash2 className="h-4 w-4 text-red-600" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
          <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onChange={setPage} />
        </>
      )}

      {uploadOpen && options && (
        <MaterialUploadModal
          subjects={subjects}
          options={options}
          onClose={() => setUploadOpen(false)}
          onUploaded={(material) => {
            setUploadOpen(false);
            navigate(`/admin/materials/${material.id}`);
          }}
        />
      )}

      {toDelete && (
        <ConfirmDialog
          title="Delete material"
          message={`Delete "${toDelete.title}" and its extracted text? The original PDF is not stored, so you would have to upload it again. This cannot be undone.`}
          busy={deleting}
          error={deleteError}
          onConfirm={confirmDelete}
          onCancel={() => setToDelete(null)}
        />
      )}
    </div>
  );
}