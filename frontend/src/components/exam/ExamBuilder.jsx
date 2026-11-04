import { Play } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { checkAvailability, createExam } from "../../api/autoExam.api";
import { useAuth } from "../../hooks/useAuth";
import { getErrorMessage } from "../../utils/errors";
import { formatMinutes } from "../../utils/time";
import { btnPrimary, cardClass, inputClass, labelClass } from "../../utils/ui";

const MARKS_PER_WRITTEN_QUESTION = 10;

const MCQ_COUNTS = [5, 10, 15, 20, 25, 30, 40, 50, 75, 100];
const WRITTEN_COUNTS = [1, 2, 3, 4, 5, 6, 8, 10, 15, 20];
const MCQ_DURATIONS = [1, 5, 10, 15, 20, 30, 45, 60, 90, 120];
const WRITTEN_DURATIONS = [1, 15, 30, 45, 60, 90, 120, 180];

const DEFAULTS = {
  mcq: { count: "20", duration: "30" },
  written: { count: "5", duration: "15" },
};

const TYPE_OPTIONS = [
  { value: "mcq", label: "MCQ" },
  { value: "written", label: "Written" },
];
const DIFFICULTY_OPTIONS = [
  { value: "mixed", label: "Mixed" },
  { value: "easy", label: "Easy" },
  { value: "medium", label: "Medium" },
  { value: "hard", label: "Hard" },
];
const NEGATIVES = [
  { value: "0", label: "None" },
  { value: "0.25", label: "−0.25 per wrong answer" },
  { value: "0.5", label: "−0.50 per wrong answer" },
];

