import { PenLine, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useState } from "react";

import { adminFetchSubjects } from "../../api/adminContent.api";
import {
  createWrittenQuestion,
  deleteWrittenQuestion,
  fetchWrittenQuestions,
  setWrittenQuestionStatus,
  updateWrittenQuestion,
} from "../../api/adminWritten.api";
import Badge from "../../components/common/Badge";
import ConfirmDialog from "../../components/common/ConfirmDialog";
import EmptyState from "../../components/common/EmptyState";
import ErrorState from "../../components/common/ErrorState";
import Modal from "../../components/common/Modal";
import PageHeader from "../../components/common/PageHeader";
import Pagination from "../../components/common/Pagination";
import Skeleton from "../../components/common/Skeleton";
import SubjectChapterSelect from "../../components/common/SubjectChapterSelect";
import { useAsyncData } from "../../hooks/useAsyncData";
import { getErrorMessage } from "../../utils/errors";
import {
  DIFFICULTIES,
  DIFFICULTY_TONE,
  STATUSES,
  STATUS_TONE,
  labelOf,
} from "../../utils/questionMeta";
import { btnPrimary, btnSecondary, cardClass, inputClass, labelClass } from "../../utils/ui";

const PAGE_SIZE = 20;
const EMPTY_FILTERS = { subjectId: "", chapterId: "", status: "", difficulty: "" };

