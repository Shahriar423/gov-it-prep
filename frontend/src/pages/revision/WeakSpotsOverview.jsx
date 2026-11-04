/**
 * Chapter Performance & Revision Center
 * Keeps existing revision start flow via onStart + revision APIs.
 */
import {
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  FileText,
  PenLine,
  RotateCcw,
  Search,
  Target,
  TrendingUp,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import {
  fetchChapterPerformance,
  fetchWrittenPrep,
  updateWrittenPrep,
} from "../../api/performance.api";
import { startRevision } from "../../api/revision.api";
import Badge from "../../components/common/Badge";
import EmptyState from "../../components/common/EmptyState";
import ErrorState from "../../components/common/ErrorState";
import PageHeader from "../../components/common/PageHeader";
import Skeleton from "../../components/common/Skeleton";
import StatCard from "../../components/common/StatCard";
import { getErrorMessage } from "../../utils/errors";
import { formatDate } from "../../utils/format";
import { btnPrimary, btnSecondary, cardClass, inputClass } from "../../utils/ui";

function statusTone(status) {
  if (status === "weak") return "red";
  if (status === "needs_revision") return "amber";
  if (status === "strong") return "green";
  return "slate";
}

function prepTone(status) {
  if (status === "confident") return "green";
  if (status === "needs_improvement") return "amber";
  if (status === "attempted") return "blue";
  return "slate";
}

function AccuracyBar({ value }) {
  if (value == null) {
    return <div className="h-2 w-full rounded-full bg-slate-100" />;
  }
  const color =
    value < 50 ? "bg-red-500" : value < 75 ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
      <div
        className={`h-full rounded-full ${color}`}
        style={{ width: `${Math.min(100, value)}%` }}
      />
    </div>
  );
}

/** Matches the same rules used in the backend summary counts */
function matchesCardFilter(ch, cardFilter) {
  if (!cardFilter || cardFilter === "all") return true;
  if (cardFilter === "assessed") {
    return ch.questions_attempted > 0 || ch.revision_active > 0;
  }
  if (cardFilter === "weak") {
    return ch.status === "weak";
  }
  if (cardFilter === "need_more_data") {
    return ch.status === "insufficient_data" && ch.questions_attempted > 0;
  }
  if (cardFilter === "need_revision") {
    return ch.status === "needs_revision" || ch.revision_due > 0;
  }
  if (cardFilter === "strong") {
    return ch.status === "strong";
  }
  return true;
}

const CARD_FILTERS = [
  {
    id: "assessed",
    icon: BookOpen,
    tone: "blue",
    label: "Chapters assessed",
    caption: "With attempts or revision items",
    valueKey: "chapters_assessed",
  },
  {
    id: "weak",
    icon: Target,
    tone: "amber",
    label: "Weak",
    caption: "Below 50% accuracy",
    valueKey: "chapters_needing_practice",
  },
  {
    id: "need_more_data",
    icon: Search,
    tone: "slate",
    label: "Need more data",
    caption: "Under 10 answers — not classified",
    valueKey: "chapters_need_more_data",
  },
  {
    id: "need_revision",
    icon: RotateCcw,
    tone: "violet",
    label: "Need revision",
    caption: "Chapter status or due questions",
    valueKey: "chapters_needing_revision",
  },
  {
    id: "strong",
    icon: TrendingUp,
    tone: "green",
    label: "Strong",
    caption: "75%+ accuracy",
    valueKey: "strong_chapters",
  },
];

