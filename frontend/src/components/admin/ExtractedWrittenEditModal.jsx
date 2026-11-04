import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import { approveExtractedWritten, updateExtractedWritten } from "../../api/adminExtraction.api";
import { getErrorMessage } from "../../utils/errors";
import { DIFFICULTIES } from "../../utils/questionMeta";
import { btnPrimary, btnSecondary, inputClass, labelClass } from "../../utils/ui";
import Modal from "../common/Modal";
import SubjectChapterSelect from "../common/SubjectChapterSelect";

const NEXT_LABELS = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l"];

function toRows(parts) {
  return parts.map((p) => ({ label: p.label, text: p.text, marks: p.marks == null ? "" : String(p.marks) }));
}

function parseMarks(value) {
  if (value === "") return { value: null };
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0 || number > 100) return { error: true };
  return { value: number };
}

// Edits one extracted written question (before approval). Blank part rows are ignored.
export default function ExtractedWrittenEditModal({ question, subjects, onClose, onSaved }) {
  const [subjectId, setSubjectId] = useState(question.subject?.id ?? "");
  const [chapterId, setChapterId] = useState(question.chapter?.id ?? "");
  const [stem, setStem] = useState(question.stem);
  const [parts, setParts] = useState(() => toRows(question.parts));
  const [pdfMarks, setPdfMarks] = useState(question.pdf_marks == null ? "" : String(question.pdf_marks));
  const [difficulty, setDifficulty] = useState(question.difficulty);
  const [examName, setExamName] = useState(question.exam_name ?? "");
  const [year, setYear] = useState(question.year ? String(question.year) : "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  function setPart(index, patch) {
    setParts((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function addPart() {
    setParts((rows) => [...rows, { label: NEXT_LABELS[rows.length] ?? "", text: "", marks: "" }]);
  }

  function buildPayload() {
    if (!subjectId) return { error: "Please choose a subject." };

    const filled = parts.filter((p) => p.text.trim());
    if (!stem.trim() && filled.length === 0) return { error: "Write the question, or at least one part." };

    const outParts = [];
    for (let i = 0; i < filled.length; i += 1) {
      const marks = parseMarks(filled[i].marks);
      if (marks.error) return { error: "Marks of a part must be a whole number from 0 to 100, or empty." };
      outParts.push({
        label: filled[i].label.trim() || NEXT_LABELS[i] || String(i + 1),
        text: filled[i].text.trim(),
        marks: marks.value,
      });
    }

    const questionMarks = parseMarks(pdfMarks);
    if (questionMarks.error) return { error: "Marks must be a whole number from 0 to 100, or empty." };

    let yearValue = null;
    if (year !== "") {
      yearValue = Number(year);
      if (!Number.isInteger(yearValue) || yearValue < 1980 || yearValue > 2100) {
        return { error: "Year must be a number between 1980 and 2100." };
      }
    }

    return {
      payload: {
        subject_id: subjectId,
        chapter_id: chapterId || null,
        stem: stem.trim(),
        parts: outParts,
        pdf_marks: questionMarks.value,
        difficulty,
        exam_name: examName.trim() || null,
        year: yearValue,
      },
    };
  }

  async function save(thenApprove) {
    setError("");
    const { payload, error: problem } = buildPayload();
    if (problem) return setError(problem);

    setBusy(thenApprove ? "approve" : "save");
    try {
      await updateExtractedWritten(question.id, payload);
    } catch (err) {
      setError(getErrorMessage(err));
      setBusy("");
      return;
    }
    if (thenApprove) {
      try {
        await approveExtractedWritten(question.id);
      } catch (err) {
        setError(`Your changes were saved, but the question was not approved. ${getErrorMessage(err)}`);
        setBusy("");
        return;
      }
    }
    onSaved();
  }

  const working = busy !== "";

  return (
    <Modal title="Edit extracted written question" onClose={onClose} closeDisabled={working}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save(false);
        }}
        className="space-y-5"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <SubjectChapterSelect
            subjects={subjects}
            subjectId={subjectId}
            chapterId={chapterId}
            idPrefix="ew"
            onChange={(s, c) => {
              setSubjectId(s);
              setChapterId(c);
            }}
          />
        </div>

        <div>
          <label htmlFor="ew-stem" className={labelClass}>
            Question
          </label>
          <textarea
            id="ew-stem"
            value={stem}
            onChange={(e) => setStem(e.target.value)}
            rows={4}
            maxLength={3000}
            className={`${inputClass} mt-1`}
          />
          <p className="mt-1 text-xs text-slate-500">The main text of the question, before its parts (a), (b)…</p>
        </div>

        <fieldset>
          <legend className={labelClass}>Parts</legend>
          <div className="mt-2 space-y-3">
            {parts.map((part, i) => (
              <div key={i} className="rounded-lg border border-slate-200 p-3">
                <div className="flex items-center gap-2">
                  <label htmlFor={`ew-label-${i}`} className="sr-only">
                    Part label
                  </label>
                  <input
                    id={`ew-label-${i}`}
                    value={part.label}
                    onChange={(e) => setPart(i, { label: e.target.value })}
                    maxLength={8}
                    placeholder="a"
                    className={`${inputClass} w-16`}
                  />
                  <label htmlFor={`ew-marks-${i}`} className="sr-only">
                    Marks of this part
                  </label>
                  <input
                    id={`ew-marks-${i}`}
                    type="number"
                    min={0}
                    max={100}
                    value={part.marks}
                    onChange={(e) => setPart(i, { marks: e.target.value })}
                    placeholder="Marks"
                    className={`${inputClass} w-24`}
                  />
                  <button
                    type="button"
                    onClick={() => setParts((rows) => rows.filter((_, k) => k !== i))}
                    aria-label={`Remove part ${part.label || i + 1}`}
                    className="ml-auto rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-red-600"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
                <label htmlFor={`ew-text-${i}`} className="sr-only">
                  Text of this part
                </label>
                <textarea
                  id={`ew-text-${i}`}
                  value={part.text}
                  onChange={(e) => setPart(i, { text: e.target.value })}
                  rows={2}
                  maxLength={1500}
                  className={`${inputClass} mt-2`}
                />
              </div>
            ))}
          </div>
          {parts.length < 12 && (
            <button type="button" onClick={addPart} className={`${btnSecondary} mt-3`}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add part
            </button>
          )}
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="ew-marks" className={labelClass}>
              Marks printed in the PDF <span className="font-normal text-slate-500">(reference only)</span>
            </label>
            <input
              id="ew-marks"
              type="number"
              min={0}
              max={100}
              value={pdfMarks}
              onChange={(e) => setPdfMarks(e.target.value)}
              className={`${inputClass} mt-1`}
            />
            <p className="mt-1 text-xs text-slate-500">In exams, every written question counts as 10 marks.</p>
          </div>
          <div>
            <label htmlFor="ew-difficulty" className={labelClass}>
              Difficulty
            </label>
            <select
              id="ew-difficulty"
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
            <label htmlFor="ew-exam" className={labelClass}>
              Exam name
            </label>
            <input
              id="ew-exam"
              value={examName}
              onChange={(e) => setExamName(e.target.value)}
              maxLength={120}
              className={`${inputClass} mt-1`}
            />
          </div>
          <div>
            <label htmlFor="ew-year" className={labelClass}>
              Year
            </label>
            <input
              id="ew-year"
              type="number"
              min={1980}
              max={2100}
              value={year}
              onChange={(e) => setYear(e.target.value)}
              className={`${inputClass} mt-1`}
            />
          </div>
        </div>

        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}

        <div className="flex flex-wrap justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} disabled={working} className={btnSecondary}>
            Cancel
          </button>
          <button type="submit" disabled={working} className={btnSecondary}>
            {busy === "save" ? "Saving…" : "Save changes"}
          </button>
          <button type="button" onClick={() => save(true)} disabled={working} className={btnPrimary}>
            {busy === "approve" ? "Approving…" : "Save and approve"}
          </button>
        </div>
      </form>
    </Modal>
  );
}