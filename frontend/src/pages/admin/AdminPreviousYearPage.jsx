import { ClipboardPaste, FileSearch, Play, RotateCcw, Search, Upload } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { adminFetchSubjects } from "../../api/adminContent.api";
import { fetchPyqMaterials, resumeExtraction, startExtraction } from "../../api/adminExtraction.api";
import { fetchMaterialOptions } from "../../api/adminMaterials.api";
import MaterialUploadModal from "../../components/admin/MaterialUploadModal";
import PasteQuestionsModal from "../../components/admin/PasteQuestionsModal";
import Badge from "../../components/common/Badge";
import EmptyState from "../../components/common/EmptyState";
import ErrorState from "../../components/common/ErrorState";
import PageHeader from "../../components/common/PageHeader";
import Pagination from "../../components/common/Pagination";
import ProgressBar from "../../components/common/ProgressBar";
import Skeleton from "../../components/common/Skeleton";
import { useAsyncData } from "../../hooks/useAsyncData";
import {
  PAPER_TYPE_LABELS,
  PAPER_TYPE_TONE,
  PAUSE_HINTS,
  PIPELINE_LABELS,
  PIPELINE_ORDER,
  PIPELINE_TONE,
} from "../../utils/extractionMeta";
import { getErrorMessage } from "../../utils/errors";
import { formatDate } from "../../utils/format";
import { formatBytes } from "../../utils/materialMeta";
import { btnPrimary, btnSecondary, cardClass, inputClass } from "../../utils/ui";

const PAGE_SIZE = 20;
const POLL_MS = 5000;

