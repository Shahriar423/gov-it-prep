import { Play, RotateCcw, Square } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import {
  fetchGenerationOverview,
  resumeGenerationJob,
  startMcqGeneration,
  stopGenerationJob,
  testAiConnection,
} from "../../api/adminAi.api";
import { getErrorMessage } from "../../utils/errors";
import { formatDate } from "../../utils/format";
import { btnPrimary, btnSecondary, cardClass, inputClass, labelClass } from "../../utils/ui";
import Badge from "../common/Badge";
import ProgressBar from "../common/ProgressBar";
import Skeleton from "../common/Skeleton";
import GeneratedQuestions from "./GeneratedQuestions";

const POLL_MS = 3000;

const JOB_TONE = { running: "blue", paused: "amber", completed: "green" };
const JOB_LABEL = { running: "Running", paused: "Paused", completed: "Completed" };

const REJECTION_LABELS = {
  malformed: "Malformed answer from the AI",
  bad_question: "Question too short or too long",
  bad_options: "Invalid options (wrong count, duplicates, or “all of the above”)",
  bad_answer: "No valid correct answer given",
  refers_to_passage: "Referred to the source text",
  no_evidence: "No supporting evidence given",
  evidence_not_in_passage: "Evidence not found in the source text",
  no_explanation: "No explanation given",
  no_verdict: "The checker gave no verdict",
  ambiguous: "The checker found it ambiguous",
  not_answerable: "The checker could not answer it from the text",
  verification_disagreed: "The checker chose a different answer",
  duplicate: "Duplicate of an existing question",
};

function Stat({ label, value }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2">
      <p className="text-xl font-bold text-slate-900">{value}</p>
      <p className="text-xs text-slate-500">{label}</p>
    </div>
  );
}

