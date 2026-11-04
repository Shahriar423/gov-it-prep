import { useEffect, useState } from "react";

import { submitAnswer } from "../../api/practice.api";
import ProgressBar from "../../components/common/ProgressBar";
import QuestionCard from "../../components/practice/QuestionCard";
import { getErrorMessage } from "../../utils/errors";
import { btnPrimary, btnSecondary } from "../../utils/ui";

export default function PracticeSession({ questions, onFinish, mode = "practice" }) {
  const [index, setIndex] = useState(0);
  const [pending, setPending] = useState(null); // option chosen but not checked yet
  const [answers, setAnswers] = useState({}); // question id -> { selected, result }
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");

  const question = questions[index];
  const saved = answers[question.id];
  const isLast = index === questions.length - 1;

  const answeredCount = Object.keys(answers).length;
  const correctCount = Object.values(answers).filter((a) => a.result.is_correct).length;

  // Each new question starts at the top of the page
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [index]);

  async function checkAnswer() {
    setChecking(true);
    setError("");
    try {
      const result = await submitAnswer({
        question_id: question.id,
        selected_index: pending,
        mode,
      });
      setAnswers((prev) => ({ ...prev, [question.id]: { selected: pending, result } }));
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setChecking(false);
    }
  }

  function next() {
    if (isLast) {
      onFinish(answers);
    } else {
      setIndex((i) => i + 1);
      setPending(null);
      setError("");
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4">
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="text-slate-600">
            {mode === "revision" ? "Revision · " : ""}
            {answeredCount} of {questions.length} answered
          </span>
          <span className="font-semibold text-slate-800">Score: {correctCount}</span>
        </div>
        <ProgressBar
          value={(answeredCount / questions.length) * 100}
          label="Session progress"
          tone="blue"
        />
      </div>

      <QuestionCard
        question={question}
        index={index}
        total={questions.length}
        selected={saved ? saved.selected : pending}
        result={saved ? saved.result : null}
        disabled={checking}
        onSelect={setPending}
      />

      {error && (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={() => onFinish(answers)} className={btnSecondary}>
          End session
        </button>

        {saved ? (
          <button type="button" onClick={next} className={btnPrimary}>
            {isLast ? "Finish and see results" : "Next question"}
          </button>
        ) : (
          <button
            type="button"
            onClick={checkAnswer}
            disabled={pending === null || checking}
            className={btnPrimary}
          >
            {checking ? "Checking…" : "Check answer"}
          </button>
        )}
      </div>
    </div>
  );
}