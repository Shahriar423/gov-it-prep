import { CheckCircle2, Clock, MinusCircle, XCircle } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";

import { fetchResult } from "../../api/exams.api";
import Badge from "../../components/common/Badge";
import Breadcrumbs from "../../components/common/Breadcrumbs";
import ErrorState from "../../components/common/ErrorState";
import MarkdownContent from "../../components/common/MarkdownContent";
import ProgressBar from "../../components/common/ProgressBar";
import Skeleton from "../../components/common/Skeleton";
import StatCard from "../../components/common/StatCard";
import { useAsyncData } from "../../hooks/useAsyncData";
import { formatDate } from "../../utils/format";
import { progressTone } from "../../utils/progress";
import {
  DIFFICULTIES,
  DIFFICULTY_TONE,
  OPTION_LETTERS,
  labelOf,
  sourceTag,
} from "../../utils/questionMeta";
import { formatNegative, formatScore, formatTaken } from "../../utils/time";
import { btnPrimary, btnSecondary, cardClass } from "../../utils/ui";

const STATE_BADGE = {
  correct: { tone: "green", label: "Correct" },
  wrong: { tone: "red", label: "Wrong" },
  unanswered: { tone: "slate", label: "Not answered" },
};

function verdict(percent) {
  if (percent >= 80) return "Excellent work!";
  if (percent >= 60) return "Good job. Keep practising.";
  if (percent >= 40) return "A decent start. Review the explanations below.";
  return "Keep going. Review the chapters and try again.";
}

function optionClass(isCorrect, isSelected) {
  if (isCorrect) return "border-emerald-400 bg-emerald-50";
  if (isSelected) return "border-red-300 bg-red-50";
  return "border-slate-200 bg-white";
}

