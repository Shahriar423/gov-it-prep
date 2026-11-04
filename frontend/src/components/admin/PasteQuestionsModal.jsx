import { useState } from "react";

import { createMaterialFromText } from "../../api/adminMaterials.api";
import { getErrorMessage } from "../../utils/errors";
import { emptyMeta, toPayload, validateMeta } from "../../utils/materialMeta";
import { btnPrimary, btnSecondary, inputClass, labelClass } from "../../utils/ui";
import Modal from "../common/Modal";
import SubjectChapterSelect from "../common/SubjectChapterSelect";

const MAX_CHARS = 100000; // same limit as the server

const PAPER_TYPES = [
  { value: "mcq", label: "MCQ questions", hint: "Multiple-choice questions only" },
  { value: "written", label: "Written questions", hint: "Written / descriptive questions only" },
];

const PLACEHOLDER =
  "1. Which protocol is used to send email?\nA) HTTP\nB) SMTP\nC) FTP\nD) SNMP\nAns: B\n\n2. ...";

// Paste question text instead of uploading a PDF. The questions are found by the same rules as
// for a PDF and wait for admin review.
export default function PasteQuestionsModal({ subjects, options, onClose, onCreated }) {
  const [meta, setMeta] = useState(() => ({ ...emptyMeta(), kind: "previous_year" }));
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const set = (patch) => setMeta((m) => ({ ...m, ...patch }));

  function toggleTag(tag) {
    set({
      examTags: meta.examTags.includes(tag) ? meta.examTags.filter((t) => t !== tag) : [...meta.examTags, tag],
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    const problem = validateMeta(meta);
    if (problem) return setError(problem);
    if (text.trim().length === 0) return setError("Please paste the question text.");

    setBusy(true);
    try {
      const material = await createMaterialFromText({ ...toPayload(meta), text });
      onCreated(material, meta.paperType);
    } catch (err) {
      setError(getErrorMessage(err));
      setBusy(false);
    }
  }

  return (
    <Modal title="Paste question text" onClose={onClose} closeDisabled={busy}>
      <form onSubmit={handleSubmit} className="space-y-5">
        <fieldset disabled={busy} className="m-0 min-w-0 space-y-5 border-0 p-0">
          <div>
            <label htmlFor="paste-title" className={labelClass}>
              Title
            </label>
            <input
              id="paste-title"
              value={meta.title}
              onChange={(e) => set({ title: e.target.value })}
              maxLength={150}
              required
              placeholder="e.g. BCS 2023 MCQ: Networking (pasted)"
              className={`${inputClass} mt-1`}
            />
          </div>

          <fieldset className="m-0 min-w-0 border-0 p-0">
            <legend className={labelClass}>Question type</legend>
            <p className="mt-1 text-xs text-slate-500">
              Choose the type that matches everything you paste. Paste MCQs and written questions separately.
            </p>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              {PAPER_TYPES.map((type) => (
                <label
                  key={type.value}
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 text-sm ${
                    meta.paperType === type.value ? "border-blue-500 bg-blue-50" : "border-slate-300 bg-white"
                  }`}
                >
                  <input
                    type="radio"
                    name="paste-paper-type"
                    value={type.value}
                    checked={meta.paperType === type.value}
                    onChange={() => set({ paperType: type.value })}
                    className="mt-0.5 h-4 w-4 border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span>
                    <span className="block font-medium text-slate-900">{type.label}</span>
                    <span className="block text-xs text-slate-500">{type.hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2">
            <SubjectChapterSelect
              subjects={subjects}
              subjectId={meta.subjectId}
              chapterId={meta.chapterId}
              idPrefix="paste"
              onChange={(subjectId, chapterId) => set({ subjectId, chapterId })}
            />
          </div>

          <fieldset className="m-0 min-w-0 border-0 p-0">
            <legend className={labelClass}>Recruitment exams</legend>
            <p className="mt-1 text-xs text-slate-500">
              Tick the exams these questions are useful for. Leave all unticked if they apply to every exam.
            </p>
            <div className="mt-2 space-y-2">
              {options.target_exams.map((exam) => (
                <label key={exam} className="flex cursor-pointer items-center gap-3 text-sm text-slate-800">
                  <input
                    type="checkbox"
                    checked={meta.examTags.includes(exam)}
                    onChange={() => toggleTag(exam)}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  {exam}
                </label>
              ))}
            </div>
          </fieldset>

          <div>
            <label htmlFor="paste-year" className={labelClass}>
              Exam year <span className="font-normal text-slate-500">(optional)</span>
            </label>
            <input
              id="paste-year"
              type="number"
              min={1980}
              max={2100}
              value={meta.year}
              onChange={(e) => set({ year: e.target.value })}
              className={`${inputClass} mt-1`}
            />
          </div>

          <div>
            <label htmlFor="paste-text" className={labelClass}>
              Question text
            </label>
            <textarea
              id="paste-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={MAX_CHARS}
              rows={10}
              placeholder={PLACEHOLDER}
              className={`${inputClass} mt-1 font-mono`}
            />
            <p className="mt-1 text-xs text-slate-500">
              Number each question. For MCQs, put the options on their own lines (A, B, C, D). An answer is used
              only if it is written in the text, such as &quot;Ans: B&quot; or a key like &quot;1-B 2-C&quot;.
              Otherwise you choose it during review. {text.length.toLocaleString()} / {MAX_CHARS.toLocaleString()}{" "}
              characters.
            </p>
          </div>
        </fieldset>

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
            {busy ? "Saving…" : "Save and extract"}
          </button>
        </div>
      </form>
    </Modal>
  );
}