import { ChevronLeft, ChevronRight, Flag, Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";

import { fetchAttempt, saveAnswers, submitExam } from "../../api/exams.api";
import ConfirmDialog from "../../components/common/ConfirmDialog";
import ErrorState from "../../components/common/ErrorState";
import MarkdownContent from "../../components/common/MarkdownContent";
import Skeleton from "../../components/common/Skeleton";
import ExamTimer from "../../components/exam/ExamTimer";
import QuestionPalette from "../../components/exam/QuestionPalette";
import TimesUpOverlay from "../../components/exam/TimesUpOverlay";
import { useAsyncData } from "../../hooks/useAsyncData";
import { useCountdown } from "../../hooks/useCountdown";
import { getErrorMessage } from "../../utils/errors";
import { OPTION_LETTERS } from "../../utils/questionMeta";
import { formatNegative } from "../../utils/time";
import { btnPrimary, btnSecondary } from "../../utils/ui";

const SAVE_TEXT = {
  saved: "All answers saved",
  saving: "Saving…",
  error: "Could not save. Retrying…",
};

function ExamRoom({ attempt }) {
  const navigate = useNavigate();
  const questions = attempt.questions;
  const resultPath = `/exams/attempts/${attempt.id}/result`;

  const [answers, setAnswers] = useState(attempt.answers);
  const answersRef = useRef(attempt.answers); // always holds the newest answers
  const [current, setCurrent] = useState(0);
  const [flagged, setFlagged] = useState(() => new Set()); // "mark for review" (not saved on refresh)
  const [endAt, setEndAt] = useState(() => Date.now() + attempt.remaining_seconds * 1000);
  const [phase, setPhase] = useState("running"); // "running" | "timeup"
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [saveState, setSaveState] = useState("saved");

  const saveTimer = useRef(null);
  const pendingSave = useRef(false);
  const saving = useRef(false);
  const dirty = useRef(false);
  const finished = useRef(false);
  const timeUpHandled = useRef(false);

  const secondsLeft = useCountdown(endAt);

  // ---------- autosave ----------
  async function flushSave() {
    pendingSave.current = false;
    if (finished.current) return;
    if (saving.current) {
      dirty.current = true; // another save is running; it will repeat with the newest answers
      return;
    }

    saving.current = true;
    setSaveState("saving");
    try {
      do {
        dirty.current = false;
        const res = await saveAnswers(attempt.id, answersRef.current);

        if (res.status !== "in_progress") {
          // The server already finished this exam
          finished.current = true;
          navigate(resultPath, { replace: true });
          return;
        }

        // Re-sync the countdown with the server clock (only if it drifted by more than 2 s)
        const serverEnd = Date.now() + res.remaining_seconds * 1000;
        setEndAt((prev) => (Math.abs(serverEnd - prev) > 2000 ? serverEnd : prev));
      } while (dirty.current && !finished.current);
      setSaveState("saved");
    } catch {
      setSaveState("error");
      pendingSave.current = true;
      saveTimer.current = setTimeout(flushSave, 5000); // try again shortly
    } finally {
      saving.current = false;
    }
  }

  function scheduleSave() {
    pendingSave.current = true;
    setSaveState("saving");
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(flushSave, 800);
  }

  // If the student leaves the page with an unsaved change, send it before unmounting
  useEffect(() => {
    return () => {
      clearTimeout(saveTimer.current);
      if (pendingSave.current && !finished.current) {
        saveAnswers(attempt.id, answersRef.current).catch(() => {});
      }
    };
  }, [attempt.id]);

  // ---------- answering ----------
  function changeAnswers(next) {
    answersRef.current = next;
    setAnswers(next);
    scheduleSave();
  }

  function selectOption(question, index) {
    changeAnswers({ ...answersRef.current, [question.id]: index });
  }

  function clearAnswer(question) {
    const next = { ...answersRef.current };
    delete next[question.id];
    changeAnswers(next);
  }

  function toggleFlag(questionId) {
    setFlagged((prev) => {
      const next = new Set(prev);
      if (next.has(questionId)) next.delete(questionId);
      else next.add(questionId);
      return next;
    });
  }

  // ---------- submitting ----------
  async function submit() {
    clearTimeout(saveTimer.current);
    pendingSave.current = false;
    setConfirmOpen(false);
    setSubmitError("");
    setSubmitting(true);
    try {
      await submitExam(attempt.id, answersRef.current);
      finished.current = true;
      navigate(resultPath, { replace: true });
    } catch (err) {
      setSubmitError(getErrorMessage(err));
      setSubmitting(false);
    }
  }

  // ---------- time is up ----------
  useEffect(() => {
    if (secondsLeft === 0 && !timeUpHandled.current) {
      timeUpHandled.current = true;
      setPhase("timeup"); // hides the questions and shows the TIME'S UP! screen
      submit();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secondsLeft]);

  if (phase === "timeup") {
    return (
      <TimesUpOverlay
        submitting={submitting}
        error={submitError}
        onRetry={submit}
        resultPath={resultPath}
      />
    );
  }

  const question = questions[current];
  const selected = answers[question.id];
  const answeredCount = questions.filter((q) => answers[q.id] !== undefined).length;
  const unanswered = questions.length - answeredCount;
  const flaggedCount = flagged.size;

  const confirmMessage =
    (unanswered > 0
      ? `You have ${unanswered} unanswered ${unanswered === 1 ? "question" : "questions"}. `
      : "You have answered every question. ") +
    (flaggedCount > 0
      ? `${flaggedCount} ${flaggedCount === 1 ? "question is" : "questions are"} marked for review. `
      : "") +
    "Once you submit, you cannot change your answers.";

  const announcement =
    secondsLeft === 300 ? "5 minutes remaining" : secondsLeft === 60 ? "1 minute remaining" : "";

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <p className="sr-only" aria-live="assertive">
        {announcement}
      </p>

      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold">{attempt.title}</h1>
            <p className="text-xs text-slate-500">
              {answeredCount} of {questions.length} answered ·{" "}
              <span className={saveState === "error" ? "text-red-600" : ""}>{SAVE_TEXT[saveState]}</span>
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <ExamTimer secondsLeft={secondsLeft} />
            <button
              type="button"
              onClick={() => setConfirmOpen(true)}
              disabled={submitting}
              className={btnPrimary}
            >
              <Send className="h-4 w-4" aria-hidden="true" />
              {submitting ? "Submitting…" : "Submit"}
            </button>
          </div>
        </div>
      </header>

      {submitError && (
        <div role="alert" className="border-b border-red-200 bg-red-50 px-4 py-3 text-center text-sm text-red-800">
          {submitError} Your answers are still saved. Press Submit to try again.
        </div>
      )}

      <main className="mx-auto grid max-w-6xl gap-6 px-4 py-6 lg:grid-cols-[1fr_18rem]">
        <section aria-label={`Question ${current + 1} of ${questions.length}`}>
          <article className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-3">
              <span className="text-sm font-semibold text-slate-700">
                Question {current + 1} of {questions.length}
              </span>
              <span className="text-xs text-slate-500">
                1 mark · {formatNegative(attempt.negative_marking)}
              </span>
            </div>

            <div className="px-5 py-5">
              <MarkdownContent>{question.text}</MarkdownContent>

              <fieldset className="mt-5">
                <legend className="sr-only">Choose one answer</legend>
                <div className="space-y-2">
                  {question.options.map((option, i) => {
                    const isSelected = selected === i;
                    return (
                      <label
                        key={i}
                        className={`flex w-full cursor-pointer items-start gap-3 rounded-lg border px-4 py-3 text-sm transition focus-within:ring-2 focus-within:ring-blue-500/40 ${
                          isSelected
                            ? "border-blue-500 bg-blue-50"
                            : "border-slate-200 bg-white hover:border-blue-300 hover:bg-slate-50"
                        }`}
                      >
                        <input
                          type="radio"
                          name={`exam-question-${question.id}`}
                          className="sr-only"
                          checked={isSelected}
                          onChange={() => selectOption(question, i)}
                        />
                        <span
                          aria-hidden="true"
                          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                            isSelected ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {OPTION_LETTERS[i]}
                        </span>
                        <span className="min-w-0 flex-1 whitespace-pre-wrap break-words">{option}</span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-5 py-3">
              <button
                type="button"
                onClick={() => toggleFlag(question.id)}
                aria-pressed={flagged.has(question.id)}
                className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium ${
                  flagged.has(question.id)
                    ? "bg-amber-100 text-amber-800"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                <Flag className="h-4 w-4" aria-hidden="true" />
                {flagged.has(question.id) ? "Marked for review" : "Mark for review"}
              </button>
              <button
                type="button"
                onClick={() => clearAnswer(question)}
                disabled={selected === undefined}
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-40"
              >
                Clear answer
              </button>
            </div>
          </article>

          <div className="mt-4 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setCurrent((c) => Math.max(0, c - 1))}
              disabled={current === 0}
              className={btnSecondary}
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              Previous
            </button>
            <button
              type="button"
              onClick={() => setCurrent((c) => Math.min(questions.length - 1, c + 1))}
              disabled={current === questions.length - 1}
              className={btnSecondary}
            >
              Next
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </section>

        <aside>
          <QuestionPalette
            questions={questions}
            answers={answers}
            flagged={flagged}
            current={current}
            onJump={setCurrent}
          />
        </aside>
      </main>

      {confirmOpen && (
        <ConfirmDialog
          title="Submit exam?"
          message={confirmMessage}
          confirmLabel="Submit exam"
          confirmTone="primary"
          busy={submitting}
          onConfirm={submit}
          onCancel={() => setConfirmOpen(false)}
        />
      )}
    </div>
  );
}

export default function ExamRoomPage() {
  const { attemptId } = useParams();
  const { data, loading, error, reload } = useAsyncData(() => fetchAttempt(attemptId), attemptId);

  if (loading) {
    return (
      <div aria-busy="true" className="mx-auto max-w-6xl space-y-4 p-6">
        <Skeleton className="h-12" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="mx-auto max-w-lg space-y-4 p-6">
        <ErrorState message={error || "Exam not found."} onRetry={reload} />
        <Link to="/exams" className="text-sm text-blue-700 underline">
          Back to mock exams
        </Link>
      </div>
    );
  }

  // Already finished (for example it timed out while you were away): show the result instead
  if (data.status !== "in_progress") {
    return <Navigate to={`/exams/attempts/${attemptId}/result`} replace />;
  }

  return <ExamRoom key={data.id} attempt={data} />;
}
