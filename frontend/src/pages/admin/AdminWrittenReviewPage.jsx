import { CheckCircle2, ClipboardCheck, Pencil, RotateCcw, Search, XCircle } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";

import { adminFetchSubjects } from "../../api/adminContent.api";
import {
  approveCleanWritten,
  approveExtractedWritten,
  fetchExtractedWritten,
  fetchPyqMaterial,
  rejectExtractedWritten,
  restoreExtractedWritten,
} from "../../api/adminExtraction.api";
import ExtractedWrittenEditModal from "../../components/admin/ExtractedWrittenEditModal";
import Badge from "../../components/common/Badge";
import Breadcrumbs from "../../components/common/Breadcrumbs";
import ConfirmDialog from "../../components/common/ConfirmDialog";
import EmptyState from "../../components/common/EmptyState";
import ErrorState from "../../components/common/ErrorState";
import Pagination from "../../components/common/Pagination";
import Skeleton from "../../components/common/Skeleton";
import { useAsyncData } from "../../hooks/useAsyncData";
import { FLAG_LABELS } from "../../utils/extractionMeta";
import { getErrorMessage } from "../../utils/errors";
import { DIFFICULTIES, DIFFICULTY_TONE, labelOf } from "../../utils/questionMeta";
import { btnPrimary, btnSecondary, cardClass, inputClass } from "../../utils/ui";

const PAGE_SIZE = 10;

const TABS = [
  { key: "pending", label: "Pending", params: { status: "pending" } },
  { key: "attention", label: "Needs attention", params: { status: "pending", attention: true } },
  { key: "approved", label: "Approved", params: { status: "approved" } },
  { key: "rejected", label: "Rejected", params: { status: "rejected" } },
  { key: "all", label: "All", params: {} },
];

function pageLabel(q) {
  if (q.page_start == null) return "";
  return q.page_start === q.page_end ? `Page ${q.page_start}` : `Pages ${q.page_start}–${q.page_end}`;
}