function WrittenQuestionModal({ subjects, question, onClose, onSaved }) {
  const isEdit = Boolean(question);
  const [subjectId, setSubjectId] = useState(question?.subject.id ?? "");
  const [chapterId, setChapterId] = useState(question?.chapter?.id ?? "");
  const [text, setText] = useState(question?.text ?? "");
  const [difficulty, setDifficulty] = useState(question?.difficulty ?? "medium");
  const [status, setStatus] = useState(question?.status ?? "approved");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (!subjectId) return setError("Please choose a subject.");
    if (text.trim().length < 20) return setError("The question must be at least 20 characters long.");

    const payload = {
      subject_id: subjectId,
      chapter_id: chapterId || null,
      text: text.trim(),
      difficulty,
      status,
    };

    setSaving(true);
    try {
      if (isEdit) await updateWrittenQuestion(question.id, payload);
      else await createWrittenQuestion(payload);
      onSaved();
    } catch (err) {
      setError(getErrorMessage(err));
      setSaving(false);
    }
  }

  return (
    <Modal title={isEdit ? "Edit written question" : "Add written question"} onClose={onClose} closeDisabled={saving}>
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <SubjectChapterSelect
            subjects={subjects}
            subjectId={subjectId}
            chapterId={chapterId}
            idPrefix="wq"
            onChange={(s, c) => {
              setSubjectId(s);
              setChapterId(c);
            }}
          />
        </div>

        <div>
          <label htmlFor="wq-text" className={labelClass}>
            Question
          </label>
          <textarea
            id="wq-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={6}
            maxLength={3000}
            required
            autoFocus={!isEdit}
            placeholder="e.g. Explain the TCP three-way handshake with a diagram, and describe how it differs from UDP."
            className={`${inputClass} mt-1`}
          />
          <p className="mt-1 text-xs text-slate-500">
            Every written question is worth exactly <strong>10 marks</strong>. Write questions that need a full
            answer (explain, compare, describe with examples), not one-line or short-answer questions.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="wq-difficulty" className={labelClass}>
              Difficulty
            </label>
            <select
              id="wq-difficulty"
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value)}
              className={`${inputClass} mt-1`}
            >
              {DIFFICULTIES.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="wq-status" className={labelClass}>
              Status
            </label>
            <select
              id="wq-status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className={`${inputClass} mt-1`}
            >
              {STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-slate-500">Only Approved questions are used in exams.</p>
          </div>
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
            {saving ? "Saving…" : isEdit ? "Save changes" : "Add question"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default function AdminWrittenQuestionsPage() {
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [searchText, setSearchText] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [page, setPage] = useState(1);

  const params = {
    subject_id: filters.subjectId,
    chapter_id: filters.chapterId,
    status: filters.status,
    difficulty: filters.difficulty,
    q: appliedSearch,
    page,
    page_size: PAGE_SIZE,
  };
  const { data, loading, error, reload } = useAsyncData(
    () => fetchWrittenQuestions(params),
    JSON.stringify(params)
  );
  const subjectsState = useAsyncData(adminFetchSubjects, "written-subjects");
  const subjects = subjectsState.data ?? [];

  const [formState, setFormState] = useState(null); // null | { question: null | question }
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
      await setWrittenQuestionStatus(question.id, question.status === "approved" ? "draft" : "approved");
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
      await deleteWrittenQuestion(toDelete.id);
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
    <button
      type="button"
      onClick={() => setFormState({ question: null })}
      disabled={subjects.length === 0}
      className={btnPrimary}
    >
      <Plus className="h-4 w-4" aria-hidden="true" />
      Add written question
    </button>
  );

  return (
    <div>
      <PageHeader
        title="Written questions"
        description="Questions for written exams. Each is worth exactly 10 marks. Only approved questions are used in exams."
        actions={addButton}
      />

      {!subjectsState.loading && subjects.length === 0 && (
        <p className="mb-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Create a subject first (Admin &gt; Exam structure can create the standard ones).
        </p>
      )}

      <section aria-label="Filters" className={`${cardClass} mb-6 p-4`}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <SubjectChapterSelect
            subjects={subjects}
            subjectId={filters.subjectId}
            chapterId={filters.chapterId}
            allowAll
            idPrefix="wf"
            onChange={(subjectId, chapterId) => {
              setFilters((f) => ({ ...f, subjectId, chapterId }));
              setPage(1);
            }}
          />
          <div>
            <label htmlFor="wf-status" className={labelClass}>
              Status
            </label>
            <select
              id="wf-status"
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
            <label htmlFor="wf-difficulty" className={labelClass}>
              Difficulty
            </label>
            <select
              id="wf-difficulty"
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
        </div>

        <form onSubmit={applySearch} className="mt-4 flex flex-col gap-2 sm:flex-row">
          <div className="flex-1">
            <label htmlFor="wf-search" className="sr-only">
              Search question text
            </label>
            <input
              id="wf-search"
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
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      )}

      {!loading && error && <ErrorState message={error} onRetry={reload} />}

      {!loading && !error && data && data.items.length === 0 && (
        <div className={cardClass}>
          <EmptyState
            icon={PenLine}
            title={hasFilters ? "No written questions match these filters" : "No written questions yet"}
            description={
              hasFilters
                ? "Try removing a filter or searching for different text."
                : "Add your first written question. Written exams need approved questions to run."
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
                      <Badge tone="blue">{q.marks} marks</Badge>
                    </div>
                    <p className="mt-2 line-clamp-3 whitespace-pre-line font-medium text-slate-900">{q.text}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {q.subject.name}
                      {q.chapter ? ` › ${q.chapter.title}` : ""}
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
                    <button type="button" onClick={() => setFormState({ question: q })} className={btnSecondary}>
                      <Pencil className="h-4 w-4" aria-hidden="true" />
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDeleteError("");
                        setToDelete(q);
                      }}
                      className={btnSecondary}
                      aria-label="Delete written question"
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

      {formState && (
        <WrittenQuestionModal
          subjects={subjects}
          question={formState.question}
          onClose={() => setFormState(null)}
          onSaved={() => {
            setFormState(null);
            reload();
          }}
        />
      )}

      {toDelete && (
        <ConfirmDialog
          title="Delete written question"
          message="Delete this written question? This cannot be undone."
          busy={deleting}
          error={deleteError}
          onConfirm={confirmDelete}
          onCancel={() => setToDelete(null)}
        />
      )}
    </div>
  );
}