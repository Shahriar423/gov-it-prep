import { useState } from "react";

import { uploadMaterial } from "../../api/adminMaterials.api";
import { getErrorMessage } from "../../utils/errors";
import {
  emptyMeta,
  formatBytes,
  titleFromFilename,
  toPayload,
  validateMeta,
} from "../../utils/materialMeta";
import { btnPrimary, btnSecondary, labelClass } from "../../utils/ui";
import Modal from "../common/Modal";
import ProgressBar from "../common/ProgressBar";
import MaterialMetaFields from "./MaterialMetaFields";

const FILE_INPUT_CLASS =
  "block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-blue-700 hover:file:bg-blue-100";

export default function MaterialUploadModal({
  subjects,
  options,
  onClose,
  onUploaded,
  initialKind = "notes",
  title = "Upload a PDF",
}) {
  const maxMb = options.limits.max_upload_mb;

  const [file, setFile] = useState(null);
  const [meta, setMeta] = useState(() => ({ ...emptyMeta(), kind: initialKind }));
  const [stage, setStage] = useState("idle"); // idle | uploading | processing
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const busy = stage !== "idle";

  function handleFile(e) {
    const chosen = e.target.files?.[0] ?? null;
    setError("");

    if (!chosen) {
      setFile(null);
      return;
    }
    if (!chosen.name.toLowerCase().endsWith(".pdf")) {
      setError("Please choose a PDF file (a file ending in .pdf).");
      setFile(null);
      e.target.value = "";
      return;
    }
    if (chosen.size > maxMb * 1024 * 1024) {
      setError(`This file is larger than the ${maxMb} MB limit.`);
      setFile(null);
      e.target.value = "";
      return;
    }

    setFile(chosen);
    // Suggest a title from the file name, but never overwrite one the admin typed
    setMeta((m) => (m.title.trim() ? m : { ...m, title: titleFromFilename(chosen.name) }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (!file) return setError("Please choose a PDF file.");
    const problem = validateMeta(meta);
    if (problem) return setError(problem);

    setStage("uploading");
    setProgress(0);
    try {
      const material = await uploadMaterial(toPayload(meta), file, (percent) => {
        setProgress(percent);
        if (percent >= 100) setStage("processing");
      });
      onUploaded(material, meta.paperType);
    } catch (err) {
      setError(getErrorMessage(err));
      setStage("idle");
    }
  }

  return (
    <Modal title={title} onClose={onClose} closeDisabled={busy}>
      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label htmlFor="material-file" className={labelClass}>
            PDF file
          </label>
          <input
            id="material-file"
            type="file"
            accept="application/pdf,.pdf"
            onChange={handleFile}
            disabled={busy}
            className={`${FILE_INPUT_CLASS} mt-1`}
          />
          <p className="mt-1 text-xs text-slate-500">
            English, text-based PDFs only (you can select and copy the text). Up to {maxMb} MB and{" "}
            {options.limits.max_pdf_pages} pages. Scanned PDFs are not supported.
          </p>
          {file && (
            <p className="mt-1 text-xs text-slate-600">
              {file.name} · {formatBytes(file.size)}
            </p>
          )}
        </div>

        <MaterialMetaFields
          value={meta}
          onChange={setMeta}
          subjects={subjects}
          options={options}
          disabled={busy}
          idPrefix="upload"
          showPaperType
        />

        {stage === "uploading" && (
          <div role="status">
            <p className="mb-1 text-sm text-slate-600">Uploading… {progress}%</p>
            <ProgressBar value={progress} label="Upload progress" tone="blue" />
          </div>
        )}
        {stage === "processing" && (
          <p role="status" className="rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-800">
            Extracting text from the PDF… large files can take a minute. Please keep this window open.
          </p>
        )}

        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} disabled={busy} className={btnSecondary}>
            Cancel
          </button>
          <button type="submit" disabled={busy} className={btnPrimary}>
            {busy ? "Working…" : "Upload and process"}
          </button>
        </div>
      </form>
    </Modal>
  );
}