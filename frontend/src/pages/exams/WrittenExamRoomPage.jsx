import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { fetchWrittenSession, finishWrittenSession } from "../../api/autoExam.api";
import ConfirmDialog from "../../components/common/ConfirmDialog";
import ErrorState from "../../components/common/ErrorState";
import MarkdownContent from "../../components/common/MarkdownContent";
import Skeleton from "../../components/common/Skeleton";
import ExamTimer from "../../components/exam/ExamTimer";
import WrittenTimesUp from "../../components/exam/WrittenTimesUp";
import { useAsyncData } from "../../hooks/useAsyncData";
import { useCountdown } from "../../hooks/useCountdown";
import { getErrorMessage } from "../../utils/errors";
import { formatMinutes } from "../../utils/time";
import { btnPrimary, btnSecondary, cardClass } from "../../utils/ui";

function EndedScreen({ reason }) {
  // An exam that ran out of time always shows the big TIME'S UP! message, never the questions
  if (reason === "time_up") return <WrittenTimesUp />;

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-bold text-slate-900">Exam finished</h1>
        <p className="mt-2 text-slate-600">
          This written exam has ended. Its questions are no longer shown.
        </p>
        <Link to="/exams" className={`${btnPrimary} mt-6`}>
          Back to exams
        </Link>
      </div>
    </div>
  );
}

function WrittenRoom({ session }) {
  // The server decides when the exam ends; this countdown is only a display of the time left
  const [endAt] = useState(() => Date.now() + session.remaining_seconds * 1000);
  const secondsLeft = useCountdown(endAt);
  const timeUp = secondsLeft === 0;

  const [finished, setFinished] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [finishError, setFinishError] = useState("");
  const notified = useRef(false);

  // When time is up, tell the server so it ends the session and removes the stored questions
  useEffect(() => {
    if (timeUp && !notified.current) {
      notified.current = true;
      finishWrittenSession(session.id).catch(() => {});
    }
  }, [timeUp, session.id]);

  async function finishEarly() {
    setFinishing(true);
    setFinishError("");
    try {
      await finishWrittenSession(session.id);
      setConfirmOpen(false);
      setFinished(true);
    } catch (err) {
      setFinishError(getErrorMessage(err));
    } finally {
      setFinishing(false);
    }
  }

  // The questions are not rendered at all once time is up or the exam has been finished
  if (timeUp) return <WrittenTimesUp />;
  if (finished) return <EndedScreen reason="finished_early" />;

  const announcement =
    secondsLeft === 300 ? "5 minutes remaining" : secondsLeft === 60 ? "1 minute remaining" : "";

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <p className="sr-only" aria-live="assertive">
        {announcement}
      </p>

      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold">{session.title}</h1>
            <p className="text-xs text-slate-500">
              Written exam · {session.question_count} questions · {session.total_marks} marks
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <ExamTimer secondsLeft={secondsLeft} />
            <button type="button" onClick={() => setConfirmOpen(true)} className={btnSecondary}>
              Finish early
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6">
        <p className="mb-6 rounded-lg bg-blue-50 px-4 py-3 text-sm text-blue-900">
          Write your answers on paper. Nothing you write is saved or graded here. You have{" "}
          {formatMinutes(session.duration_minutes)} in total, and the questions disappear when the time is up.
        </p>

        <ol className="space-y-4">
          {session.questions.map((q) => (
            <li key={q.id} className={`${cardClass} p-5`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-slate-700">Question {q.number}</h2>
                <span className="rounded-full bg-blue-50 px-3 py-1 text-sm font-semibold text-blue-700">
                  [{q.marks} Marks]
                </span>
              </div>
              <div className="mt-3">
                <MarkdownContent>{q.text}</MarkdownContent>
              </div>
              <p className="mt-3 text-xs text-slate-500">
                {q.subject_name}
                {q.chapter_title ? ` › ${q.chapter_title}` : ""}
              </p>
            </li>
          ))}
        </ol>

        <p className="mt-6 text-center text-sm font-medium text-slate-600">
          Total: {session.total_marks} marks
        </p>
      </main>

      {confirmOpen && (
        <ConfirmDialog
          title="Finish this exam?"
          message="The questions will be hidden and cannot be shown again. You can start a new exam afterwards."
          confirmLabel="Finish exam"
          confirmTone="primary"
          busy={finishing}
          error={finishError}
          onConfirm={finishEarly}
          onCancel={() => setConfirmOpen(false)}
        />
      )}
    </div>
  );
}

export default function WrittenExamRoomPage() {
  const { sessionId } = useParams();
  const { data, loading, error, reload } = useAsyncData(() => fetchWrittenSession(sessionId), sessionId);

  if (loading) {
    return (
      <div aria-busy="true" className="mx-auto max-w-3xl space-y-4 p-6">
        <Skeleton className="h-12" />
        <Skeleton className="h-48" />
        <Skeleton className="h-48" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="mx-auto max-w-lg space-y-4 p-6">
        <ErrorState message={error || "Written exam not found."} onRetry={reload} />
        <Link to="/exams" className="text-sm text-blue-700 underline">
          Back to exams
        </Link>
      </div>
    );
  }

  // The server returns no questions once the exam has ended (deadline passed or finished early)
  if (data.status !== "in_progress") return <EndedScreen reason={data.end_reason} />;

  return <WrittenRoom key={data.id} session={data} />;
}