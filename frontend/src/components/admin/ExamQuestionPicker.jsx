import { ArrowDown, ArrowUp, Plus, Search, X } from "lucide-react";
import { useMemo, useState } from "react";

import { adminFetchSubjects } from "../../api/adminContent.api";
import { adminFetchQuestions } from "../../api/adminQuestions.api";
import { useAsyncData } from "../../hooks/useAsyncData";
import { DIFFICULTIES, DIFFICULTY_TONE, labelOf } from "../../utils/questionMeta";
import { btnSecondary, cardClass, inputClass } from "../../utils/ui";
import Badge from "../common/Badge";
import Pagination from "../common/Pagination";
import Skeleton from "../common/Skeleton";
import SubjectChapterSelect from "../common/SubjectChapterSelect";

const PAGE_SIZE = 20;

function toEntry(q) {
  return {
    id: q.id,
    text: q.text,
    subject_name: q.subject.name,
    difficulty: q.difficulty,
    status: q.status,
  };
}

// selected: [{ id, text, subject_name, difficulty, status }]  (in exam order)
export default function ExamQuestionPicker({ selected, onChange }) {
  const subjectsState = useAsyncData(adminFetchSubjects, "picker-subjects");
  const subjects = subjectsState.data ?? [];

  const [filters, setFilters] = useState({ subjectId: "", chapterId: "" });
  const [searchText, setSearchText] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [page, setPage] = useState(1);

  const params = {
    subject_id: filters.subjectId,
    chapter_id: filters.chapterId,
    status: "approved", // only approved questions can be placed in an exam
    q: appliedSearch,
    page,
    page_size: PAGE_SIZE,
  };
  const { data, loading, error, reload } = useAsyncData(
    () => adminFetchQuestions(params),
    JSON.stringify(params)
  );

  const selectedIds = useMemo(() => new Set(selected.map((q) => q.id)), [selected]);

  function add(question) {
    if (!selectedIds.has(question.id)) onChange([...selected, toEntry(question)]);
  }

  function addAllShown() {
    const fresh = (data?.items ?? []).filter((q) => !selectedIds.has(q.id)).map(toEntry);
    if (fresh.length > 0) onChange([...selected, ...fresh]);
  }

  function remove(id) {
    onChange(selected.filter((q) => q.id !== id));
  }

  function move(index, delta) {
    const target = index + delta;
    if (target < 0 || target >= selected.length) return;
    const next = [...selected];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }

  function applySearch(e) {
    e.preventDefault();
    setAppliedSearch(searchText.trim());
    setPage(1);
  }

  const notApproved = selected.filter((q) => q.status !== "approved").length;
  const freshOnPage = (data?.items ?? []).filter((q) => !selectedIds.has(q.id)).length;

  return (
    <div className="space-y-6">
      {/* Selected questions */}
      <section aria-label="Selected questions">
        <h3 className="font-semibold text-slate-900">Questions in this exam ({selected.length})</h3>

        {notApproved > 0 && (
          <p role="alert" className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
            {notApproved} selected {notApproved === 1 ? "question is" : "questions are"} not approved. Approve{" "}
            {notApproved === 1 ? "it" : "them"} in the Question bank or remove{" "}
            {notApproved === 1 ? "it" : "them"} before publishing.
          </p>
        )}

        {selected.length === 0 ? (
          <p className="mt-2 rounded-lg border border-dashed border-slate-300 px-4 py-6 text-center text-sm text-slate-500">
            No questions added yet. Use the search below to add approved questions.
          </p>
        ) : (
          <ol className="mt-3 divide-y divide-slate-100 rounded-lg border border-slate-200">
            {selected.map((q, i) => (
              <li key={q.id} className="flex items-start gap-3 p-3">
                <span className="w-7 shrink-0 text-sm font-semibold text-slate-500">{i + 1}.</span>
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 whitespace-pre-line text-sm text-slate-900">{q.text}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span>{q.subject_name}</span>
                    <Badge tone={DIFFICULTY_TONE[q.difficulty] || "slate"}>
                      {labelOf(DIFFICULTIES, q.difficulty)}
                    </Badge>
                    {q.status !== "approved" && <Badge tone="amber">Not approved</Badge>}
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    onClick={() => move(i, -1)}
                    disabled={i === 0}
                    aria-label={`Move question ${i + 1} up`}
                    className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30"
                  >
                    <ArrowUp className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(i, 1)}
                    disabled={i === selected.length - 1}
                    aria-label={`Move question ${i + 1} down`}
                    className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-30"
                  >
                    <ArrowDown className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(q.id)}
                    aria-label={`Remove question ${i + 1}`}
                    className="rounded-lg p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600"
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* Question search */}
      <section aria-label="Add questions" className={`${cardClass} p-4`}>
        <h3 className="font-semibold text-slate-900">Add approved questions</h3>

        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <SubjectChapterSelect
            subjects={subjects}
            subjectId={filters.subjectId}
            chapterId={filters.chapterId}
            allowAll
            idPrefix="picker"
            onChange={(subjectId, chapterId) => {
              setFilters({ subjectId, chapterId });
              setPage(1);
            }}
          />
        </div>

        <form onSubmit={applySearch} className="mt-3 flex gap-2">
          <label htmlFor="picker-search" className="sr-only">
            Search question text
          </label>
          <input
            id="picker-search"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            maxLength={100}
            placeholder="Search question text…"
            className={inputClass}
          />
          <button type="submit" className={btnSecondary}>
            <Search className="h-4 w-4" aria-hidden="true" />
            Search
          </button>
        </form>

        {loading && (
          <div className="mt-4 space-y-2" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-14" />
            ))}
          </div>
        )}

        {!loading && error && (
          <p role="alert" className="mt-4 text-sm text-red-700">
            {error}{" "}
            <button type="button" onClick={reload} className="underline">
              Try again
            </button>
          </p>
        )}

        {!loading && !error && data && data.items.length === 0 && (
          <p className="mt-4 text-sm text-slate-500">
            No approved questions match. Approve questions in the Question bank first.
          </p>
        )}

        {!loading && !error && data && data.items.length > 0 && (
          <>
            <div className="mt-4 flex items-center justify-between">
              <p className="text-sm text-slate-600">{data.total} matching</p>
              <button
                type="button"
                onClick={addAllShown}
                disabled={freshOnPage === 0}
                className={btnSecondary}
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                Add all shown ({freshOnPage})
              </button>
            </div>
            <ul className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200">
              {data.items.map((q) => {
                const isSelected = selectedIds.has(q.id);
                return (
                  <li key={q.id} className="flex items-start gap-3 p-3">
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 whitespace-pre-line text-sm text-slate-900">{q.text}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {q.subject.name}
                        {q.chapter ? ` › ${q.chapter.title}` : ""} · {labelOf(DIFFICULTIES, q.difficulty)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => add(q)}
                      disabled={isSelected}
                      className={btnSecondary}
                    >
                      {isSelected ? "Added" : "Add"}
                    </button>
                  </li>
                );
              })}
            </ul>
            <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onChange={setPage} />
          </>
        )}
      </section>
    </div>
  );
}