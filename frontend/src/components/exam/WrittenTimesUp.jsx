import { Link } from "react-router-dom";

import { btnPrimary } from "../../utils/ui";

export default function WrittenTimesUp() {
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="written-timesup-title"
      aria-describedby="written-timesup-desc"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900 px-4"
    >
      <div className="max-w-xl text-center">
        <h1
          id="written-timesup-title"
          className="text-5xl font-extrabold tracking-tight text-white sm:text-7xl"
        >
          TIME&apos;S UP!
        </h1>
        <p id="written-timesup-desc" className="mt-5 text-lg text-slate-300">
          Your time has ended and the questions are hidden. Stop writing and hand in your answers as instructed.
        </p>
        <Link to="/exams" className={`${btnPrimary} mt-8`}>
          Back to exams
        </Link>
      </div>
    </div>
  );
}