export default function AdminPreviousYearPage() {
  const navigate = useNavigate();

  const [status, setStatus] = useState("");
  const [paperType, setPaperType] = useState("");
  const [searchText, setSearchText] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [busyId, setBusyId] = useState("");
  const [actionError, setActionError] = useState("");

  const [state, setState] = useState({ data: null, error: "" });

  // The list refreshes quietly (the page does not flicker) while PDFs are being processed
  const load = useCallback(async () => {
    try {
      const data = await fetchPyqMaterials({
        status,
        paper_type: paperType,
        q: appliedSearch,
        page,
        page_size: PAGE_SIZE,
      });
      setState({ data, error: "" });
    } catch (err) {
      setState((s) => ({ data: s.data, error: getErrorMessage(err) }));
    }
  }, [status, paperType, appliedSearch, page]);

  useEffect(() => {
    load();
  }, [load]);

  const busyPdfs = state.data?.items.some((i) => ["processing", "uploaded"].includes(i.pipeline.key));
  useEffect(() => {
    if (!busyPdfs) return;
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [busyPdfs, load]);

  const subjectsState = useAsyncData(adminFetchSubjects, "pyq-subjects");
  const optionsState = useAsyncData(fetchMaterialOptions, "pyq-options");
  const subjects = subjectsState.data ?? [];
  const options = optionsState.data;
  const canUpload = Boolean(options) && subjects.length > 0;

  async function act(id, task) {
    setBusyId(id);
    setActionError("");
    try {
      await task();
      await load();
    } catch (err) {
      setActionError(getErrorMessage(err));
    } finally {
      setBusyId("");
    }
  }

  function applySearch(e) {
    e.preventDefault();
    setAppliedSearch(searchText.trim());
    setPage(1);
  }

  const { data, error } = state;
  const hasFilters = status !== "" || paperType !== "" || appliedSearch !== "";

  const uploadButton = (
    <button type="button" onClick={() => setUploadOpen(true)} disabled={!canUpload} className={btnPrimary}>
      <Upload className="h-4 w-4" aria-hidden="true" />
      Upload previous-year PDF
    </button>
  );

  const pasteButton = (
    <button type="button" onClick={() => setPasteOpen(true)} disabled={!canUpload} className={btnSecondary}>
      <ClipboardPaste className="h-4 w-4" aria-hidden="true" />
      Paste question text
    </button>
  );

  const headerActions = (
    <div className="flex flex-wrap gap-2">
      {pasteButton}
      {uploadButton}
    </div>
  );

  return (
    <div>
      <PageHeader
        title="Previous-year papers"
        description="Upload previous-year PDFs, or paste question text into a box, at any time, and choose whether it is MCQ or Written. The questions are found automatically by fixed rules, with no AI. Extracted questions stay pending until you review them."
        actions={headerActions}
      />

      {!subjectsState.loading && subjects.length === 0 && (
        <p className="mb-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Create a subject first. Admin &gt; Exam structure can create the standard ones.{" "}
          <Link to="/admin/exam-structure" className="font-medium underline">
            Open exam structure
          </Link>
        </p>
      )}
      {notice && (
        <p role="status" className="mb-4 rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {notice}
        </p>
      )}
      {actionError && (
        <p role="alert" className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {actionError}
        </p>
      )}

      {data && (
        <div role="group" aria-label="Filter by status" className="mb-4 flex flex-wrap gap-2">
          <button
            type="button"
            aria-pressed={status === ""}
            onClick={() => {
              setStatus("");
              setPage(1);
            }}
            className={`rounded-full px-3 py-1.5 text-sm font-medium ${
              status === "" ? "bg-blue-600 text-white" : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            All ({Object.values(data.summary).reduce((a, b) => a + b, 0)})
          </button>
          {PIPELINE_ORDER.map((key) => (
            <button
              key={key}
              type="button"
              aria-pressed={status === key}
              onClick={() => {
                setStatus(key);
                setPage(1);
              }}
              className={`rounded-full px-3 py-1.5 text-sm font-medium ${
                status === key
                  ? "bg-blue-600 text-white"
                  : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              {PIPELINE_LABELS[key]} ({data.summary[key] ?? 0})
            </button>
          ))}
        </div>
      )}

      <div className="mb-6 flex flex-col gap-2 sm:flex-row">
        <div>
          <label htmlFor="pyq-type" className="sr-only">
            Question paper type
          </label>
          <select
            id="pyq-type"
            value={paperType}
            onChange={(e) => {
              setPaperType(e.target.value);
              setPage(1);
            }}
            className={inputClass}
          >
            <option value="">All paper types</option>
            <option value="mcq">MCQ PDFs</option>
            <option value="written">Written PDFs</option>
          </select>
        </div>
        <form onSubmit={applySearch} className="flex flex-1 gap-2">
          <label htmlFor="pyq-search" className="sr-only">
            Search by title
          </label>
          <input
            id="pyq-search"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            maxLength={100}
            placeholder="Search by title…"
            className={inputClass}
          />
          <button type="submit" className={btnSecondary}>
            <Search className="h-4 w-4" aria-hidden="true" />
            Search
          </button>
          {appliedSearch && (
            <button
              type="button"
              onClick={() => {
                setSearchText("");
                setAppliedSearch("");
                setPage(1);
              }}
              className={btnSecondary}
            >
              Clear
            </button>
          )}
        </form>
      </div>

      {!data && !error && (
        <div className="space-y-3" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      )}

      {!data && error && <ErrorState message={error} onRetry={load} />}

      {data && error && (
        <p role="alert" className="mb-4 text-sm text-red-700">
          {error}
        </p>
      )}

      {data && data.items.length === 0 && (
        <div className={cardClass}>
          <EmptyState
            icon={FileSearch}
            title={hasFilters ? "No PDFs match these filters" : "No previous-year PDFs yet"}
            description={
              hasFilters
                ? "Try another status, type or search."
                : "Upload a text-based, English previous-year question PDF, or paste question text. You can add more at any time."
            }
            action={hasFilters ? null : uploadButton}
          />
        </div>
      )}

      {data && data.items.length > 0 && (
        <>
          <ul className="space-y-3">
            {data.items.map((m) => {
              const { pipeline, counts, progress, job } = m;
              const percent = progress.chunks_total > 0 ? (progress.chunks_done * 100) / progress.chunks_total : 0;
              const canRetry = job?.status === "paused";
              const canStart = !job && pipeline.key === "uploaded";
              const reviewPath =
                m.paper_type === "written"
                  ? `/admin/previous-year/${m.id}/written-review`
                  : `/admin/previous-year/${m.id}/review`;
              return (
                <li key={m.id} className={`${cardClass} p-4`}>
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={PIPELINE_TONE[pipeline.key] || "slate"}>{PIPELINE_LABELS[pipeline.key]}</Badge>
                        <Badge tone={PAPER_TYPE_TONE[m.paper_type] || "slate"}>{PAPER_TYPE_LABELS[m.paper_type]}</Badge>
                        {m.year && <Badge tone="slate">{m.year}</Badge>}
                        {m.detected_exam_name && <Badge tone="blue">{m.detected_exam_name}</Badge>}
                      </div>
                      <Link
                        to={`/admin/materials/${m.id}`}
                        className="mt-2 block truncate font-semibold text-slate-900 hover:text-blue-700"
                      >
                        {m.title}
                      </Link>
                      <p className="mt-1 text-xs text-slate-500">
                        {m.subject ? m.subject.name : "Subject removed"}
                        {m.chapter ? ` › ${m.chapter.title}` : ""} · {m.original_filename} · {formatBytes(m.file_size_bytes)} ·
                        Uploaded {formatDate(m.created_at)}
                      </p>
                      <p className={`mt-2 text-sm ${pipeline.key === "failed" ? "text-red-700" : "text-slate-600"}`}>
                        {pipeline.message}
                        {job?.status === "paused" && PAUSE_HINTS[job.pause_kind] ? ` ${PAUSE_HINTS[job.pause_kind]}` : ""}
                      </p>

                      {pipeline.key === "processing" && progress.chunks_total > 0 && (
                        <div className="mt-2 max-w-md">
                          <ProgressBar value={percent} label="Parts processed" tone="blue" />
                          <p className="mt-1 text-xs text-slate-500">
                            {progress.chunks_done} of {progress.chunks_total} parts
                          </p>
                        </div>
                      )}

                      {counts.total > 0 && (
                        <p className="mt-2 text-xs text-slate-500">
                          {counts.total} extracted · {counts.pending} pending · {counts.needs_attention} need attention ·{" "}
                          {counts.approved} approved · {counts.rejected} rejected
                        </p>
                      )}
                    </div>

                    <div className="flex shrink-0 flex-wrap gap-2">
                      {canStart && (
                        <button
                          type="button"
                          disabled={busyId === m.id}
                          onClick={() => act(m.id, () => startExtraction(m.id))}
                          className={btnPrimary}
                        >
                          <Play className="h-4 w-4" aria-hidden="true" />
                          {busyId === m.id ? "Starting…" : "Start extraction"}
                        </button>
                      )}
                      {canRetry && (
                        <button
                          type="button"
                          disabled={busyId === m.id}
                          onClick={() => act(m.id, () => resumeExtraction(job.id))}
                          className={btnPrimary}
                        >
                          <RotateCcw className="h-4 w-4" aria-hidden="true" />
                          {busyId === m.id ? "Working…" : pipeline.key === "failed" ? "Retry" : "Resume"}
                        </button>
                      )}
                      {counts.total > 0 && (
                        <Link to={reviewPath} className={btnSecondary}>
                          Review ({counts.pending})
                        </Link>
                      )}
                      <Link to={`/admin/materials/${m.id}`} className={btnSecondary}>
                        Details
                      </Link>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
          <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onChange={setPage} />
        </>
      )}

      {uploadOpen && options && (
        <MaterialUploadModal
          subjects={subjects}
          options={options}
          initialKind="previous_year"
          title="Upload a previous-year PDF"
          onClose={() => setUploadOpen(false)}
          onUploaded={(material, chosenType) => {
            setUploadOpen(false);
            if (material.kind !== "previous_year") {
              navigate(`/admin/materials/${material.id}`);
              return;
            }
            const label = chosenType === "written" ? "written" : "MCQ";
            setNotice(
              material.status === "ready"
                ? `"${material.title}" was saved as a ${label} PDF. Question extraction starts automatically.`
                : `"${material.title}" was saved, but its text could not be extracted. Open it for details and retry.`
            );
            setPage(1);
            setStatus("");
            load();
          }}
        />
      )}

      {pasteOpen && options && (
        <PasteQuestionsModal
          subjects={subjects}
          options={options}
          onClose={() => setPasteOpen(false)}
          onCreated={(material, chosenType) => {
            setPasteOpen(false);
            const label = chosenType === "written" ? "written" : "MCQ";
            setNotice(
              `"${material.title}" was saved from pasted text as ${label} questions. Question extraction starts automatically, then the questions wait for your review.`
            );
            setPage(1);
            setStatus("");
            load();
          }}
        />
      )}
    </div>
  );
}