function ReviewItem({ q }) {
  const badge = STATE_BADGE[q.state];
  return (
    <li className={`${cardClass} p-5`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-slate-700">Question {q.number}</span>
        <Badge tone={badge.tone}>{badge.label}</Badge>
        <Badge tone={DIFFICULTY_TONE[q.difficulty] || "slate"}>{labelOf(DIFFICULTIES, q.difficulty)}</Badge>
        <Badge tone="blue">{sourceTag(q)}</Badge>
        <span className="text-xs text-slate-500">{q.subject_name}</span>
      </div>

      <div className="mt-3">
        <MarkdownContent>{q.text}</MarkdownContent>
      </div>

      <ul className="mt-4 space-y-2">
        {q.options.map((option, i) => {
          const isCorrect = i === q.correct_index;
          const isSelected = i === q.selected_index;
          return (
            <li
              key={i}
              className={`flex items-start gap-3 rounded-lg border px-4 py-2.5 text-sm ${optionClass(
                isCorrect,
                isSelected
              )}`}
            >
              <span className="font-semibold text-slate-600">{OPTION_LETTERS[i]}.</span>
              <span className="min-w-0 flex-1 whitespace-pre-wrap break-words text-slate-800">{option}</span>
              {isCorrect && <span className="shrink-0 text-xs font-semibold text-emerald-700">Correct answer</span>}
              {isSelected && !isCorrect && (
                <span className="shrink-0 text-xs font-semibold text-red-700">Your answer</span>
              )}
              {isSelected && isCorrect && (
                <span className="shrink-0 text-xs font-semibold text-emerald-700">· Your answer</span>
              )}
            </li>
          );
        })}
      </ul>

      {q.explanation && (
        <div className="mt-4 border-t border-slate-100 pt-3">
          <p className="mb-1 text-sm font-medium text-slate-700">Explanation</p>
          <MarkdownContent>{q.explanation}</MarkdownContent>
        </div>
      )}

      {q.chapter && (
        <p className="mt-3 text-sm">
          <Link to={`/chapters/${q.chapter.id}`} className="font-medium text-blue-700 hover:underline">
            Review the chapter: {q.chapter.title}
          </Link>
        </p>
      )}
    </li>
  );
}

export default function ExamResultPage() {
  const { attemptId } = useParams();
  const { data: result, loading, error, reload } = useAsyncData(
    () => fetchResult(attemptId),
    attemptId
  );
  const [filter, setFilter] = useState("all");

  if (loading) {
    return (
      <div aria-busy="true" className="space-y-4">
        <Skeleton className="h-6 w-56" />
        <Skeleton className="h-48" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (error || !result) {
    return (
      <div>
        <Breadcrumbs items={[{ label: "Mock exams", to: "/exams" }, { label: "Result" }]} />
        <ErrorState message={error || "Result not found."} onRetry={reload} />
        <div className="mt-4 flex gap-4 text-sm">
          <Link to={`/exams/attempts/${attemptId}`} className="text-blue-700 underline">
            Go to the exam
          </Link>
          <Link to="/exams" className="text-blue-700 underline">
            Back to mock exams
          </Link>
        </div>
      </div>
    );
  }

  const tabs = [
    { key: "all", label: "All", count: result.questions.length },
    { key: "wrong", label: "Wrong", count: result.wrong },
    { key: "unanswered", label: "Not answered", count: result.unanswered },
    { key: "correct", label: "Correct", count: result.correct },
  ];
  const shown = filter === "all" ? result.questions : result.questions.filter((q) => q.state === filter);
  const marksLost = Math.round(result.wrong * result.negative_marking * 100) / 100;

  return (
    <div>
      <Breadcrumbs items={[{ label: "Mock exams", to: "/exams" }, { label: result.title }]} />

      {result.timed_out && (
        <p role="status" className="mb-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Time ran out, so this exam was submitted automatically.
        </p>
      )}

      <section className={`${cardClass} p-6 text-center`}>
        <p className="text-sm font-medium text-slate-500">{result.title}</p>
        <p className="mt-2 text-5xl font-bold tracking-tight text-slate-900">
          {formatScore(result.score)}
          <span className="text-2xl font-semibold text-slate-400"> / {result.max_score}</span>
        </p>
        <p className="mt-2 text-lg font-semibold text-slate-700">{result.score_percent}%</p>
        <p className="mt-1 text-sm text-slate-500">{verdict(result.score_percent)}</p>
        <div className="mx-auto mt-4 max-w-xs">
          <ProgressBar value={result.score_percent} label="Score" tone={progressTone(result.score_percent)} />
        </div>
        <p className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm text-slate-500">
          <span className="inline-flex items-center gap-1">
            <Clock className="h-4 w-4" aria-hidden="true" />
            {formatTaken(result.time_taken_seconds)} of {result.duration_minutes} min
          </span>
          <span>{formatNegative(result.negative_marking)}</span>
          <span>{formatDate(result.submitted_at || result.started_at)}</span>
        </p>
      </section>

      <section aria-label="Summary" className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={CheckCircle2}
          tone="green"
          label="Correct"
          value={result.correct}
          caption={`+${result.correct} ${result.correct === 1 ? "mark" : "marks"}`}
        />
        <StatCard
          icon={XCircle}
          tone="amber"
          label="Wrong"
          value={result.wrong}
          caption={marksLost > 0 ? `−${marksLost} marks (negative marking)` : "No marks deducted"}
        />
        <StatCard
          icon={MinusCircle}
          tone="violet"
          label="Not answered"
          value={result.unanswered}
          caption="No marks either way"
        />
        <StatCard
          icon={Clock}
          tone="blue"
          label="Questions"
          value={result.total_questions}
          caption="1 mark each"
        />
      </section>

      {result.weak_spots_added > 0 && (
        <p className="mt-6 rounded-lg bg-slate-100 px-4 py-3 text-sm text-slate-700">
          {result.weak_spots_added} wrong {result.weak_spots_added === 1 ? "answer was" : "answers were"} saved to
          your weak spots for revision.
        </p>
      )}

      {result.subjects.length > 0 && (
        <section aria-label="By subject" className={`${cardClass} mt-6`}>
          <div className="border-b border-slate-100 px-5 py-4">
            <h3 className="font-semibold text-slate-900">By subject</h3>
            <p className="text-sm text-slate-500">Share of questions answered correctly</p>
          </div>
          <ul className="divide-y divide-slate-100">
            {result.subjects.map((s) => (
              <li key={s.name} className="px-5 py-4">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="truncate font-medium text-slate-900">{s.name}</p>
                  <p className="shrink-0 text-sm font-semibold text-slate-700">{s.percent}%</p>
                </div>
                <div className="mt-2">
                  <ProgressBar value={s.percent} label={`${s.name} accuracy`} tone={progressTone(s.percent)} />
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  {s.correct} correct · {s.wrong} wrong · {s.unanswered} not answered
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-label="Review" className="mt-8">
        <h3 className="mb-3 font-semibold text-slate-900">Review your answers</h3>
        <div role="group" aria-label="Filter questions" className="mb-4 flex flex-wrap gap-2">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              aria-pressed={filter === t.key}
              onClick={() => setFilter(t.key)}
              className={`rounded-full px-3 py-1.5 text-sm font-medium ${
                filter === t.key
                  ? "bg-blue-600 text-white"
                  : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              {t.label} ({t.count})
            </button>
          ))}
        </div>

        {shown.length === 0 ? (
          <p className={`${cardClass} p-5 text-sm text-slate-600`}>No questions in this group.</p>
        ) : (
          <ul className="space-y-4">
            {shown.map((q) => (
              <ReviewItem key={q.id} q={q} />
            ))}
          </ul>
        )}
      </section>

      <div className="mt-8 flex flex-wrap gap-3">
        <Link to="/exams" className={btnPrimary}>
          Back to mock exams
        </Link>
        <Link to="/practice" className={btnSecondary}>
          Go to practice
        </Link>
      </div>
    </div>
  );
}