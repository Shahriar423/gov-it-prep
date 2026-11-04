import { Link } from "react-router-dom";

import { btnPrimary } from "../../utils/ui";

export default function TimesUpOverlay({ submitting, error, onRetry, resultPath }) {
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="timesup-title"
      aria-describedby="timesup-desc"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900 px-4"
    >
      <div className="max-w-xl text-center">
        <h1
          id="timesup-title"
          className="text-5xl font-extrabold tracking-tight text-white sm:text-7xl"
        >
          TIME&apos;S UP!
        </h1>

        <p id="timesup-desc" className="mt-5 text-lg text-slate-300">
          {error
            ? error
            : submitting
            ? "Your time has ended. Submitting your answers…"
            : "Your time has ended."}
        </p>

        {error && (
          <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <button type="button" onClick={onRetry} disabled={submitting} className={btnPrimary}>
              {submitting ? "Submitting…" : "Try submitting again"}
            </button>
            <Link to={resultPath} className="text-sm text-slate-300 underline hover:text-white">
              Go to results
            </Link>
          </div>
        )}

        {error && (
          <p className="mt-4 text-sm text-slate-400">
            If submitting keeps failing, your last saved answers are graded automatically a few seconds
            after the deadline.
          </p>
        )}
      </div>
    </div>
  );
}