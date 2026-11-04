import { Layers, Plus, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { adminFetchSubjects } from "../../api/adminContent.api";
import {
  adminCreateQuestion,
  adminFetchQuestion,
  adminUpdateQuestion,
} from "../../api/adminQuestions.api";
import Breadcrumbs from "../../components/common/Breadcrumbs";
import EmptyState from "../../components/common/EmptyState";
import ErrorState from "../../components/common/ErrorState";
import PageHeader from "../../components/common/PageHeader";
import Skeleton from "../../components/common/Skeleton";
import SubjectChapterSelect from "../../components/common/SubjectChapterSelect";
import { useAsyncData } from "../../hooks/useAsyncData";
import { getErrorMessage } from "../../utils/errors";
import { DIFFICULTIES, OPTION_LETTERS, SOURCES, STATUSES } from "../../utils/questionMeta";
import { btnPrimary, btnSecondary, cardClass, inputClass, labelClass } from "../../utils/ui";

const blankOptions = () => ["", "", "", ""];

function initialForm(question) {
  if (!question) {
    return {
      subjectId: "",
      chapterId: "",
      text: "",
      options: blankOptions(),
      correctIndex: 0,
      explanation: "",
      difficulty: "medium",
      source: "pyq",
      examName: "",
      year: "",
      status: "approved",
    };
  }
  const padded = [...question.options, ...Array(Math.max(0, 4 - question.options.length)).fill("")];
  return {
    subjectId: question.subject.id,
    chapterId: question.chapter?.id ?? "",
    text: question.text,
    options: padded,
    correctIndex: question.correct_index,
    explanation: question.explanation,
    difficulty: question.difficulty,
    source: question.source,
    examName: question.exam_name ?? "",
    year: question.year ? String(question.year) : "",
    status: question.status,
  };
}

// Checks the form and builds the data to send. Blank option rows are dropped.
function buildPayload(form) {
  if (!form.subjectId) return { error: "Please choose a subject." };

  const text = form.text.trim();
  if (text.length < 5) return { error: "The question must be at least 5 characters long." };

  const filled = form.options.map((t, i) => ({ t: t.trim(), i })).filter((o) => o.t);
  if (filled.length < 2) return { error: "Please enter at least two answer options." };

  const correct = filled.findIndex((o) => o.i === form.correctIndex);
  if (correct === -1) {
    return { error: "The option marked as correct is empty. Mark one of the filled options as correct." };
  }
  if (new Set(filled.map((o) => o.t.toLowerCase())).size !== filled.length) {
    return { error: "Answer options must be different from each other." };
  }

  let year = null;
  if (form.year !== "") {
    year = Number(form.year);
    if (!Number.isInteger(year) || year < 1980 || year > 2100) {
      return { error: "Year must be a number between 1980 and 2100." };
    }
  }

  return {
    payload: {
      subject_id: form.subjectId,
      chapter_id: form.chapterId || null,
      text,
      options: filled.map((o) => o.t),
      correct_index: correct,
      explanation: form.explanation.trim(),
      difficulty: form.difficulty,
      source: form.source,
      exam_name: form.examName.trim() || null,
      year,
      status: form.status,
    },
  };
}

function QuestionForm({ subjects, question }) {
  const navigate = useNavigate();
  const isEdit = Boolean(question);
  const textRef = useRef(null);

  const [form, setForm] = useState(() => initialForm(question));
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }));

  function setOption(index, value) {
    setForm((f) => ({ ...f, options: f.options.map((o, i) => (i === index ? value : o)) }));
  }

  function addOption() {
    setForm((f) => (f.options.length < 6 ? { ...f, options: [...f.options, ""] } : f));
  }

  function removeOption(index) {
    setForm((f) => {
      if (f.options.length <= 2) return f;
      let correctIndex = f.correctIndex;
      if (index === correctIndex) correctIndex = 0;
      else if (index < correctIndex) correctIndex -= 1;
      return { ...f, options: f.options.filter((_, i) => i !== index), correctIndex };
    });
  }

  async function save(addAnother) {
    setError("");
    setNotice("");

    const { payload, error: problem } = buildPayload(form);
    if (problem) return setError(problem);

    setSaving(true);
    try {
      if (isEdit) await adminUpdateQuestion(question.id, payload);
      else await adminCreateQuestion(payload);

      if (addAnother) {
        // Keep subject, chapter, difficulty, source, exam, year and status for the next question
        setForm((f) => ({ ...f, text: "", options: blankOptions(), correctIndex: 0, explanation: "" }));
        setNotice("Question saved. Add the next one.");
        setSaving(false);
        window.scrollTo({ top: 0 });
        textRef.current?.focus();
      } else {
        navigate("/admin/questions");
      }
    } catch (err) {
      setError(getErrorMessage(err));
      setSaving(false);
    }
  }

  if (subjects.length === 0) {
    return (
      <div className="mx-auto max-w-3xl">
        <Breadcrumbs items={[{ label: "Question bank", to: "/admin/questions" }, { label: "New question" }]} />
        <div className={cardClass}>
          <EmptyState
            icon={Layers}
            title="Create a subject first"
            description="Every question belongs to a subject. Add one before adding questions."
            action={
              <Link to="/admin/subjects" className={btnPrimary}>
                Manage subjects
              </Link>
            }
          />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <Breadcrumbs
        items={[
          { label: "Question bank", to: "/admin/questions" },
          { label: isEdit ? "Edit question" : "New question" },
        ]}
      />
      <PageHeader title={isEdit ? "Edit question" : "New question"} />

      <form
        onSubmit={(e) => {
          e.preventDefault();
          save(false);
        }}
        className={`${cardClass} space-y-6 p-5 sm:p-6`}
      >
        {notice && (
          <p role="status" className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            {notice}
          </p>
        )}

        <div className="grid gap-5 sm:grid-cols-2">
          <SubjectChapterSelect
            subjects={subjects}
            subjectId={form.subjectId}
            chapterId={form.chapterId}
            idPrefix="form"
            onChange={(subjectId, chapterId) => setForm((f) => ({ ...f, subjectId, chapterId }))}
          />
        </div>

        <div>
          <label htmlFor="q-text" className={labelClass}>
            Question
          </label>
          <textarea
            id="q-text"
            ref={textRef}
            value={form.text}
            onChange={(e) => set("text", e.target.value)}
            rows={4}
            maxLength={2000}
            required
            placeholder="Type the question. For code, use a Markdown code block."
            className={`${inputClass} mt-1`}
          />
          <p className="mt-1 text-xs text-slate-500">
            Markdown is supported (for example a code block between three backticks).
          </p>
        </div>

        <fieldset>
          <legend className={labelClass}>Answer options</legend>
          <p className="mt-1 text-xs text-slate-500">
            Select the radio button next to the correct answer. Blank rows are ignored.
          </p>
          <div className="mt-3 space-y-2">
            {form.options.map((option, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="correct-option"
                  checked={form.correctIndex === i}
                  onChange={() => set("correctIndex", i)}
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
                  disabled={form.options.length <= 2}
                  aria-label={`Remove option ${OPTION_LETTERS[i]}`}
                  className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-red-600 disabled:opacity-40"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
          {form.options.length < 6 && (
            <button type="button" onClick={addOption} className={`${btnSecondary} mt-3`}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add option
            </button>
          )}
        </fieldset>

        <div>
          <label htmlFor="q-explanation" className={labelClass}>
            Explanation <span className="font-normal text-slate-500">(shown after the student answers)</span>
          </label>
          <textarea
            id="q-explanation"
            value={form.explanation}
            onChange={(e) => set("explanation", e.target.value)}
            rows={3}
            maxLength={3000}
            className={`${inputClass} mt-1`}
          />
        </div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label htmlFor="q-difficulty" className={labelClass}>
              Difficulty
            </label>
            <select
              id="q-difficulty"
              value={form.difficulty}
              onChange={(e) => set("difficulty", e.target.value)}
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
            <label htmlFor="q-source" className={labelClass}>
              Source
            </label>
            <select
              id="q-source"
              value={form.source}
              onChange={(e) => set("source", e.target.value)}
              className={`${inputClass} mt-1`}
            >
              {SOURCES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="q-status" className={labelClass}>
              Status
            </label>
            <select
              id="q-status"
              value={form.status}
              onChange={(e) => set("status", e.target.value)}
              className={`${inputClass} mt-1`}
            >
              {STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-slate-500">Only Approved questions reach students.</p>
          </div>
          <div className="sm:col-span-1 lg:col-span-2">
            <label htmlFor="q-exam" className={labelClass}>
              Exam name <span className="font-normal text-slate-500">(optional)</span>
            </label>
            <input
              id="q-exam"
              value={form.examName}
              onChange={(e) => set("examName", e.target.value)}
              maxLength={120}
              placeholder="e.g. Assistant Programmer"
              className={`${inputClass} mt-1`}
            />
          </div>
          <div>
            <label htmlFor="q-year" className={labelClass}>
              Year <span className="font-normal text-slate-500">(optional)</span>
            </label>
            <input
              id="q-year"
              type="number"
              min={1980}
              max={2100}
              value={form.year}
              onChange={(e) => set("year", e.target.value)}
              className={`${inputClass} mt-1`}
            />
          </div>
        </div>

        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}

        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
          <button
            type="button"
            onClick={() => navigate("/admin/questions")}
            disabled={saving}
            className={btnSecondary}
          >
            Cancel
          </button>
          {!isEdit && (
            <button type="button" onClick={() => save(true)} disabled={saving} className={btnSecondary}>
              Save &amp; add another
            </button>
          )}
          <button type="submit" disabled={saving} className={btnPrimary}>
            {saving ? "Saving…" : isEdit ? "Save changes" : "Save question"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function AdminQuestionEditPage() {
  const { questionId } = useParams();

  const { data, loading, error, reload } = useAsyncData(async () => {
    const [subjects, question] = await Promise.all([
      adminFetchSubjects(),
      questionId ? adminFetchQuestion(questionId) : Promise.resolve(null),
    ]);
    return { subjects, question };
  }, questionId || "new");

  if (loading) {
    return (
      <div aria-busy="true" className="mx-auto max-w-3xl space-y-4">
        <Skeleton className="h-6 w-56" />
        <Skeleton className="h-[32rem]" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="mx-auto max-w-3xl">
        <Breadcrumbs items={[{ label: "Question bank", to: "/admin/questions" }, { label: "Not available" }]} />
        <ErrorState message={error || "Question not found."} onRetry={reload} />
      </div>
    );
  }

  return <QuestionForm key={questionId || "new"} subjects={data.subjects} question={data.question} />;
}