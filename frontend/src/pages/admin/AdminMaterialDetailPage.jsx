import { Pencil, RotateCcw, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { adminFetchSubjects } from "../../api/adminContent.api";
import {
  deleteMaterial,
  fetchMaterial,
  fetchMaterialOptions,
  reprocessMaterial,
} from "../../api/adminMaterials.api";
import ChunkBrowser from "../../components/admin/ChunkBrowser";
import ExtractionPanel from "../../components/admin/ExtractionPanel";

import MaterialEditModal from "../../components/admin/MaterialEditModal";
import Badge from "../../components/common/Badge";
import Breadcrumbs from "../../components/common/Breadcrumbs";
import ConfirmDialog from "../../components/common/ConfirmDialog";
import ErrorState from "../../components/common/ErrorState";
import ProgressBar from "../../components/common/ProgressBar";
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
import { btnPrimary, btnSecondary, cardClass, labelClass } from "../../utils/ui";

const FILE_INPUT_CLASS =
  "block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-blue-700 hover:file:bg-blue-100";

function StatusBanner({ material, onReload }) {
  if (material.status === "ready") {
    return (
      <p role="status" className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
        The text was extracted successfully: {material.pages_with_text} of {material.page_count} pages,{" "}
        {material.chunk_count} chunks, {material.word_count.toLocaleString()} words.
      </p>
    );
  }
  if (material.status === "failed") {
    return (
      <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
        <p className="font-semibold text-red-800">Processing failed</p>
        <p className="mt-1 text-sm text-red-700">{material.error || "The PDF could not be processed."}</p>
      </div>
    );
  }
  return (
    <div role="status" className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">
      This material is still being processed.{" "}
      <button type="button" onClick={onReload} className="font-medium underline">
        Refresh
      </button>
    </div>
  );
}

// The PDF is not stored on the server, so retrying means choosing the file again
function RetryPanel({ material, maxMb, onDone }) {
  const [file, setFile] = useState(null);
  const [stage, setStage] = useState("idle"); // idle | uploading | processing
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const busy = stage !== "idle";

  function handleFile(e) {
    const chosen = e.target.files?.[0] ?? null;
    setError("");
    if (!chosen) return setFile(null);
    if (!chosen.name.toLowerCase().endsWith(".pdf")) {
      e.target.value = "";
      setFile(null);
      return setError("Please choose a PDF file (a file ending in .pdf).");
    }
    if (chosen.size > maxMb * 1024 * 1024) {
      e.target.value = "";
      setFile(null);
      return setError(`This file is larger than the ${maxMb} MB limit.`);
    }
    setFile(chosen);
  }

  async function retry(e) {
    e.preventDefault();
    if (!file) return setError("Please choose a PDF file.");
    setError("");
    setStage("uploading");
    setProgress(0);
    try {
      await reprocessMaterial(material.id, file, (percent) => {
        setProgress(percent);
        if (percent >= 100) setStage("processing");
      });
      onDone();
    } catch (err) {
      setError(getErrorMessage(err));
      setStage("idle");
    }
  }

  return (
    <section aria-label="Retry processing" className={`${cardClass} p-5`}>
      <h3 className="font-semibold text-slate-900">Retry processing</h3>
      <p className="mt-1 text-sm text-slate-600">
        The original PDF is not stored on the server, so choose the file again. You can choose a corrected
        or different version of it.
        {material.kind === "previous_year" ? " Question extraction starts automatically once the text is ready." : ""}
      </p>

      <form onSubmit={retry} className="mt-4 space-y-3">
        <div>
          <label htmlFor="retry-file" className={labelClass}>
            PDF file
          </label>
          <input
            id="retry-file"
            type="file"
            accept="application/pdf,.pdf"
            onChange={handleFile}
            disabled={busy}
            className={`${FILE_INPUT_CLASS} mt-1`}
          />
        </div>

        {stage === "uploading" && (
          <div role="status">
            <p className="mb-1 text-sm text-slate-600">Uploading… {progress}%</p>
            <ProgressBar value={progress} label="Upload progress" tone="blue" />
          </div>
        )}
        {stage === "processing" && (
          <p role="status" className="rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-800">
            Extracting text from the PDF… please keep this page open.
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}

        <button type="submit" disabled={busy || !file} className={btnPrimary}>
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          {busy ? "Working…" : "Retry processing"}
        </button>
      </form>
    </section>
  );
}

function Detail({ label, children }) {
  return (
    <>
      <dt className="text-slate-500">{label}</dt>
      <dd className="min-w-0 break-words text-slate-900">{children}</dd>
    </>
  );
}

export default function AdminMaterialDetailPage() {
  const { materialId } = useParams();
  const navigate = useNavigate();

  const { data: material, loading, error, reload } = useAsyncData(
    () => fetchMaterial(materialId),
    materialId
  );
  const subjectsState = useAsyncData(adminFetchSubjects, "material-detail-subjects");
  const optionsState = useAsyncData(fetchMaterialOptions, "material-detail-options");

  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  async function confirmDelete() {
    setDeleting(true);
    setDeleteError("");
    try {
      await deleteMaterial(material.id);
      navigate(material.kind === "previous_year" ? "/admin/previous-year" : "/admin/materials", { replace: true });
    } catch (err) {
      setDeleteError(getErrorMessage(err));
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <div aria-busy="true" className="space-y-4">
        <Skeleton className="h-6 w-56" />
        <Skeleton className="h-20" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (error || !material) {
    return (
      <div>
        <Breadcrumbs items={[{ label: "Source materials", to: "/admin/materials" }, { label: "Not available" }]} />
        <ErrorState message={error || "Material not found."} onRetry={reload} />
      </div>
    );
  }

  const subjects = subjectsState.data ?? [];
  const options = optionsState.data;
  const canEdit = Boolean(options) && subjects.length > 0;
  const isPaper = material.kind === "previous_year";

  return (
    <div className="mx-auto max-w-4xl">
      <Breadcrumbs
        items={[
          isPaper
            ? { label: "Previous-year papers", to: "/admin/previous-year" }
            : { label: "Source materials", to: "/admin/materials" },
          { label: material.title },
        ]}
      />

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={STATUS_TONE[material.status]}>{STATUS_LABELS[material.status]}</Badge>
            <Badge tone={KIND_TONE[material.kind] || "slate"}>
              {KIND_LABELS[material.kind] || material.kind}
            </Badge>
          </div>
          <h2 className="mt-2 break-words text-2xl font-bold tracking-tight text-slate-900">{material.title}</h2>
          {isPaper && (
            <p className="mt-1 text-sm">
              <Link to="/admin/previous-year" className="font-medium text-blue-700 hover:underline">
                All previous-year papers
              </Link>
            </p>
          )}
        </div>
        <div className="flex shrink-0 gap-2">
          <button type="button" onClick={() => setEditOpen(true)} disabled={!canEdit} className={btnSecondary}>
            <Pencil className="h-4 w-4" aria-hidden="true" />
            Edit details
          </button>
          <button
            type="button"
            onClick={() => {
              setDeleteError("");
              setDeleteOpen(true);
            }}
            className={btnSecondary}
            aria-label="Delete material"
          >
            <Trash2 className="h-4 w-4 text-red-600" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="space-y-6">
        <StatusBanner material={material} onReload={reload} />

        {material.warnings.length > 0 && (
          <div role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-sm font-semibold text-amber-900">Warnings</p>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-amber-900">
              {material.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </div>
        )}

        {material.status === "failed" && options && (
          <RetryPanel material={material} maxMb={options.limits.max_upload_mb} onDone={reload} />
        )}

        <section aria-label="Details" className={`${cardClass} p-5`}>
          <h3 className="font-semibold text-slate-900">Details</h3>
          <dl className="mt-3 grid grid-cols-[9rem_1fr] gap-x-4 gap-y-2 text-sm">
            <Detail label="Subject">
              {material.subject ? material.subject.name : "Subject removed. Edit the details to choose one."}
            </Detail>
            <Detail label="Chapter">{material.chapter ? material.chapter.title : "Not specified"}</Detail>
            <Detail label="Recruitment exams">{examTagsLabel(material.exam_tags)}</Detail>
            {isPaper && <Detail label="Exam year">{material.year ?? "Not specified"}</Detail>}
            <Detail label="File">
              {material.original_filename} · {formatBytes(material.file_size_bytes)}
            </Detail>
            <Detail label="Pages">
              {material.page_count > 0
                ? `${material.page_count} (${material.pages_with_text} with text)`
                : "—"}
            </Detail>
            <Detail label="Chunks">{material.chunk_count}</Detail>
            <Detail label="Words">{material.word_count.toLocaleString()}</Detail>
            <Detail label="Uploaded">{formatDate(material.created_at)}</Detail>
            <Detail label="Processed">{material.processed_at ? formatDate(material.processed_at) : "—"}</Detail>
          </dl>
        </section>

        {material.status === "ready" && (
          <>
            {isPaper && <ExtractionPanel materialId={material.id} />}
            {!isPaper && material.kind === "notes" && (
              <ExtractionPanel materialId={material.id} allowTypeChoice />
            )}

            <section aria-label="Text preview" className={`${cardClass} p-5`}>
              <h3 className="font-semibold text-slate-900">Text preview</h3>
              <p className="mt-1 text-sm text-slate-600">
                The beginning of the extracted text. Check that it reads correctly.
              </p>
              <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-slate-50 p-3 font-sans text-xs leading-relaxed text-slate-800">
                {material.preview}
                {material.char_count > material.preview.length ? "\n…" : ""}
              </pre>
            </section>

            <ChunkBrowser materialId={material.id} />
          </>
        )}
      </div>

      {editOpen && options && (
        <MaterialEditModal
          material={material}
          subjects={subjects}
          options={options}
          onClose={() => setEditOpen(false)}
          onSaved={() => {
            setEditOpen(false);
            reload();
          }}
        />
      )}

      {deleteOpen && (
        <ConfirmDialog
          title="Delete material"
          message={`Delete "${material.title}" and its extracted text? Questions already approved or generated from it stay in the question bank. The original PDF is not stored, so you would have to upload it again. A PDF with extracted questions that are still waiting for review cannot be deleted. This cannot be undone.`}
          busy={deleting}
          error={deleteError}
          onConfirm={confirmDelete}
          onCancel={() => setDeleteOpen(false)}
        />
      )}
    </div>
  );
}