function McqPerformanceTab({ onStart }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [cardFilter, setCardFilter] = useState("all");
  const [expanded, setExpanded] = useState(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetchChapterPerformance();
      setData(res);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    if (!data?.chapters) return [];
    let list = data.chapters.filter((c) => matchesCardFilter(c, cardFilter));
    if (statusFilter) list = list.filter((c) => c.status === statusFilter);
    if (q.trim()) {
      const n = q.trim().toLowerCase();
      list = list.filter(
        (c) =>
          c.chapter_title.toLowerCase().includes(n) ||
          c.subject_name.toLowerCase().includes(n)
      );
    }
    return list;
  }, [data, q, statusFilter, cardFilter]);

  function handleCardClick(id) {
    setCardFilter((prev) => (prev === id ? "all" : id));
    setExpanded(null);
  }

  async function handleStartRevision() {
    setStartError("");
    setStarting(true);
    try {
      const due = data?.summary?.revision_due_total ?? 0;
      const payload = {
        subject_id: null,
        count: 10,
        include_upcoming: due === 0,
      };
      const response = await startRevision(payload);
      onStart?.(response.questions, payload);
    } catch (err) {
      setStartError(getErrorMessage(err));
      setStarting(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4" aria-busy="true">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!data) return null;

  const { summary, thresholds } = data;
  const later =
    summary.revision_later_total ??
    Math.max(0, (summary.revision_active_total || 0) - (summary.revision_due_total || 0));

  const activeCardLabel = CARD_FILTERS.find((c) => c.id === cardFilter)?.label;

  return (
    <div className="space-y-5">
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {CARD_FILTERS.map((card) => {
          const active = cardFilter === card.id;
          const value = summary[card.valueKey] ?? 0;
          let caption = card.caption;
          if (card.id === "weak") {
            caption = `Below ${thresholds.weak_below}% (enough data)`;
          } else if (card.id === "need_more_data") {
            caption = `Under ${thresholds.min_questions} answers — not classified`;
          } else if (card.id === "strong") {
            caption = `${thresholds.strong_at_or_above}%+ accuracy`;
          }
          return (
            <button
              key={card.id}
              type="button"
              onClick={() => handleCardClick(card.id)}
              aria-pressed={active}
              className={`rounded-2xl text-left transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${
                active
                  ? "ring-2 ring-blue-500 ring-offset-2"
                  : "hover:ring-1 hover:ring-slate-300"
              }`}
            >
              <StatCard
                icon={card.icon}
                tone={card.tone}
                label={card.label}
                value={value}
                caption={caption}
              />
            </button>
          );
        })}
      </section>

      {cardFilter !== "all" && (
        <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
          <span>
            Showing: <span className="font-semibold text-slate-900">{activeCardLabel}</span>
          </span>
          <button
            type="button"
            className="text-blue-600 hover:underline"
            onClick={() => setCardFilter("all")}
          >
            Clear filter
          </button>
        </div>
      )}

      <section
        className={`${cardClass} flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between`}
      >
        <div>
          <p className="text-sm font-semibold text-slate-900">
            {summary.revision_due_total > 0
              ? `${summary.revision_due_total} question${
                  summary.revision_due_total === 1 ? "" : "s"
                } due now`
              : summary.revision_active_total > 0
                ? `${summary.revision_active_total} in queue · ${later} due later`
                : "No questions in revision queue"}
          </p>
          <p className="text-xs text-slate-500">
            Question revision queue (due now / due later · mastered:{" "}
            {summary.revision_mastered_total ?? 0}). Separate from chapter status above.
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
          <div className="flex flex-wrap gap-2">
            {summary.revision_due_total > 0 ? (
              <button
                type="button"
                className={btnPrimary}
                disabled={starting}
                onClick={handleStartRevision}
              >
                <RotateCcw className="h-4 w-4" />
                {starting ? "Starting…" : "Start revision"}
              </button>
            ) : (
              <button
                type="button"
                disabled
                className="inline-flex cursor-not-allowed items-center justify-center gap-2 rounded-lg bg-slate-200 px-4 py-2 text-sm font-semibold text-slate-500"
                title="Nothing is due yet"
              >
                <RotateCcw className="h-4 w-4" />
                Start revision
              </button>
            )}
            <Link to="/practice" className={btnSecondary}>
              Practice
            </Link>
          </div>
          {summary.revision_due_total === 0 && summary.revision_active_total > 0 && (
            <p className="max-w-xs text-right text-xs text-slate-500">
              Nothing due now. {later} scheduled later — come back when they are due.
            </p>
          )}
        </div>
        {startError && (
          <p role="alert" className="w-full text-sm text-red-600">
            {startError}
          </p>
        )}
      </section>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative min-w-[12rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search chapter or subject…"
            className={`${inputClass} pl-9`}
            aria-label="Search chapters"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className={inputClass}
          aria-label="Filter by status"
        >
          <option value="">All statuses</option>
          <option value="weak">Weak</option>
          <option value="needs_revision">Needs revision</option>
          <option value="strong">Strong</option>
          <option value="insufficient_data">Insufficient data</option>
        </select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          title={cardFilter !== "all" ? "No chapters in this group" : "No chapter data yet"}
          description={
            cardFilter !== "all"
              ? "Try another card or clear the filter."
              : "Complete practice or MCQ exams to build chapter performance. Wrong answers also appear in the revision queue."
          }
          action={
            cardFilter !== "all" ? (
              <button type="button" className={btnPrimary} onClick={() => setCardFilter("all")}>
                Show all chapters
              </button>
            ) : (
              <Link to="/practice" className={btnPrimary}>
                Go to practice
              </Link>
            )
          }
        />
      ) : (
        <ul className="space-y-2">
          {filtered.map((ch) => {
            const id = ch.chapter_id || `${ch.subject_name}-${ch.chapter_title}`;
            const open = expanded === id;
            return (
              <li key={id} className={`${cardClass} overflow-hidden`}>
                <button
                  type="button"
                  className="flex w-full items-start gap-3 p-4 text-left hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-blue-600"
                  onClick={() => setExpanded(open ? null : id)}
                  aria-expanded={open}
                >
                  <span className="mt-0.5 text-slate-400">
                    {open ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-slate-900">{ch.chapter_title}</span>
                      <Badge tone={statusTone(ch.status)}>{ch.status_label}</Badge>
                      {ch.revision_due > 0 && (
                        <Badge tone="amber">{ch.revision_due} due</Badge>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500">{ch.subject_name}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
                      <span>
                        {ch.questions_attempted} attempted
                        {ch.accuracy_percent != null && ` · ${ch.accuracy_percent}% accuracy`}
                      </span>
                      {ch.questions_attempted > 0 && (
                        <span>
                          {ch.correct} correct · {ch.incorrect} wrong
                        </span>
                      )}
                      {ch.status === "insufficient_data" &&
                        ch.questions_needed_for_status > 0 && (
                          <span className="text-amber-700">
                            {ch.questions_needed_for_status} more needed to classify
                          </span>
                        )}
                    </div>
                    <div className="mt-2 max-w-md">
                      <AccuracyBar value={ch.accuracy_percent} />
                    </div>
                    <p className="mt-2 text-xs font-medium text-blue-700">
                      {ch.recommended_action}
                    </p>
                  </div>
                </button>

                {open && (
                  <div className="border-t border-slate-100 bg-slate-50/80 px-4 py-3 sm:px-12">
                    <dl className="grid gap-2 text-sm sm:grid-cols-2">
                      <div>
                        <dt className="text-xs text-slate-500">Attempts</dt>
                        <dd className="text-slate-800">
                          {ch.questions_attempted} answered · {ch.correct} correct ·{" "}
                          {ch.incorrect} wrong
                          {ch.accuracy_percent != null
                            ? ` · ${ch.accuracy_percent}%`
                            : ""}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-slate-500">Last attempted</dt>
                        <dd className="text-slate-800">
                          {ch.last_practiced_at
                            ? formatDate(ch.last_practiced_at)
                            : "—"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-slate-500">
                          Wrong questions in revision
                        </dt>
                        <dd className="text-slate-800">
                          {ch.revision_active} scheduled
                          {ch.revision_due > 0
                            ? ` · ${ch.revision_due} due now`
                            : ""}
                          {(ch.revision_later ?? 0) > 0
                            ? ` · ${ch.revision_later} due later`
                            : ""}
                        </dd>
                      </div>
                      {ch.status === "insufficient_data" && (
                        <div>
                          <dt className="text-xs text-slate-500">Classification</dt>
                          <dd className="text-slate-800">
                            Answer {ch.questions_needed_for_status} more to get Weak /
                            Needs revision / Strong
                          </dd>
                        </div>
                      )}
                    </dl>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {ch.chapter_id && (
                        <Link
                          to={`/chapters/${ch.chapter_id}`}
                          className={btnSecondary}
                        >
                          Revise notes
                        </Link>
                      )}
                      {ch.chapter_id && (
                        <Link
                          to={`/practice?chapter_id=${ch.chapter_id}${
                            ch.subject_id ? `&subject_id=${ch.subject_id}` : ""
                          }`}
                          className={btnSecondary}
                        >
                          Practice this chapter
                        </Link>
                      )}
                      {ch.revision_active > 0 && (
                        <button
                          type="button"
                          className={btnPrimary}
                          disabled={starting}
                          onClick={handleStartRevision}
                        >
                          Retry wrong questions
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {(data.unmapped?.length ?? 0) > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-slate-800">Unmapped questions</h3>
          <p className="text-xs text-slate-500">
            These answers have no valid chapter on the question record. They are excluded
            from chapter statistics. An admin can fix mappings in Question bank (set
            chapter_id on each question). Sample question IDs are shown for tracing.
          </p>
          <ul className="space-y-2">
            {data.unmapped.map((ch, i) => (
              <li key={`unmapped-${i}`} className={`${cardClass} p-4`}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-slate-900">{ch.chapter_title}</span>
                  <Badge tone="slate">Unmapped</Badge>
                  {ch.unmap_reason && (
                    <Badge tone="amber">{String(ch.unmap_reason).replace(/_/g, " ")}</Badge>
                  )}
                  <Badge tone={statusTone(ch.status)}>{ch.status_label}</Badge>
                </div>
                <p className="mt-0.5 text-xs text-slate-500">{ch.subject_name}</p>
                <p className="mt-2 text-xs text-slate-600">
                  {ch.questions_attempted} attempted
                  {ch.accuracy_percent != null && ` · ${ch.accuracy_percent}% accuracy`}
                  {ch.questions_attempted > 0 &&
                    ` · ${ch.correct} correct · ${ch.incorrect} wrong`}
                </p>
                {(ch.sample_question_ids?.length ?? 0) > 0 && (
                  <p className="mt-1 font-mono text-[11px] text-slate-500">
                    Sample question IDs: {ch.sample_question_ids.join(", ")}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-xs text-slate-500">
        Thresholds: below {thresholds.weak_below}% = Weak · {thresholds.weak_below}–
        {thresholds.strong_at_or_above - 1}% = Needs revision ·{" "}
        {thresholds.strong_at_or_above}%+ = Strong · under {thresholds.min_questions}{" "}
        answers = Insufficient data. Revision due is tracked separately from accuracy.
        Click a summary card to filter the list; click again to clear.
      </p>
    </div>
  );
}

function WrittenPrepTab() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState(null);
  const [filterChapter, setFilterChapter] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [savingId, setSavingId] = useState(null);
  const [expandedQ, setExpandedQ] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetchWrittenPrep();
      setData(res);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const questions = useMemo(() => {
    if (!data?.questions) return [];
    let list = data.questions;
    if (filterChapter) {
      list = list.filter((q) => (q.chapter_id || "") === filterChapter);
    }
    if (filterStatus) {
      list = list.filter((q) => q.prep_status === filterStatus);
    }
    return list;
  }, [data, filterChapter, filterStatus]);

  async function handleStatusChange(questionId, status, marks) {
    setSavingId(questionId);
    try {
      const updated = await updateWrittenPrep(questionId, {
        status,
        self_assessed_marks: marks ?? null,
      });
      setData((prev) => {
        if (!prev) return prev;
        const questionsNext = prev.questions.map((q) =>
          q.question_id === questionId
            ? {
                ...q,
                prep_status: updated.prep_status,
                self_assessed_marks: updated.self_assessed_marks,
                last_reviewed_at: updated.last_reviewed_at,
              }
            : q
        );
        return { ...prev, questions: questionsNext };
      });
      load();
    } catch (err) {
      alert(getErrorMessage(err));
    } finally {
      setSavingId(null);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4" aria-busy="true">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-48" />
      </div>
    );
  }

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!data) return null;

  const { summary, chapters } = data;

  return (
    <div className="space-y-5">
      <section className={`${cardClass} border-blue-100 bg-blue-50/40 p-4`}>
        <p className="text-sm text-slate-700">
          <span className="font-semibold">Written preparation is self-tracked.</span> Write
          answers on paper, then mark your status here. Self-assessed marks (0–10) are
          personal only and are never mixed with official scores.
        </p>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={FileText}
          tone="blue"
          label="Available questions"
          value={summary.total_questions}
          caption="Approved written questions"
        />
        <StatCard
          icon={PenLine}
          tone="slate"
          label="Not attempted"
          value={summary.not_attempted}
          caption="Still to try on paper"
        />
        <StatCard
          icon={Clock}
          tone="amber"
          label="Needs improvement"
          value={summary.needs_improvement}
          caption="Marked for retry"
        />
        <StatCard
          icon={CheckCircle2}
          tone="green"
          label="Confident"
          value={summary.confident}
          caption="Self-marked as ready"
        />
      </section>

      {chapters.length > 0 && (
        <section className={`${cardClass} overflow-hidden`}>
          <div className="border-b border-slate-100 px-4 py-3">
            <h3 className="text-sm font-semibold text-slate-900">By chapter</h3>
          </div>
          <ul className="divide-y divide-slate-100">
            {chapters.map((ch) => (
              <li
                key={ch.chapter_id || ch.chapter_title}
                className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-medium text-slate-900">{ch.chapter_title}</p>
                  <p className="text-xs text-slate-500">
                    {ch.subject_name} · {ch.available_questions} questions ·{" "}
                    {ch.not_attempted} not attempted · {ch.needs_improvement} need
                    improvement
                  </p>
                  <p className="mt-1 text-xs font-medium text-blue-700">
                    {ch.recommended_action}
                  </p>
                </div>
                <button
                  type="button"
                  className={btnSecondary}
                  onClick={() => setFilterChapter(ch.chapter_id || "")}
                >
                  View questions
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex flex-wrap gap-2">
        <select
          value={filterChapter}
          onChange={(e) => setFilterChapter(e.target.value)}
          className={inputClass}
          aria-label="Filter by chapter"
        >
          <option value="">All chapters</option>
          {chapters.map((ch) => (
            <option key={ch.chapter_id || ch.chapter_title} value={ch.chapter_id || ""}>
              {ch.chapter_title}
            </option>
          ))}
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className={inputClass}
          aria-label="Filter by status"
        >
          <option value="">All statuses</option>
          <option value="not_attempted">Not attempted</option>
          <option value="attempted">Attempted</option>
          <option value="needs_improvement">Needs improvement</option>
          <option value="confident">Confident</option>
        </select>
      </div>

      {questions.length === 0 ? (
        <EmptyState
          icon={PenLine}
          title="No written questions"
          description="Approved written questions will appear here for self-paced preparation."
        />
      ) : (
        <ul className="space-y-2">
          {questions.map((q) => {
            const open = expandedQ === q.question_id;
            return (
              <li key={q.question_id} className={`${cardClass} p-4`}>
                <button
                  type="button"
                  className="flex w-full items-start gap-2 text-left"
                  onClick={() => setExpandedQ(open ? null : q.question_id)}
                >
                  <span className="mt-0.5 text-slate-400">
                    {open ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={prepTone(q.prep_status)}>
                        {q.prep_status.replace(/_/g, " ")}
                      </Badge>
                      <Badge tone="slate">{q.marks} marks</Badge>
                      {q.chapter_title && (
                        <span className="text-xs text-slate-500">{q.chapter_title}</span>
                      )}
                    </div>
                    <p className="mt-1 line-clamp-2 text-sm text-slate-800">{q.text}</p>
                  </div>
                </button>

                {open && (
                  <div className="mt-3 space-y-3 border-t border-slate-100 pt-3 sm:pl-6">
                    <p className="whitespace-pre-wrap text-sm text-slate-800">{q.text}</p>
                    <p className="text-xs text-slate-500">
                      Write your answer on paper (10 marks). Then update your status below.
                    </p>
                    <div className="flex flex-wrap items-end gap-2">
                      <div>
                        <label className="mb-1 block text-xs font-medium text-slate-500">
                          Status
                        </label>
                        <select
                          className={inputClass}
                          value={q.prep_status}
                          disabled={savingId === q.question_id}
                          onChange={(e) =>
                            handleStatusChange(
                              q.question_id,
                              e.target.value,
                              q.self_assessed_marks
                            )
                          }
                        >
                          <option value="not_attempted">Not attempted</option>
                          <option value="attempted">Attempted</option>
                          <option value="needs_improvement">Needs improvement</option>
                          <option value="confident">Confident</option>
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-slate-500">
                          Self-assessed marks (0–10)
                        </label>
                        <input
                          type="number"
                          min={0}
                          max={10}
                          className={`${inputClass} w-24`}
                          defaultValue={q.self_assessed_marks ?? ""}
                          disabled={savingId === q.question_id}
                          onBlur={(e) => {
                            const v = e.target.value;
                            const marks =
                              v === "" ? null : Math.min(10, Math.max(0, Number(v)));
                            if (marks !== q.self_assessed_marks) {
                              handleStatusChange(
                                q.question_id,
                                q.prep_status === "not_attempted"
                                  ? "attempted"
                                  : q.prep_status,
                                marks
                              );
                            }
                          }}
                        />
                      </div>
                    </div>
                    {q.last_reviewed_at && (
                      <p className="text-xs text-slate-500">
                        Last updated {formatDate(q.last_reviewed_at)}
                      </p>
                    )}
                    {q.has_model_answer && q.prep_status !== "not_attempted" && (
                      <p className="text-xs text-emerald-700">
                        A model answer is available from admin — check your notes materials
                        if linked.
                      </p>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default function WeakSpotsOverview({ onStart }) {
  const [tab, setTab] = useState("mcq");

  return (
    <div>
      <PageHeader
        title="Chapter Performance & Revision Center"
        description="See which chapters need practice or revision, then act on the next recommended step."
      />

      <div className="mb-6 flex gap-1 rounded-lg border border-slate-200 bg-slate-100 p-1 sm:w-fit">
        {[
          { id: "mcq", label: "MCQ performance", icon: FileText },
          { id: "written", label: "Written preparation", icon: PenLine },
        ].map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition ${
              tab === id
                ? "bg-white text-blue-700 shadow-sm"
                : "text-slate-600 hover:text-slate-900"
            }`}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>

      {tab === "mcq" ? <McqPerformanceTab onStart={onStart} /> : <WrittenPrepTab />}
    </div>
  );
}