function QuestionCard({ q, busy, onApprove, onReject, onRestore, onEdit }) {
  const canApprove = q.status !== "approved" && q.problems.length === 0;
  return (
    <li className={`${cardClass} p-4`}>
      <div className="flex flex-wrap items-center gap-2">
        {q.number && <span className="text-sm font-semibold text-slate-700">Q{q.number}</span>}
        <Badge tone={q.status === "approved" ? "green" : q.status === "rejected" ? "red" : "amber"}>
          {q.status === "pending" ? "Pending" : q.status === "approved" ? "Approved" : "Rejected"}
        </Badge>
        <Badge tone={DIFFICULTY_TONE[q.difficulty] || "slate"}>{labelOf(DIFFICULTIES, q.difficulty)}</Badge>
        <Badge tone="slate">
          {q.pdf_marks != null ? `${q.pdf_marks} marks in the PDF` : "Marks not printed"}
        </Badge>
        {pageLabel(q) && <span className="text-xs text-slate-500">{pageLabel(q)}</span>}
        {q.edited && <Badge tone="blue">Edited</Badge>}
      </div>

      {q.stem && <p className="mt-2 whitespace-pre-line font-medium text-slate-900">{q.stem}</p>}

      {q.parts.length > 0 && (
        <ul className="mt-3 space-y-2">
          {q.parts.map((part, i) => (
            <li key={`${part.label}-${i}`} className="flex gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm">
              <span className="font-semibold text-slate-600">({part.label})</span>
              <span className="min-w-0 flex-1 whitespace-pre-line break-words text-slate-800">{part.text}</span>
              {part.marks != null && (
                <span className="shrink-0 text-xs font-semibold text-slate-500">{part.marks} marks</span>
              )}
            </li>
          ))}
        </ul>
      )}

      <p className="mt-2 text-xs text-slate-500">
        {q.subject ? q.subject.name : "No subject"}
        {q.chapter ? ` › ${q.chapter.title}` : ""}
        {q.topic_source === "heading" ? " (from the section heading in the PDF)" : ""}
        {q.exam_name || q.year ? ` · ${[q.exam_name, q.year].filter(Boolean).join(" ")}` : ""}
      </p>

      {q.flags.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2">
          {q.flags.map((flag) => (
            <li key={flag} className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800">
              {FLAG_LABELS[flag] || flag}
            </li>
          ))}
        </ul>
      )}

      {q.duplicate && (
        <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {q.duplicate.kind === "exact" ? "Same question as" : "Very similar to"}{" "}
          {q.duplicate.of_type === "written" ? (
            <Link to="/admin/written-questions" className="font-medium underline">
              “{q.duplicate.of_label}”
            </Link>
          ) : (
            <span className="font-medium">“{q.duplicate.of_label}” (another extracted question)</span>
          )}
          . If it is the same question, reject this one.
        </p>
      )}

      {q.status !== "approved" && q.problems.length > 0 && (
        <ul className="mt-3 list-disc space-y-0.5 pl-5 text-sm text-red-700">
          {q.problems.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      )}
      {q.status === "rejected" && q.reject_reason && (
        <p className="mt-2 text-sm text-slate-500">Rejected: {q.reject_reason}</p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {q.status !== "approved" && (
          <button
            type="button"
            onClick={() => onApprove(q)}
            disabled={busy || !canApprove}
            title={canApprove ? "" : "Fix the problems listed above first"}
            className={btnPrimary}
          >
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
            {busy ? "Working…" : "Approve"}
          </button>
        )}
        {q.status !== "approved" && (
          <button type="button" onClick={() => onEdit(q)} disabled={busy} className={btnSecondary}>
            <Pencil className="h-4 w-4" aria-hidden="true" />
            Edit
          </button>
        )}
        {q.status === "pending" && (
          <button type="button" onClick={() => onReject(q)} disabled={busy} className={btnSecondary}>
            <XCircle className="h-4 w-4 text-red-600" aria-hidden="true" />
            Reject
          </button>
        )}
        {q.status === "rejected" && (
          <button type="button" onClick={() => onRestore(q)} disabled={busy} className={btnSecondary}>
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            Restore to pending
          </button>
        )}
        {q.status === "approved" && (
          <Link to="/admin/written-questions" className={btnSecondary}>
            Open in Written questions
          </Link>
        )}
      </div>
    </li>
  );
}

export default function AdminWrittenReviewPage() {
  const { materialId } = useParams();

  const [tab, setTab] = useState("pending");
  const [searchText, setSearchText] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [token, setToken] = useState(0);

  const tabParams = TABS.find((t) => t.key === tab).params;
  const params = { ...tabParams, q: appliedSearch, page, page_size: PAGE_SIZE };

  const materialState = useAsyncData(() => fetchPyqMaterial(materialId), `written-title:${materialId}`);
  const listState = useAsyncData(
    () => fetchExtractedWritten(materialId, params),
    `${materialId}:${tab}:${appliedSearch}:${page}:${token}`
  );
  const subjectsState = useAsyncData(adminFetchSubjects, "written-review-subjects");
  const subjects = subjectsState.data ?? [];

  const [busyId, setBusyId] = useState("");
  const [message, setMessage] = useState({ type: "", text: "" });
  const [editing, setEditing] = useState(null);
  const [cleanOpen, setCleanOpen] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [cleanError, setCleanError] = useState("");

  const refresh = () => setToken((t) => t + 1);

  async function run(question, task, success) {
    setBusyId(question.id);
    setMessage({ type: "", text: "" });
    try {
      await task();
      if (success) setMessage({ type: "success", text: success });
      refresh();
    } catch (err) {
      setMessage({ type: "error", text: getErrorMessage(err) });
    } finally {
      setBusyId("");
    }
  }

  async function approveClean() {
    setCleaning(true);
    setCleanError("");
    try {
      const result = await approveCleanWritten(materialId);
      setCleanOpen(false);
      setMessage({
        type: "success",
        text: `${result.approved} question${result.approved === 1 ? "" : "s"} approved${
          result.skipped ? `, ${result.skipped} skipped` : ""
        }${result.more ? ". More clean questions remain: run it again." : "."}`,
      });
      refresh();
    } catch (err) {
      setCleanError(getErrorMessage(err));
    } finally {
      setCleaning(false);
    }
  }

  function changeTab(next) {
    setTab(next);
    setPage(1);
  }

  const material = materialState.data;
  const { data, loading, error, reload } = listState;
  const counts = data?.counts;
  const tabCount = {
    pending: counts?.pending,
    attention: counts?.attention,
    approved: counts?.approved,
    rejected: counts?.rejected,
    all: counts ? counts.pending + counts.approved + counts.rejected : undefined,
  };
  const title = material?.title ?? "Previous-year paper";

  return (
    <div className="mx-auto max-w-4xl">
      <Breadcrumbs items={[{ label: "Previous-year papers", to: "/admin/previous-year" }, { label: title }]} />

      <div className="mb-6">
        <h2 className="text-2xl font-bold tracking-tight text-slate-900">Review extracted written questions</h2>
        <p className="mt-1 text-sm text-slate-600">
          {title}. Only approved questions enter the written question bank used by written exams. Check each question
          against the PDF. Marks printed in the PDF are shown for reference: in exams, every written question counts as
          10 marks.
        </p>
      </div>

      <div role="group" aria-label="Filter questions" className="mb-4 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            aria-pressed={tab === t.key}
            onClick={() => changeTab(t.key)}
            className={`rounded-full px-3 py-1.5 text-sm font-medium ${
              tab === t.key ? "bg-blue-600 text-white" : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            {t.label}
            {tabCount[t.key] !== undefined ? ` (${tabCount[t.key]})` : ""}
          </button>
        ))}
      </div>

      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setAppliedSearch(searchText.trim());
            setPage(1);
          }}
          className="flex flex-1 gap-2"
        >
          <label htmlFor="written-review-search" className="sr-only">
            Search question text
          </label>
          <input
            id="written-review-search"
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
        <button type="button" onClick={() => setCleanOpen(true)} className={btnSecondary} disabled={!counts?.pending}>
          <ClipboardCheck className="h-4 w-4" aria-hidden="true" />
          Approve clean questions
        </button>
      </div>

      {message.text && (
        <p
          role={message.type === "error" ? "alert" : "status"}
          className={`mb-4 rounded-lg px-4 py-3 text-sm ${
            message.type === "error" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-800"
          }`}
        >
          {message.text}
        </p>
      )}

      {loading && (
        <div className="space-y-3" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-40" />
          ))}
        </div>
      )}

      {!loading && error && <ErrorState message={error} onRetry={reload} />}

      {!loading && !error && data && data.items.length === 0 && (
        <div className={cardClass}>
          <EmptyState
            icon={ClipboardCheck}
            title="Nothing here"
            description={
              tab === "pending"
                ? "No questions are waiting for review. Extraction may still be running, or every question has been reviewed."
                : "No questions match this view."
            }
          />
        </div>
      )}

      {!loading && !error && data && data.items.length > 0 && (
        <>
          <ul className="space-y-4">
            {data.items.map((q) => (
              <QuestionCard
                key={q.id}
                q={q}
                busy={busyId === q.id}
                onApprove={(item) => run(item, () => approveExtractedWritten(item.id), "Question approved.")}
                onReject={(item) => run(item, () => rejectExtractedWritten(item.id), "Question rejected.")}
                onRestore={(item) => run(item, () => restoreExtractedWritten(item.id), "Question restored to pending.")}
                onEdit={setEditing}
              />
            ))}
          </ul>
          <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onChange={setPage} />
        </>
      )}

      {editing && (
        <ExtractedWrittenEditModal
          question={editing}
          subjects={subjects}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            setMessage({ type: "success", text: "Changes saved." });
            refresh();
          }}
        />
      )}

      {cleanOpen && (
        <ConfirmDialog
          title="Approve clean questions?"
          message="This approves every pending written question that has no warnings, so it can be used in written exams. Questions with warnings or possible duplicates are not touched. Make sure you have looked over them."
          confirmLabel="Approve clean questions"
          confirmTone="primary"
          busy={cleaning}
          error={cleanError}
          onConfirm={approveClean}
          onCancel={() => setCleanOpen(false)}
        />
      )}
    </div>
  );
}