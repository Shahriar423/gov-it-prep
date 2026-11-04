import { Play, RotateCcw, Square } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import {
  fetchPyqMaterial,
  resumeExtraction,
  setPaperType,
  startExtraction,
  stopExtraction,
} from "../../api/adminExtraction.api";
import { getErrorMessage } from "../../utils/errors";
import { formatDate } from "../../utils/format";
import {
  EXTRACTION_REJECTIONS,
  PAPER_TYPE_LABELS,
  PAPER_TYPE_TONE,
  PAUSE_HINTS,
  PIPELINE_LABELS,
  PIPELINE_TONE,
} from "../../utils/extractionMeta";
import { btnPrimary, btnSecondary, cardClass } from "../../utils/ui";
import Badge from "../common/Badge";
import ProgressBar from "../common/ProgressBar";
import Skeleton from "../common/Skeleton";

const POLL_MS = 4000;

function Stat({ label, value }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2">
      <p className="text-xl font-bold text-slate-900">{value}</p>
      <p className="text-xs text-slate-500">{label}</p>
    </div>
  );
}

// Shown on the detail page of a previous-year PDF
export default function ExtractionPanel({ materialId, allowTypeChoice = false }) {
  const [state, setState] = useState({ data: null, loading: true, error: "" });
  const [busy, setBusy] = useState("");
  const [actionError, setActionError] = useState("");

  const load = useCallback(async () => {
    try {
      const data = await fetchPyqMaterial(materialId);
      setState({ data, loading: false, error: "" });
    } catch (err) {
      setState((s) => ({ data: s.data, loading: false, error: getErrorMessage(err) }));
    }
  }, [materialId]);

  useEffect(() => {
    load();
  }, [load]);

  const key = state.data?.pipeline.key;
  const polling = key === "processing" || key === "uploaded";
  useEffect(() => {
    if (!polling) return;
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [polling, load]);

  async function act(name, task) {
    setBusy(name);
    setActionError("");
    try {
      await task();
      await load();
    } catch (err) {
      setActionError(getErrorMessage(err));
    } finally {
      setBusy("");
    }
  }

  const { data, loading, error } = state;
  if (loading) return <Skeleton className="h-64" />;
  if (!data) {
    return (
      <section className={`${cardClass} p-5`}>
        <h3 className="font-semibold text-slate-900">Question extraction</h3>
        <p role="alert" className="mt-2 text-sm text-red-700">
          {error || "Could not load the extraction status."}
        </p>
        <button type="button" onClick={load} className={`${btnSecondary} mt-3`}>
          Try again
        </button>
      </section>
    );
  }

  const { pipeline, counts, progress, job } = data;
  const isWritten = data.paper_type === "written";
  const percent = progress.chunks_total > 0 ? (progress.chunks_done * 100) / progress.chunks_total : 0;
  const rejections = job ? Object.entries(job.rejected_by_reason).sort((a, b) => b[1] - a[1]) : [];
  const retryLabel = pipeline.key === "failed" ? "Retry" : "Resume";
  const reviewPath = isWritten
    ? `/admin/previous-year/${materialId}/written-review`
    : `/admin/previous-year/${materialId}/review`;

  return (
    <section aria-label="Question extraction" className={`${cardClass} p-5`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-semibold text-slate-900">Question extraction</h3>
          <Badge tone={PAPER_TYPE_TONE[data.paper_type] || "slate"}>{PAPER_TYPE_LABELS[data.paper_type]}</Badge>
        </div>
        <Badge tone={PIPELINE_TONE[pipeline.key] || "slate"}>{PIPELINE_LABELS[pipeline.key]}</Badge>
      </div>
      <p className="mt-1 text-sm text-slate-600">
        {isWritten
          ? "The written questions printed in this paper are copied out by fixed rules, with their sub-parts and any printed marks. Nothing is rewritten, and no AI is used. Every extracted question stays pending until you review it. In exams, each written question counts as 10 marks."
          : "The multiple-choice questions printed in this paper are copied out by fixed rules. No AI is used and nothing is guessed: if an answer is not printed, the question has no answer. Every extracted question stays pending until you review it."}
      </p>

      <p
        role={pipeline.key === "failed" ? "alert" : "status"}
        className={`mt-4 rounded-lg px-4 py-3 text-sm ${
          pipeline.key === "failed"
            ? "bg-red-50 text-red-800"
            : pipeline.key === "paused"
            ? "bg-amber-50 text-amber-900"
            : "bg-slate-50 text-slate-700"
        }`}
      >
        {pipeline.message}
        {job?.status === "paused" && PAUSE_HINTS[job.pause_kind] ? ` ${PAUSE_HINTS[job.pause_kind]}` : ""}
      </p>

      {progress.chunks_total > 0 && (
        <div className="mt-5">
          <div className="mb-2 flex items-baseline justify-between text-sm">
            <span className="text-slate-600">
              {progress.chunks_done} of {progress.chunks_total} parts processed
            </span>
            {progress.chunks_failed > 0 && (
              <span className="text-amber-700">{progress.chunks_failed} could not be read</span>
            )}
          </div>
          <ProgressBar
            value={percent}
            label="Parts processed"
            tone={progress.chunks_done === progress.chunks_total ? "green" : "blue"}
          />
        </div>
      )}

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Stat label="Extracted" value={counts.total} />
        <Stat label="Pending" value={counts.pending} />
        <Stat label="Need attention" value={counts.needs_attention} />
        <Stat label="Approved" value={counts.approved} />
        <Stat label="Rejected" value={counts.rejected} />
      </div>

      {(data.detected_exam_name || data.detected_year) && (
        <p className="mt-3 text-sm text-slate-600">
          Found in the PDF:{" "}
          <span className="font-medium text-slate-800">
            {[data.detected_exam_name, data.detected_year].filter(Boolean).join(" · ")}
          </span>
        </p>
      )}

      {allowTypeChoice && data.can_start && counts.total === 0 && !job && (
        <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-medium text-slate-800">What kind of questions are in this PDF?</p>
          <p className="mt-1 text-xs text-slate-600">
            Rule-based extraction only. Nothing is generated or guessed. Results go to the review queue for approval.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy !== ""}
              className={btnPrimary}
              onClick={() =>
                act("start-mcq", async () => {
                  await setPaperType(materialId, "mcq");
                  await startExtraction(materialId);
                })
              }
            >
              <Play className="h-4 w-4" aria-hidden="true" />
              {busy === "start-mcq" ? "Starting…" : "Extract MCQ questions"}
            </button>
            <button
              type="button"
              disabled={busy !== ""}
              className={btnSecondary}
              onClick={() =>
                act("start-written", async () => {
                  await setPaperType(materialId, "written");
                  await startExtraction(materialId);
                })
              }
            >
              <Play className="h-4 w-4" aria-hidden="true" />
              {busy === "start-written" ? "Starting…" : "Extract Written questions"}
            </button>
          </div>
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-2">
        {data.can_start && !(allowTypeChoice && counts.total === 0 && !job) && (
          <button
            type="button"
            onClick={() => act("start", () => startExtraction(materialId))}
            disabled={busy !== ""}
            className={btnPrimary}
          >
            <Play className="h-4 w-4" aria-hidden="true" />
            {busy === "start" ? "Starting…" : "Start extraction"}
          </button>
        )}
        {job?.status === "paused" && data.can_resume && (
          <button
            type="button"
            onClick={() => act("resume", () => resumeExtraction(job.id))}
            disabled={busy !== ""}
            className={btnPrimary}
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" />
            {busy === "resume" ? "Working…" : retryLabel}
          </button>
        )}
        {job?.status === "extracting" && (
          <button
            type="button"
            onClick={() => act("stop", () => stopExtraction(job.id))}
            disabled={busy !== ""}
            className={btnSecondary}
          >
            <Square className="h-4 w-4" aria-hidden="true" />
            {busy === "stop" ? "Stopping…" : "Stop"}
          </button>
        )}
        {counts.total > 0 && (
          <Link to={reviewPath} className={btnSecondary}>
            Review questions ({counts.pending} pending)
          </Link>
        )}
      </div>

      {!data.can_start && !data.can_resume && job?.status !== "extracting" && data.blocked_reason && (
        <p className="mt-3 text-sm text-slate-500">{data.blocked_reason}</p>
      )}
      {actionError && (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {actionError}
        </p>
      )}

      {job && (
        <div className="mt-5 border-t border-slate-100 pt-4 text-sm text-slate-600">
          <p>
            Last run started {formatDate(job.created_at)} · {job.saved} saved · {job.skipped_existing} already stored ·{" "}
            {job.rejected} rejected
            {job.answers_from_key > 0 ? ` · ${job.answers_from_key} answers from the key` : ""}
          </p>
          {rejections.length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer font-medium text-slate-700">Why items were skipped</summary>
              <ul className="mt-2 space-y-1">
                {rejections.map(([reason, count]) => (
                  <li key={reason} className="flex justify-between gap-3">
                    <span>{EXTRACTION_REJECTIONS[reason] || reason}</span>
                    <span className="font-medium">{count}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </section>
  );
}