function Segmented({ label, value, options, onChange, disabled }) {
  return (
    <div>
      <p className={labelClass}>{label}</p>
      <div
        role="group"
        aria-label={label}
        className="mt-1 inline-flex overflow-hidden rounded-lg border border-slate-300"
      >
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={value === option.value}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            className={`px-4 py-2 text-sm font-medium disabled:opacity-60 ${
              value === option.value ? "bg-blue-600 text-white" : "bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// builder: { categories: [{ key, label, items, mcq_total, written_total }] }
export default function ExamBuilder({ builder, hasActiveExam, onCreated }) {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [type, setType] = useState("mcq");
  const [categoryKey, setCategoryKey] = useState("technical");
  const [selection, setSelection] = useState("all");
  const [count, setCount] = useState(DEFAULTS.mcq.count);
  const [duration, setDuration] = useState(DEFAULTS.mcq.duration);
  const [difficulty, setDifficulty] = useState("mixed");
  const [negative, setNegative] = useState("0.25");

  const [availability, setAvailability] = useState({ data: null, loading: true, error: "" });
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState("");

  const category = builder.categories.find((c) => c.key === categoryKey);
  const isMcq = type === "mcq";
  const countOf = (item) => (isMcq ? item.mcq_count : item.written_count);
  const categoryTotal = isMcq ? category.mcq_total : category.written_total;

  // Topics grouped by subject (Technical chapters are grouped under their subject)
  const groups = useMemo(() => {
    const map = new Map();
    for (const item of category.items) {
      const key = item.group ?? "";
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(item);
    }
    return [...map.entries()];
  }, [category]);

  function changeType(next) {
    setType(next);
    setCount(DEFAULTS[next].count);
    setDuration(DEFAULTS[next].duration);
    setStartError("");
  }

  function changeCategory(next) {
    setCategoryKey(next);
    setSelection("all");
    setStartError("");
  }

  // Live check of how many approved questions match, before the student starts
  useEffect(() => {
    let cancelled = false;
    setAvailability((a) => ({ ...a, loading: true }));

    const timer = setTimeout(async () => {
      try {
        const data = await checkAvailability({
          type,
          category: categoryKey,
          selection,
          difficulty,
          count: Number(count),
        });
        if (!cancelled) setAvailability({ data, loading: false, error: "" });
      } catch (err) {
        if (!cancelled) setAvailability({ data: null, loading: false, error: getErrorMessage(err) });
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [type, categoryKey, selection, difficulty, count]);

  async function handleStart(e) {
    e.preventDefault();
    setStartError("");
    setStarting(true);
    try {
      const result = await createExam({
        type,
        category: categoryKey,
        selection,
        count: Number(count),
        duration_minutes: Number(duration),
        difficulty,
        negative_marking: isMcq ? Number(negative) : 0,
      });
      onCreated(result.type, result.id);
    } catch (err) {
      setStartError(getErrorMessage(err));
      setStarting(false);
    }
  }

  const counts = isMcq ? MCQ_COUNTS : WRITTEN_COUNTS;
  const durations = isMcq ? MCQ_DURATIONS : WRITTEN_DURATIONS;
  const noun = isMcq ? "MCQ" : "written";
  const { data: avail } = availability;
  const canStart = Boolean(avail?.ok) && !availability.loading && !hasActiveExam && !starting;

  const renderOption = (item) => (
    <option key={item.id} value={item.id} disabled={countOf(item) === 0}>
      {isAdmin ? `${item.label} (${countOf(item)})` : item.label}
    </option>
  );

  return (
    <form onSubmit={handleStart} className={`${cardClass} space-y-5 p-5 sm:p-6`}>
      <div>
        <h3 className="font-semibold text-slate-900">Create an exam</h3>
        <p className="mt-1 text-sm text-slate-600">
          Choose what you want to practise. The exam is built instantly from approved questions.
        </p>
      </div>

      <div className="flex flex-wrap gap-x-8 gap-y-4">
        <Segmented label="Exam type" value={type} options={TYPE_OPTIONS} onChange={changeType} disabled={starting} />
        <Segmented
          label="Category"
          value={categoryKey}
          options={builder.categories.map((c) => ({ value: c.key, label: c.label }))}
          onChange={changeCategory}
          disabled={starting}
        />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="exam-topic" className={labelClass}>
            {categoryKey === "technical" ? "Chapter" : "Subject"}
          </label>
          <select
            id="exam-topic"
            value={selection}
            onChange={(e) => setSelection(e.target.value)}
            disabled={starting}
            className={`${inputClass} mt-1`}
          >
            <option value="all">
              {categoryKey === "technical"
                ? "All Technical chapters"
                : "All Non-Technical subjects (equal split)"}
              {isAdmin ? ` (${categoryTotal})` : ""}
            </option>
            {groups.map(([group, items]) =>
              group ? (
                <optgroup key={group} label={group}>
                  {items.map(renderOption)}
                </optgroup>
              ) : (
                items.map(renderOption)
              )
            )}
          </select>
          {category.items.length === 0 && (
            <p className="mt-1 text-xs text-amber-700">
              {categoryKey === "technical"
                ? "No Technical chapters have been set up yet."
                : "The Non-Technical subjects have not been set up yet."}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="exam-count" className={labelClass}>
            Number of questions
          </label>
          <select
            id="exam-count"
            value={count}
            onChange={(e) => setCount(e.target.value)}
            disabled={starting}
            className={`${inputClass} mt-1`}
          >
            {counts.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          {!isMcq && (
            <p className="mt-1 text-xs text-slate-500">
              Each written question is {MARKS_PER_WRITTEN_QUESTION} marks: {Number(count)} × {MARKS_PER_WRITTEN_QUESTION} ={" "}
              <span className="font-semibold">{Number(count) * MARKS_PER_WRITTEN_QUESTION} marks</span> in total.
            </p>
          )}
        </div>

        <div>
          <label htmlFor="exam-duration" className={labelClass}>
            Duration
          </label>
          <select
            id="exam-duration"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            disabled={starting}
            className={`${inputClass} mt-1`}
          >
            {durations.map((m) => (
              <option key={m} value={m}>
                {m === 1 ? "1 minute (quick test)" : formatMinutes(m)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="exam-difficulty" className={labelClass}>
            Difficulty
          </label>
          <select
            id="exam-difficulty"
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value)}
            disabled={starting}
            className={`${inputClass} mt-1`}
          >
            {DIFFICULTY_OPTIONS.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </select>
        </div>

        {isMcq && (
          <div>
            <label htmlFor="exam-negative" className={labelClass}>
              Negative marking
            </label>
            <select
              id="exam-negative"
              value={negative}
              onChange={(e) => setNegative(e.target.value)}
              disabled={starting}
              className={`${inputClass} mt-1`}
            >
              {NEGATIVES.map((n) => (
                <option key={n.value} value={n.value}>
                  {n.label}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {!isMcq && (
        <p className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-600">
          In a written exam the questions are only displayed with a countdown. You write your answers on paper.
          Nothing is submitted or graded here, and the questions disappear when the time is up.
        </p>
      )}

      {/* Live availability */}
      <div aria-live="polite" className="text-sm">
        {availability.loading && <p className="text-slate-500">Checking available {noun} questions…</p>}
        {!availability.loading && availability.error && <p className="text-red-700">{availability.error}</p>}
        {!availability.loading && avail && (
          <div
            className={`rounded-lg px-4 py-3 ${
              avail.ok ? "bg-emerald-50 text-emerald-900" : "bg-red-50 text-red-800"
            }`}
          >
            {/* Students only see a simple status; bank counts are admin-only */}
            <p>{avail.ok ? (isAdmin ? avail.message : "Ready to start.") : avail.message}</p>
            {isAdmin && avail.parts.length > 0 && (
              <ul className="mt-2 space-y-0.5 text-xs">
                {avail.parts.map((part) => (
                  <li key={part.label}>
                    {part.label}: {part.available} available, {avail.ok ? "will use" : "needs up to"} {part.needed}
                  </li>
                ))}
              </ul>
            )}
            {!isAdmin && !avail.ok && avail.parts.length > 0 && (
              <ul className="mt-2 space-y-0.5 text-xs">
                {avail.parts.map((part) => (
                  <li key={part.label}>
                    {part.label}: not enough questions for this selection
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {hasActiveExam && (
        <p className="text-sm text-amber-800">Finish your exam in progress before starting another.</p>
      )}
      {startError && (
        <p role="alert" className="text-sm text-red-700">
          {startError}
        </p>
      )}

      <button type="submit" disabled={!canStart} className={btnPrimary}>
        <Play className="h-4 w-4" aria-hidden="true" />
        {starting ? "Starting…" : "Start exam"}
      </button>
    </form>
  );
}