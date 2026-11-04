import { Check, Lightbulb, X } from "lucide-react";
import { Link } from "react-router-dom";

import Badge from "../common/Badge";
import MarkdownContent from "../common/MarkdownContent";
import {
  DIFFICULTIES,
  DIFFICULTY_TONE,
  OPTION_LETTERS,
  labelOf,
  sourceTag,
} from "../../utils/questionMeta";
import { plural } from "../../utils/revision";

function optionClass({ answered, isSelected, isCorrect }) {
  const base =
    "flex w-full cursor-pointer items-start gap-3 rounded-lg border px-4 py-3 text-left text-sm transition focus-within:ring-2 focus-within:ring-blue-500/40";
  if (!answered) {
    return `${base} ${
      isSelected
        ? "border-blue-500 bg-blue-50 text-slate-900"
        : "border-slate-200 bg-white text-slate-800 hover:border-blue-300 hover:bg-slate-50"
    }`;
  }
  if (isCorrect) return `${base} cursor-default border-emerald-500 bg-emerald-50 text-slate-900`;
  if (isSelected) return `${base} cursor-default border-red-400 bg-red-50 text-slate-900`;
  return `${base} cursor-default border-slate-200 bg-white text-slate-500`;
}

function letterClass({ answered, isSelected, isCorrect }) {
  const base = "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold";
  if (answered && isCorrect) return `${base} bg-emerald-500 text-white`;
  if (answered && isSelected) return `${base} bg-red-500 text-white`;
  if (!answered && isSelected) return `${base} bg-blue-600 text-white`;
  return `${base} bg-slate-100 text-slate-600`;
}

// What happened to this question in the student's revision schedule
function revisionNote(result) {
  if (result.is_correct) {
    if (result.mastered) return "Mastered! This question has left your weak spots.";
    if (result.next_review_days) {
      return `Good progress. It comes back for one more review in ${plural(result.next_review_days, "day")}.`;
    }
    return null;
  }
  if (result.added_to_weak_spots) {
    return `Saved to your weak spots. It will be due for revision in ${plural(
      result.next_review_days ?? 2,
      "day"
    )}.`;
  }
  return null;
}

/**
 * question: { id, text, options, difficulty, source, exam_name, year, subject }
 * selected: index chosen by the student (or null)
 * result:   null before checking, or the answer result from the server
 */
export default function QuestionCard({ question, index, total, selected, result, disabled, onSelect }) {
  const answered = Boolean(result);
  const note = answered ? revisionNote(result) : null;

  return (
    <article className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-5 py-3">
        <span className="text-sm font-semibold text-slate-700">
          Question {index + 1} of {total}
        </span>
        <Badge tone={DIFFICULTY_TONE[question.difficulty] || "slate"}>
          {labelOf(DIFFICULTIES, question.difficulty)}
        </Badge>
        <Badge tone="blue">{sourceTag(question)}</Badge>
        <span className="text-xs text-slate-500">{question.subject?.name}</span>
      </div>

      <div className="px-5 py-5">
        <MarkdownContent>{question.text}</MarkdownContent>

        <fieldset className="mt-5">
          <legend className="sr-only">Choose one answer</legend>
          <div className="space-y-2">
            {question.options.map((option, i) => {
              const isSelected = selected === i;
              const isCorrect = answered && result.correct_index === i;
              const state = { answered, isSelected, isCorrect };
              return (
                <label key={i} className={optionClass(state)}>
                  <input
                    type="radio"
                    name={`question-${question.id}`}
                    className="sr-only"
                    checked={isSelected}
                    disabled={disabled || answered}
                    onChange={() => onSelect(i)}
                  />
                  <span className={letterClass(state)} aria-hidden="true">
                    {answered && isCorrect ? (
                      <Check className="h-3.5 w-3.5" />
                    ) : answered && isSelected ? (
                      <X className="h-3.5 w-3.5" />
                    ) : (
                      OPTION_LETTERS[i]
                    )}
                  </span>
                  <span className="min-w-0 flex-1 whitespace-pre-wrap break-words">{option}</span>
                  {answered && isCorrect && <span className="sr-only">(correct answer)</span>}
                  {answered && isSelected && !isCorrect && <span className="sr-only">(your answer)</span>}
                </label>
              );
            })}
          </div>
        </fieldset>
      </div>

      {answered && (
        <div
          role="status"
          className={`border-t px-5 py-4 ${
            result.is_correct ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"
          }`}
        >
          <p className={`font-semibold ${result.is_correct ? "text-emerald-800" : "text-red-800"}`}>
            {result.is_correct
              ? "Correct!"
              : `Incorrect. The correct answer is ${OPTION_LETTERS[result.correct_index]}.`}
          </p>

          {result.explanation && (
            <div className="mt-3">
              <p className="mb-1 flex items-center gap-2 text-sm font-medium text-slate-700">
                <Lightbulb className="h-4 w-4" aria-hidden="true" />
                Explanation
              </p>
              <MarkdownContent>{result.explanation}</MarkdownContent>
            </div>
          )}

          {note && <p className="mt-3 text-sm text-slate-700">{note}</p>}

          {result.chapter && (
            <p className="mt-3 text-sm">
              <Link to={`/chapters/${result.chapter.id}`} className="font-medium text-blue-700 hover:underline">
                Review the chapter: {result.chapter.title}
              </Link>
            </p>
          )}
        </div>
      )}
    </article>
  );
}