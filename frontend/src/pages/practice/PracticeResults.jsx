import { useState } from "react";
import { Link } from "react-router-dom";

import MarkdownContent from "../../components/common/MarkdownContent";
import ProgressBar from "../../components/common/ProgressBar";
import { getErrorMessage } from "../../utils/errors";
import { OPTION_LETTERS } from "../../utils/questionMeta";
import { progressTone } from "../../utils/progress";
import { plural } from "../../utils/revision";
import { btnPrimary, btnSecondary, cardClass } from "../../utils/ui";

function verdict(percent) {
  if (percent >= 80) return "Excellent work!";
  if (percent >= 60) return "Good job. Keep practising.";
  if (percent >= 40) return "A decent start. Review the explanations below.";
  return "Keep going. Review the chapters and try again.";
}

export default function PracticeResults({ questions, answers, onRetry, onNew, mode = "practice" }) {
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState("");

  const isRevision = mode === "revision";

  const answered = questions.filter((q) => answers[q.id]);
  const wrong = answered.filter((q) => !answers[q.id].result.is_correct);
  const correct = answered.length - wrong.length;
  const percent = answered.length ? Math.round((correct * 100) / answered.length) : 0;
  const skipped = questions.length - answered.length;
  const savedToWeakSpots = answered.filter((q) => answers[q.id].result.added_to_weak_spots).length;
  const masteredCount = answered.filter((q) => answers[q.id].result.mastered).length;

  async function retry() {
    setRetrying(true);
    setError("");
    try {
      await onRetry();
    } catch (err) {
      setError(getErrorMessage(err));
      setRetrying(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <section className={`${cardClass} p-6 text-center`}>
        <p className="text-sm font-medium text-slate-500">
          {isRevision ? "Revision complete" : "Session complete"}
        </p>
        <p className="mt-2 text-5xl font-bold tracking-tight text-slate-900">{percent}%</p>
        <p className="mt-2 text-slate-700">
          {correct} of {answered.length} correct
          {skipped > 0 && ` · ${skipped} not attempted`}
        </p>
        <p className="mt-1 text-sm text-slate-500">{verdict(percent)}</p>
        <div className="mx-auto mt-4 max-w-xs">
          <ProgressBar value={percent} label="Score" tone={progressTone(percent)} />
        </div>

        {isRevision ? (
          <div className="mt-4 space-y-1 text-sm text-slate-600">
            {masteredCount > 0 && (
              <p>
                {plural(masteredCount, "question")} mastered and removed from your weak spots.
              </p>
            )}
            {savedToWeakSpots > 0 && (
              <p>
                {plural(savedToWeakSpots, "question")} still{" "}
                {savedToWeakSpots === 1 ? "needs" : "need"} work and will come back in 2 days.
              </p>
            )}
          </div>
        ) : (
          savedToWeakSpots > 0 && (
            <p className="mt-4 text-sm text-slate-600">
              {plural(savedToWeakSpots, "question")} {savedToWeakSpots === 1 ? "was" : "were"} saved to your
              weak spots for revision.{" "}
              <Link to="/weak-spots" className="font-medium text-blue-700 hover:underline">
                View weak spots
              </Link>
            </p>
          )
        )}

        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button type="button" onClick={retry} disabled={retrying} className={btnPrimary}>
            {retrying ? "Starting…" : isRevision ? "Revise more" : "Practice again"}
          </button>
          <button type="button" onClick={onNew} disabled={retrying} className={btnSecondary}>
            {isRevision ? "Back to weak spots" : "Change settings"}
          </button>
        </div>
        {error && (
          <p role="alert" className="mt-3 text-sm text-red-700">
            {error}
          </p>
        )}
      </section>

      <section className="mt-6">
        <h3 className="mb-3 font-semibold text-slate-900">
          {wrong.length === 0 ? "No mistakes this time" : `Review your mistakes (${wrong.length})`}
        </h3>

        {wrong.length === 0 ? (
          <p className={`${cardClass} p-5 text-sm text-slate-600`}>
            {isRevision
              ? "You answered every question correctly. Great revision!"
              : "You answered every attempted question correctly. Try a harder difficulty or a different chapter."}
          </p>
        ) : (
          <ul className="space-y-4">
            {wrong.map((q) => {
              const { selected, result } = answers[q.id];
              return (
                <li key={q.id} className={`${cardClass} p-5`}>
                  <MarkdownContent>{q.text}</MarkdownContent>

                  <dl className="mt-4 space-y-2 text-sm">
                    <div className="rounded-lg bg-red-50 px-3 py-2">
                      <dt className="font-medium text-red-800">Your answer</dt>
                      <dd className="whitespace-pre-wrap text-slate-800">
                        {OPTION_LETTERS[selected]}. {q.options[selected]}
                      </dd>
                    </div>
                    <div className="rounded-lg bg-emerald-50 px-3 py-2">
                      <dt className="font-medium text-emerald-800">Correct answer</dt>
                      <dd className="whitespace-pre-wrap text-slate-800">
                        {OPTION_LETTERS[result.correct_index]}. {q.options[result.correct_index]}
                      </dd>
                    </div>
                  </dl>

                  {result.explanation && (
                    <div className="mt-4 border-t border-slate-100 pt-3">
                      <p className="mb-1 text-sm font-medium text-slate-700">Explanation</p>
                      <MarkdownContent>{result.explanation}</MarkdownContent>
                    </div>
                  )}

                  {result.chapter && (
                    <p className="mt-3 text-sm">
                      <Link
                        to={`/chapters/${result.chapter.id}`}
                        className="font-medium text-blue-700 hover:underline"
                      >
                        Review the chapter: {result.chapter.title}
                      </Link>
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}