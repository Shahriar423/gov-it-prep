import { HelpCircle, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

import {
  adminDeleteQuestion,
  adminFetchQuestions,
  adminSetQuestionStatus,
} from "../../api/adminQuestions.api";
import { adminFetchSubjects } from "../../api/adminContent.api";
import Badge from "../../components/common/Badge";
import ConfirmDialog from "../../components/common/ConfirmDialog";
import EmptyState from "../../components/common/EmptyState";
import ErrorState from "../../components/common/ErrorState";
import PageHeader from "../../components/common/PageHeader";
import Pagination from "../../components/common/Pagination";
import Skeleton from "../../components/common/Skeleton";
import SubjectChapterSelect from "../../components/common/SubjectChapterSelect";
import { useAsyncData } from "../../hooks/useAsyncData";
import { getErrorMessage } from "../../utils/errors";
import {
  DIFFICULTIES,
  DIFFICULTY_TONE,
  OPTION_LETTERS,
  SOURCES,
  STATUSES,
  STATUS_TONE,
  labelOf,
  sourceTag,
} from "../../utils/questionMeta";
import { btnPrimary, btnSecondary, cardClass, inputClass, labelClass } from "../../utils/ui";

const PAGE_SIZE = 20;
const EMPTY_FILTERS = { subjectId: "", chapterId: "", status: "", source: "", difficulty: "" };

export default function AdminQuestionsPage() {
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [searchText, setSearchText] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [page, setPage] = useState(1);

  const params = {
    subject_id: filters.subjectId,
    chapter_id: filters.chapterId,
    status: filters.status,
    source: filters.source,
    difficulty: filters.difficulty,
    q: appliedSearch,
    page,
    page_size: PAGE_SIZE,
  };

  const { data, loading, error, reload } = useAsyncData(
    () => adminFetchQuestions(params),
    JSON.stringify(params)
  );
  const subjectsState = useAsyncData(adminFetchSubjects, "admin-subjects-for-filters");
  const subjects = subjectsState.data ?? [];

  const [busyId, setBusyId] = useState(null);
  const [actionError, setActionError] = useState("");
  const [toDelete, setToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  const hasFilters = Object.values(filters).some(Boolean) || appliedSearch !== "";

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

  async function toggleStatus(question) {
    setBusyId(question.id);
    setActionError("");
    try {
      await adminSetQuestionStatus(question.id, question.status === "approved" ? "draft" : "approved");
      reload();
    } catch (err) {
      setActionError(getErrorMessage(err));
    } finally {
      setBusyId(null);
    }
  }

  async function confirmDelete() {
    setDeleting(true);
    setDeleteError("");
    try {
      await adminDeleteQuestion(toDelete.id);
      setToDelete(null);
      if (data && data.items.length === 1 && page > 1) setPage(page - 1);
      else reload();
    } catch (err) {
      setDeleteError(getErrorMessage(err));
    } finally {
      setDeleting(false);
    }
  }

  const addButton = (
    <Link to="/admin/questions/new" className={btnPrimary}>
      <Plus className="h-4 w-4" aria-hidden="true" />
      Add question
    </Link>
  );

  return (
    <div>
      <PageHeader
        title="Question bank"
        description="Only approved questions are shown to students in Practice."
        actions={addButton}
      />

      {/* Filters */}
      <section aria-label="Filters" className={`${cardClass} mb-6 p-4`}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <SubjectChapterSelect
            subjects={subjects}
            subjectId={filters.subjectId}
            chapterId={filters.chapterId}
            allowAll
            idPrefix="filter"
            onChange={(subjectId, chapterId) => {
              setFilters((f) => ({ ...f, subjectId, chapterId }));
              setPage(1);
            }}
          />
          <div>
            <label htmlFor="filter-status" className={labelClass}>
              Status
            </label>
            <select
              id="filter-status"
              value={filters.status}
              onChange={(e) => setFilter("status", e.target.value)}
              className={`${inputClass} mt-1`}
            >
              <option value="">All statuses</option>
              {STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="filter-difficulty" className={labelClass}>
              Difficulty
            </label>
            <select
              id="filter-difficulty"
              value={filters.difficulty}
              onChange={(e) => setFilter("difficulty", e.target.value)}
              className={`${inputClass} mt-1`}
            >
              <option value="">Any difficulty</option>
              {DIFFICULTIES.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="filter-source" className={labelClass}>
              Source
            </label>
            <select
              id="filter-source"
              value={filters.source}
              onChange={(e) => setFilter("source", e.target.value)}
              className={`${inputClass} mt-1`}
            >
              <option value="">All sources</option>
              {SOURCES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <form onSubmit={applySearch} className="mt-4 flex flex-col gap-2 sm:flex-row">
          <div className="flex-1">
            <label htmlFor="filter-search" className="sr-only">
              Search question text
            </label>
            <input
              id="filter-search"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              maxLength={100}
              placeholder="Search question text…"
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

      {actionError && (
        <p role="alert" className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {actionError}
        </p>
      )}

      {loading && (
        <div className="space-y-3" aria-busy="true">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      )}

      {!loading && error && <ErrorState message={error} onRetry={reload} />}

      {!loading && !error && data && data.items.length === 0 && (
        <div className={cardClass}>
          <EmptyState
            icon={HelpCircle}
            title={hasFilters ? "No questions match these filters" : "No questions yet"}
            description={
              hasFilters
                ? "Try removing a filter or searching for different text."
                : "Add your first question. Make sure the subject exists first."
            }
            action={hasFilters ? null : addButton}
          />
        </div>
      )}

      {!loading && !error && data && data.items.length > 0 && (
        <>
          <p className="mb-3 text-sm text-slate-600">
            {data.total} {data.total === 1 ? "question" : "questions"}
          </p>
          <ul className="space-y-3">
            {data.items.map((q) => (
              <li key={q.id} className={`${cardClass} p-4`}>
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={STATUS_TONE[q.status] || "slate"}>{labelOf(STATUSES, q.status)}</Badge>
                      <Badge tone={DIFFICULTY_TONE[q.difficulty] || "slate"}>
                        {labelOf(DIFFICULTIES, q.difficulty)}
                      </Badge>
                      <Badge tone="blue">{sourceTag(q)}</Badge>
                    </div>
                    <p className="mt-2 line-clamp-2 whitespace-pre-line font-medium text-slate-900">
                      {q.text}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {q.subject.name}
                      {q.chapter ? ` › ${q.chapter.title}` : ""} · {q.options.length} options · Correct:{" "}
                      {OPTION_LETTERS[q.correct_index]}
                    </p>
                  </div>

                  <div className="flex shrink-0 flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => toggleStatus(q)}
                      disabled={busyId === q.id}
                      className={btnSecondary}
                    >
                      {busyId === q.id ? "Saving…" : q.status === "approved" ? "Move to draft" : "Approve"}
                    </button>
                    <Link to={`/admin/questions/${q.id}/edit`} className={btnSecondary}>
                      <Pencil className="h-4 w-4" aria-hidden="true" />
                      Edit
                    </Link>
                    <button
                      type="button"
                      onClick={() => {
                        setDeleteError("");
                        setToDelete(q);
                      }}
                      className={btnSecondary}
                      aria-label="Delete question"
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

      {toDelete && (
        <ConfirmDialog
          title="Delete question"
          message="Delete this question? Any weak-spot entries students have saved for it will also be removed. This cannot be undone."
          busy={deleting}
          error={deleteError}
          onConfirm={confirmDelete}
          onCancel={() => setToDelete(null)}
        />
      )}
    </div>
  );
}