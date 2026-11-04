import { useState } from "react";
import { Link } from "react-router-dom";

import { fetchGeneratedQuestions } from "../../api/adminAi.api";
import { useAsyncData } from "../../hooks/useAsyncData";
import {
  DIFFICULTIES,
  DIFFICULTY_TONE,
  OPTION_LETTERS,
  STATUSES,
  STATUS_TONE,
  labelOf,
} from "../../utils/questionMeta";
import { btnSecondary, cardClass } from "../../utils/ui";
import Badge from "../common/Badge";
import ErrorState from "../common/ErrorState";
import Pagination from "../common/Pagination";
import Skeleton from "../common/Skeleton";

const PAGE_SIZE = 10;

function pageLabel(q) {
  if (q.page_start == null) return "";
  return q.page_start === q.page_end ? `Page ${q.page_start}` : `Pages ${q.page_start}–${q.page_end}`;
}

function QuestionList({ materialId, refreshKey }) {
  const [page, setPage] = useState(1);
  const [token, setToken] = useState(0);
  const { data, loading, error, reload } = useAsyncData(
    () => fetchGeneratedQuestions(materialId, { page, page_size: PAGE_SIZE }),
    `${materialId}:${page}:${refreshKey}:${token}`
  );

  if (loading) {
    return (
      <div className="space-y-3" aria-busy="true">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-32" />
        ))}
      </div>
    );
  }
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data || data.items.length === 0) {
    return <p className="text-sm text-slate-600">No AI-generated questions have been saved from this material yet.</p>;
  }

  return (
    <>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm text-slate-600">{data.total} saved</p>
        <button type="button" onClick={() => setToken((t) => t + 1)} className={btnSecondary}>
          Refresh
        </button>
      </div>

      <ul className="space-y-3">
        {data.items.map((q) => (
          <li key={q.id} className={`${cardClass} p-4`}>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={STATUS_TONE[q.status] || "slate"}>{labelOf(STATUSES, q.status)}</Badge>
              <Badge tone={DIFFICULTY_TONE[q.difficulty] || "slate"}>{labelOf(DIFFICULTIES, q.difficulty)}</Badge>
              {pageLabel(q) && <span className="text-xs text-slate-500">{pageLabel(q)}</span>}
            </div>

            <p className="mt-2 whitespace-pre-line font-medium text-slate-900">{q.text}</p>

            <ul className="mt-3 space-y-1.5">
              {q.options.map((option, i) => (
                <li
                  key={i}
                  className={`flex gap-2 rounded-lg border px-3 py-2 text-sm ${
                    i === q.correct_index
                      ? "border-emerald-300 bg-emerald-50 text-slate-900"
                      : "border-slate-200 bg-white text-slate-700"
                  }`}
                >
                  <span className="font-semibold">{OPTION_LETTERS[i]}.</span>
                  <span className="min-w-0 flex-1 whitespace-pre-wrap break-words">{option}</span>
                  {i === q.correct_index && (
                    <span className="shrink-0 text-xs font-semibold text-emerald-700">Correct</span>
                  )}
                </li>
              ))}
            </ul>

            {q.evidence && (
              <blockquote className="mt-3 border-l-4 border-blue-200 bg-blue-50 px-3 py-2 text-sm text-slate-700">
                <span className="block text-xs font-semibold uppercase tracking-wide text-blue-700">
                  Source text
                </span>
                {q.evidence}
              </blockquote>
            )}
            {q.explanation && (
              <p className="mt-2 text-sm text-slate-600">
                <span className="font-medium text-slate-700">Explanation: </span>
                {q.explanation}
              </p>
            )}

            <p className="mt-3 text-sm">
              <Link to={`/admin/questions/${q.id}/edit`} className="font-medium text-blue-700 hover:underline">
                Edit or change status
              </Link>
            </p>
          </li>
        ))}
      </ul>
      <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onChange={setPage} />
    </>
  );
}

// refreshKey changes when a job finishes, so the list reloads then (not on every progress update)
export default function GeneratedQuestions({ materialId, total, refreshKey }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-6 border-t border-slate-100 pt-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-semibold text-slate-900">Generated questions ({total})</h4>
        <button type="button" onClick={() => setOpen((o) => !o)} className={btnSecondary}>
          {open ? "Hide questions" : "Review generated questions"}
        </button>
      </div>
      {open && (
        <div className="mt-4">
          <QuestionList materialId={materialId} refreshKey={refreshKey} />
        </div>
      )}
    </div>
  );
}