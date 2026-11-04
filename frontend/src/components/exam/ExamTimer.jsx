import { Clock } from "lucide-react";

import { formatClock } from "../../utils/time";

export default function ExamTimer({ secondsLeft }) {
  const urgent = secondsLeft <= 60;
  const warning = secondsLeft <= 300;

  const tone = urgent
    ? "border-red-300 bg-red-50 text-red-700"
    : warning
    ? "border-amber-300 bg-amber-50 text-amber-700"
    : "border-slate-200 bg-white text-slate-900";

  return (
    <div
      role="timer"
      aria-label="Time remaining"
      className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 font-mono text-lg font-bold tabular-nums ${tone} ${
        urgent ? "animate-pulse" : ""
      }`}
    >
      <Clock className="h-5 w-5" aria-hidden="true" />
      {formatClock(secondsLeft)}
    </div>
  );
}