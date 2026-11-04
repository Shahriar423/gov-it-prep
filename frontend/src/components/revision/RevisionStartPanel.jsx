import { Play } from "lucide-react";
import { useState } from "react";

import { startRevision } from "../../api/revision.api";
import { getErrorMessage } from "../../utils/errors";
import { plural, relativeTime } from "../../utils/revision";
import { btnPrimary, cardClass, inputClass, labelClass } from "../../utils/ui";

const COUNTS = [5, 10, 20, 30, 50];

export default function RevisionStartPanel({ summary, onStart }) {
  const [subjectId, setSubjectId] = useState("");
  const [count, setCount] = useState("10");
  const [includeUpcoming, setIncludeUpcoming] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");

  const subject = summary.subjects.find((s) => s.id === subjectId);
  const dueCount = subject ? subject.due : summary.due;
  const activeCount = subject ? subject.active : summary.active;
  const available = includeUpcoming ? activeCount : dueCount;
  const sessionSize = Math.min(Number(count), available);

  async function handleStart(e) {
    e.preventDefault();
    setError("");
    setStarting(true);

    const payload = {
      subject_id: subjectId || null,
      count: Number(count),
      include_upcoming: includeUpcoming,
    };
    try {
      const response = await startRevision(payload);
      onStart(response.questions, payload);
    } catch (err) {
      setError(getErrorMessage(err));
      setStarting(false);
    }
  }

  let status;
  if (available > 0) {
    status = `${plural(available, "question")} ${available === 1 ? "is" : "are"} available for this selection. This session will have ${sessionSize}.`;
  } else if (!includeUpcoming && summary.due === 0) {
    status = `You are all caught up. ${
      summary.next_due_at ? `The next review is due ${relativeTime(summary.next_due_at)}.` : ""
    }`;
  } else if (!includeUpcoming) {
    status = "No questions are due in this subject right now.";
  } else {
    status = "No weak-spot questions in this subject.";
  }

  return (
    <section aria-label="Start a revision quiz" className={`${cardClass} p-5 sm:p-6`}>
      <h3 className="font-semibold text-slate-900">Start a revision quiz</h3>
      <p className="mt-1 text-sm text-slate-600">
        Questions you got wrong come back here when they are due. Answer them again to master them.
      </p>

      <form onSubmit={handleStart} className="mt-5 space-y-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="rev-subject" className={labelClass}>
              Subject
            </label>
            <select
              id="rev-subject"
              value={subjectId}
              onChange={(e) => setSubjectId(e.target.value)}
              className={`${inputClass} mt-1`}
            >
              <option value="">All subjects ({summary.due} due)</option>
              {summary.subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.due} due)
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="rev-count" className={labelClass}>
              Number of questions
            </label>
            <select
              id="rev-count"
              value={count}
              onChange={(e) => setCount(e.target.value)}
              className={`${inputClass} mt-1`}
            >
              {COUNTS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
        </div>

        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={includeUpcoming}
            onChange={(e) => setIncludeUpcoming(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
          />
          <span>
            <span className="block text-sm font-medium text-slate-800">
              Include questions that are not due yet
            </span>
            <span className="block text-xs text-slate-500">
              Extra practice. A correct answer will not move a question closer to mastered until it is due, but
              a wrong answer is rescheduled.
            </span>
          </span>
        </label>

        <p className="text-sm text-slate-600">{status}</p>

        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}

        <button type="submit" disabled={starting || available === 0} className={btnPrimary}>
          <Play className="h-4 w-4" aria-hidden="true" />
          {starting
            ? "Starting…"
            : available === 0
            ? "Nothing to revise"
            : `Start revision (${plural(sessionSize, "question")})`}
        </button>
      </form>
    </section>
  );
}