export default function GenerationPanel({ materialId }) {
  const [state, setState] = useState({ data: null, loading: true, error: "" });
  const [perChunk, setPerChunk] = useState("3");
  const [busy, setBusy] = useState(""); // "start" | "stop" | "resume" | "test" | ""
  const [actionError, setActionError] = useState("");
  const [testResult, setTestResult] = useState(null);

  const load = useCallback(async () => {
    try {
      const data = await fetchGenerationOverview(materialId);
      setState({ data, loading: false, error: "" });
    } catch (err) {
      setState((s) => ({ data: s.data, loading: false, error: getErrorMessage(err) }));
    }
  }, [materialId]);

  useEffect(() => {
    load();
  }, [load]);

  // While a job runs, refresh its progress every few seconds
  const running = Boolean(state.data?.active_job);
  useEffect(() => {
    if (!running) return;
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [running, load]);

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

  async function runTest() {
    setBusy("test");
    setTestResult(null);
    try {
      setTestResult(await testAiConnection());
      await load();
    } catch (err) {
      setTestResult({ ok: false, message: getErrorMessage(err) });
    } finally {
      setBusy("");
    }
  }

  const { data, loading, error } = state;

  if (loading) {
    return <Skeleton className="h-64" />;
  }
  if (!data) {
    return (
      <section className={`${cardClass} p-5`}>
        <h3 className="font-semibold text-slate-900">AI question generation</h3>
        <p role="alert" className="mt-2 text-sm text-red-700">
          {error || "Could not load the generation status."}
        </p>
        <button type="button" onClick={load} className={`${btnSecondary} mt-3`}>
          Try again
        </button>
      </section>
    );
  }

  const { ai } = data;
  const job = data.active_job || data.latest_job;
  const progress = data.chunks_total > 0 ? (data.chunks_done * 100) / data.chunks_total : 0;
  const requestsLeft = Math.max(0, ai.daily_limit - ai.used_today);
  const estimate = data.chunks_remaining * 2;
  const rejections = job ? Object.entries(job.rejected_by_reason).sort((a, b) => b[1] - a[1]) : [];

  return (
    <section aria-label="AI question generation" className={`${cardClass} p-5`}>
      <h3 className="font-semibold text-slate-900">AI question generation</h3>
      <p className="mt-1 text-sm text-slate-600">
        The AI writes questions from this material&apos;s text. A second, independent AI check must agree with
        each answer before a question is saved and approved. Students never wait for the AI: questions are
        generated ahead of time.
      </p>

      {/* Provider status */}
      {!ai.configured ? (
        <div role="status" className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-semibold">AI generation is switched off</p>
          <p className="mt-1">{ai.message}</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            <li>
              Open <code className="rounded bg-amber-100 px-1">backend/.env</code> and set{" "}
              {ai.missing.map((m) => (
                <code key={m} className="mr-1 rounded bg-amber-100 px-1">
                  {m}
                </code>
              ))}
              .
            </li>
            <li>Restart the backend, then reload this page.</li>
          </ol>
          <p className="mt-2 text-xs">Never share your API key or paste it into chat.</p>
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-3 rounded-lg bg-slate-50 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
          <p className="text-slate-700">
            <span className="font-medium">{ai.provider}</span> · {ai.model} · requests today{" "}
            <span className="font-medium">
              {ai.used_today} / {ai.daily_limit}
            </span>
          </p>
          <button type="button" onClick={runTest} disabled={busy !== ""} className={btnSecondary}>
            {busy === "test" ? "Testing…" : "Test connection"}
          </button>
        </div>
      )}
      {testResult && (
        <p
          role="status"
          className={`mt-2 text-sm ${testResult.ok ? "text-emerald-700" : "text-red-700"}`}
        >
          {testResult.message}
          {testResult.ok && testResult.latency_ms != null ? ` (${testResult.latency_ms} ms)` : ""}
        </p>
      )}

      {/* Chunk progress */}
      {data.chunks_total > 0 && (
        <div className="mt-5">
          <div className="mb-2 flex items-baseline justify-between text-sm">
            <span className="text-slate-600">
              {data.chunks_done} of {data.chunks_total} chunks processed
            </span>
            {data.chunks_failed > 0 && (
              <span className="text-amber-700">{data.chunks_failed} failed (retried on resume)</span>
            )}
          </div>
          <ProgressBar value={progress} label="Chunks processed" tone={data.chunks_remaining === 0 ? "green" : "blue"} />
        </div>
      )}

      {/* Job */}
      {job && (
        <div className="mt-5 rounded-lg border border-slate-200 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Badge tone={JOB_TONE[job.status] || "slate"}>{JOB_LABEL[job.status] || job.status}</Badge>
              <span className="text-xs text-slate-500">
                Started {formatDate(job.created_at)} · {job.model || "model not recorded"} · {job.questions_per_chunk}{" "}
                per chunk
              </span>
            </div>
            <div className="flex gap-2">
              {job.status === "running" && (
                <button
                  type="button"
                  onClick={() => act("stop", () => stopGenerationJob(job.id))}
                  disabled={busy !== ""}
                  className={btnSecondary}
                >
                  <Square className="h-4 w-4" aria-hidden="true" />
                  {busy === "stop" ? "Stopping…" : "Stop"}
                </button>
              )}
              {job.status === "paused" && data.can_resume && (
                <button
                  type="button"
                  onClick={() => act("resume", () => resumeGenerationJob(job.id))}
                  disabled={busy !== ""}
                  className={btnPrimary}
                >
                  <RotateCcw className="h-4 w-4" aria-hidden="true" />
                  {busy === "resume" ? "Resuming…" : "Resume"}
                </button>
              )}
            </div>
          </div>

          {job.status === "running" && (
            <p role="status" className="mt-3 text-sm text-blue-800">
              Working… this page updates by itself. Each chunk takes a few seconds, and you can leave this page
              open while it runs.
            </p>
          )}
          {job.status === "paused" && job.pause_reason && (
            <p role="alert" className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {job.pause_reason}
            </p>
          )}

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Chunks done (this job)" value={job.chunks_processed} />
            <Stat label="Questions written" value={job.candidates} />
            <Stat label="Saved and approved" value={job.accepted} />
            <Stat label="Rejected" value={job.rejected} />
          </div>
          <p className="mt-2 text-xs text-slate-500">
            {job.api_calls} AI requests used by this job
            {job.chunks_skipped > 0 ? ` · ${job.chunks_skipped} very short chunks skipped` : ""}
          </p>

          {rejections.length > 0 && (
            <details className="mt-3 text-sm">
              <summary className="cursor-pointer font-medium text-slate-700">Why questions were rejected</summary>
              <ul className="mt-2 space-y-1 text-slate-600">
                {rejections.map(([reason, count]) => (
                  <li key={reason} className="flex justify-between gap-3">
                    <span>{REJECTION_LABELS[reason] || reason}</span>
                    <span className="font-medium">{count}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
          {job.last_error && job.status !== "paused" && (
            <p className="mt-3 text-xs text-slate-500">Last problem: {job.last_error}</p>
          )}
        </div>
      )}

      {/* Start */}
      {data.can_start ? (
        <div className="mt-5 border-t border-slate-100 pt-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div>
              <label htmlFor="per-chunk" className={labelClass}>
                Questions per chunk
              </label>
              <select
                id="per-chunk"
                value={perChunk}
                onChange={(e) => setPerChunk(e.target.value)}
                disabled={busy !== ""}
                className={`${inputClass} mt-1 sm:w-40`}
              >
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={() => act("start", () => startMcqGeneration(materialId, Number(perChunk)))}
              disabled={busy !== ""}
              className={btnPrimary}
            >
              <Play className="h-4 w-4" aria-hidden="true" />
              {busy === "start" ? "Starting…" : "Start generation"}
            </button>
          </div>
          <p className="mt-3 text-sm text-slate-500">
            {data.chunks_remaining} chunks left, about {estimate} AI requests (each chunk uses two: write, then
            check). You have {requestsLeft} requests left today. If the daily limit is reached, the job pauses and
            can be resumed.
          </p>
        </div>
      ) : (
        !data.active_job &&
        !(job && job.status === "paused" && data.can_resume) &&
        data.blocked_reason && (
          <p className="mt-5 rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-600">{data.blocked_reason}</p>
        )
      )}

      {actionError && (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {actionError}
        </p>
      )}

      {data.questions_total > 0 && (
        <GeneratedQuestions
          materialId={materialId}
          total={data.questions_total}
          refreshKey={running ? "live" : data.questions_total}
        />
      )}
    </section>
  );
}