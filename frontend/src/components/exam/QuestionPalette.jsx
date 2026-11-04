export default function QuestionPalette({ questions, answers, flagged, current, onJump }) {
  return (
    <section
      aria-label="Question navigator"
      className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
    >
      <h3 className="text-sm font-semibold text-slate-900">Questions</h3>

      <ul className="mt-3 grid grid-cols-6 gap-2 sm:grid-cols-8 lg:grid-cols-5">
        {questions.map((q, i) => {
          const isAnswered = answers[q.id] !== undefined;
          const isFlagged = flagged.has(q.id);
          const isCurrent = i === current;

          const tone = isAnswered
            ? "border-blue-600 bg-blue-600 text-white"
            : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50";

          return (
            <li key={q.id}>
              <button
                type="button"
                onClick={() => onJump(i)}
                aria-current={isCurrent ? "true" : undefined}
                aria-label={`Question ${i + 1}, ${isAnswered ? "answered" : "not answered"}${
                  isFlagged ? ", marked for review" : ""
                }`}
                className={`relative flex h-9 w-full items-center justify-center rounded-lg border text-sm font-medium ${tone} ${
                  isCurrent ? "ring-2 ring-offset-1 ring-blue-500" : ""
                }`}
              >
                {i + 1}
                {isFlagged && (
                  <span
                    aria-hidden="true"
                    className="absolute -right-1 -top-1 h-3 w-3 rounded-full border border-white bg-amber-500"
                  />
                )}
              </button>
            </li>
          );
        })}
      </ul>

      <ul className="mt-4 space-y-1 text-xs text-slate-500">
        <li className="flex items-center gap-2">
          <span className="h-3 w-3 rounded bg-blue-600" aria-hidden="true" /> Answered
        </li>
        <li className="flex items-center gap-2">
          <span className="h-3 w-3 rounded border border-slate-300 bg-white" aria-hidden="true" /> Not answered
        </li>
        <li className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-amber-500" aria-hidden="true" /> Marked for review
        </li>
      </ul>
    </section>
  );
}