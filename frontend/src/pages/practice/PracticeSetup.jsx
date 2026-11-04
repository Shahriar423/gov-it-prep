import { ListChecks, Play } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

import { fetchPracticeOptions, fetchPracticeStats, startPractice } from "../../api/practice.api";
import EmptyState from "../../components/common/EmptyState";
import ErrorState from "../../components/common/ErrorState";
import PageHeader from "../../components/common/PageHeader";
import Skeleton from "../../components/common/Skeleton";
import { useAsyncData } from "../../hooks/useAsyncData";
import { useAuth } from "../../hooks/useAuth";
import { getErrorMessage } from "../../utils/errors";
import { DIFFICULTIES } from "../../utils/questionMeta";
import { btnPrimary, cardClass, inputClass, labelClass } from "../../utils/ui";

const COUNTS = [5, 10, 20, 30, 50];

export default function PracticeSetup({ onStart }) {
  const { user } = useAuth();
  const { data, loading, error, reload } = useAsyncData(
    () => Promise.all([fetchPracticeOptions(), fetchPracticeStats()]),
    "practice-setup"
  );

  const [subjectId, setSubjectId] = useState("");
  const [chapterId, setChapterId] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [count, setCount] = useState("10");
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState("");

  async function handleStart(e) {
    e.preventDefault();
    setStartError("");
    setStarting(true);

    const settings = {
      subject_id: subjectId || null,
      chapter_id: chapterId || null,
      difficulty: difficulty || null,
      count: Number(count),
    };
    try {
      const response = await startPractice(settings);
      onStart(response.questions, settings);
    } catch (err) {
      setStartError(getErrorMessage(err));
      setStarting(false);
    }
  }

  if (loading) {
    return (
      <div aria-busy="true" className="mx-auto max-w-3xl space-y-4">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-24" />
        <Skeleton className="h-80" />
      </div>
    );
  }

  if (error || !data) {
    return <ErrorState message={error || "Could not load practice options."} onRetry={reload} />;
  }

  const [options, stats] = data;
  const subjects = options.subjects;

  if (subjects.length === 0) {
    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader title="Practice" description="Untimed practice with instant feedback." />
        <div className={cardClass}>
          <EmptyState
            icon={ListChecks}
            title="No practice questions yet"
            description={
              user?.role === "admin"
                ? "Add and approve questions in the Question bank to enable practice."
                : "Practice questions will appear here as soon as they are published."
            }
            action={
              user?.role === "admin" ? (
                <Link to="/admin/questions" className={btnPrimary}>
                  Open question bank
                </Link>
              ) : null
            }
          />
        </div>
      </div>
    );
  }

  const subject = subjects.find((s) => s.id === subjectId);
  const chapter = subject?.chapters.find((c) => c.id === chapterId);
  const totalAvailable = subjects.reduce((sum, s) => sum + s.question_count, 0);
  const available = chapter ? chapter.question_count : subject ? subject.question_count : totalAvailable;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Practice"
        description="Untimed practice with instant feedback and explanations. Wrong answers are saved to Weak spots so you can retry them."
      />

      <section aria-label="Your practice so far" className={`${cardClass} mb-6 grid grid-cols-3 divide-x divide-slate-100`}>
        <div className="p-4 text-center">
          <p className="text-2xl font-bold text-slate-900">{stats.answered}</p>
          <p className="text-xs text-slate-500">Questions answered</p>
        </div>
        <div className="p-4 text-center">
          <p className="text-2xl font-bold text-slate-900">{stats.correct}</p>
          <p className="text-xs text-slate-500">Correct</p>
        </div>
        <div className="p-4 text-center">
          <p className="text-2xl font-bold text-slate-900">
            {stats.accuracy_percent === null ? "—" : `${stats.accuracy_percent}%`}
          </p>
          <p className="text-xs text-slate-500">Accuracy</p>
        </div>
      </section>

      <form onSubmit={handleStart} className={`${cardClass} space-y-5 p-5 sm:p-6`}>
        <h3 className="font-semibold text-slate-900">Start a practice session</h3>

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="practice-subject" className={labelClass}>
              Subject
            </label>
            <select
              id="practice-subject"
              value={subjectId}
              onChange={(e) => {
                setSubjectId(e.target.value);
                setChapterId("");
              }}
              className={`${inputClass} mt-1`}
            >
              <option value="">All subjects ({totalAvailable} questions)</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.question_count})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="practice-chapter" className={labelClass}>
              Chapter
            </label>
            <select
              id="practice-chapter"
              value={chapterId}
              disabled={!subject || subject.chapters.length === 0}
              onChange={(e) => setChapterId(e.target.value)}
              className={`${inputClass} mt-1`}
            >
              <option value="">All chapters</option>
              {subject?.chapters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title} ({c.question_count})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="practice-difficulty" className={labelClass}>
              Difficulty
            </label>
            <select
              id="practice-difficulty"
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value)}
              className={`${inputClass} mt-1`}
            >
              <option value="">Any difficulty</option>
              {DIFFICULTIES.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="practice-count" className={labelClass}>
              Number of questions
            </label>
            <select
              id="practice-count"
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

        <p className="text-sm text-slate-500">
          Up to {available} approved {available === 1 ? "question is" : "questions are"} available for
          this selection. If fewer match your difficulty choice, the session will be shorter.
        </p>

        {startError && (
          <p role="alert" className="text-sm text-red-700">
            {startError}
          </p>
        )}

        <button type="submit" disabled={starting} className={btnPrimary}>
          <Play className="h-4 w-4" aria-hidden="true" />
          {starting ? "Starting…" : "Start practice"}
        </button>
      </form>
    </div>
  );
}