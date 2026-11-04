import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import { approveExtractedQuestion, updateExtractedQuestion } from "../../api/adminExtraction.api";
import { getErrorMessage } from "../../utils/errors";
import { DIFFICULTIES, OPTION_LETTERS } from "../../utils/questionMeta";
import { btnPrimary, btnSecondary, inputClass, labelClass } from "../../utils/ui";
import Modal from "../common/Modal";
import SubjectChapterSelect from "../common/SubjectChapterSelect";

function padOptions(options) {
  return [...options, ...Array(Math.max(0, 4 - options.length)).fill("")];
}

// Edits one extracted question (before approval). Blank option rows are ignored.
export default function ExtractedQuestionEditModal({ question, subjects, onClose, onSaved }) {
  const [subjectId, setSubjectId] = useState(question.subject?.id ?? "");
  const [chapterId, setChapterId] = useState(question.chapter?.id ?? "");
  const [text, setText] = useState(question.text);
  const [options, setOptions] = useState(() => padOptions(question.options));
  const [correct, setCorrect] = useState(question.correct_index); // a row number, or null for "no answer"
  const [explanation, setExplanation] = useState(question.explanation);
  const [difficulty, setDifficulty] = useState(question.difficulty);
  const [examName, setExamName] = useState(question.exam_name ?? "");
  const [year, setYear] = useState(question.year ? String(question.year) : "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  function setOption(index, value) {
    setOptions((rows) => rows.map((row, i) => (i === index ? value : row)));
  }

  function removeOption(index) {
    setOptions((rows) => rows.filter((_, i) => i !== index));
    setCorrect((c) => (c === null ? null : c === index ? null : c > index ? c - 1 : c));
  }

  function buildPayload() {
    if (!subjectId) return { error: "Please choose a subject." };
    if (text.trim().length < 1) return { error: "The question text cannot be empty." };

    const filled = options.map((value, row) => ({ value: value.trim(), row })).filter((o) => o.value);
    let correctIndex = null;
    if (correct !== null) {
      correctIndex = filled.findIndex((o) => o.row === correct);
      if (correctIndex === -1) return { error: "The option marked as correct is empty. Mark a filled option, or clear the answer." };
    }

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
        text: text.trim(),
        options: filled.map((o) => o.value),
        correct_index: correctIndex,
        explanation: explanation.trim(),
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
      await updateExtractedQuestion(question.id, payload);
    } catch (err) {
      setError(getErrorMessage(err));
      setBusy("");
      return;
    }
    if (thenApprove) {
      try {
        await approveExtractedQuestion(question.id);
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
    <Modal title="Edit extracted question" onClose={onClose} closeDisabled={working}>
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
            idPrefix="eq"
            onChange={(s, c) => {
              setSubjectId(s);
              setChapterId(c);
            }}
          />
        </div>

        <div>
          <label htmlFor="eq-text" className={labelClass}>
            Question
          </label>
          <textarea
            id="eq-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            maxLength={2000}
            className={`${inputClass} mt-1`}
          />
        </div>

        <fieldset>
          <legend className={labelClass}>Answer options</legend>
          <p className="mt-1 text-xs text-slate-500">
            Select the radio button next to the correct answer. If the PDF does not show the answer, you can check
            it yourself, or leave it empty (a question without an answer cannot be approved).
          </p>
          <div className="mt-3 space-y-2">
            {options.map((option, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="eq-correct"
                  checked={correct === i}
                  onChange={() => setCorrect(i)}
                  aria-label={`Mark option ${OPTION_LETTERS[i]} as correct`}
                  className="h-4 w-4 shrink-0 border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="w-5 shrink-0 text-sm font-semibold text-slate-500" aria-hidden="true">
                  {OPTION_LETTERS[i]}
                </span>
                <input
                  value={option}
                  onChange={(e) => setOption(i, e.target.value)}
                  maxLength={300}
                  aria-label={`Option ${OPTION_LETTERS[i]}`}
                  className={inputClass}
                />
                <button
                  type="button"
                  onClick={() => removeOption(i)}
                  aria-label={`Remove option ${OPTION_LETTERS[i]}`}
                  className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-red-600"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {options.length < 6 && (
              <button type="button" onClick={() => setOptions((rows) => [...rows, ""])} className={btnSecondary}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                Add option
              </button>
            )}
            {correct !== null && (
              <button type="button" onClick={() => setCorrect(null)} className={btnSecondary}>
                Clear the answer
              </button>
            )}
          </div>
        </fieldset>

        <div>
          <label htmlFor="eq-explanation" className={labelClass}>
            Explanation <span className="font-normal text-slate-500">(optional)</span>
          </label>
          <textarea
            id="eq-explanation"
            value={explanation}
            onChange={(e) => setExplanation(e.target.value)}
            rows={3}
            maxLength={3000}
            className={`${inputClass} mt-1`}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="eq-difficulty" className={labelClass}>
              Difficulty
            </label>
            <select
              id="eq-difficulty"
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
            <label htmlFor="eq-exam" className={labelClass}>
              Exam name
            </label>
            <input
              id="eq-exam"
              value={examName}
              onChange={(e) => setExamName(e.target.value)}
              maxLength={120}
              className={`${inputClass} mt-1`}
            />
          </div>
          <div>
            <label htmlFor="eq-year" className={labelClass}>
              Year
            </label>
            <input
              id="eq-year"
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