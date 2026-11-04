import { CheckCircle2, Clock, RotateCcw } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

import { fetchRevisionItems } from "../../api/revision.api";
import { useAsyncData } from "../../hooks/useAsyncData";
import { DIFFICULTIES, DIFFICULTY_TONE, labelOf } from "../../utils/questionMeta";
import { dueLabel, plural } from "../../utils/revision";
import { cardClass } from "../../utils/ui";
import Badge from "../common/Badge";
import EmptyState from "../common/EmptyState";
import ErrorState from "../common/ErrorState";
import Pagination from "../common/Pagination";
import Skeleton from "../common/Skeleton";

const PAGE_SIZE = 20;

const TABS = [
  { key: "due", label: "Due now" },
  { key: "upcoming", label: "Upcoming" },
  { key: "mastered", label: "Mastered" },
];

const EMPTY = {
  due: {
    icon: RotateCcw,
    title: "Nothing is due right now",
    text: "Questions appear here when their review date arrives.",
  },
  upcoming: {
    icon: Clock,
    title: "No upcoming reviews",
    text: "Questions you answer wrongly are scheduled here for later review.",
  },
  mastered: {
    icon: CheckCircle2,
    title: "No mastered questions yet",
    text: "Answer a weak question correctly on two reviews in a row to master it.",
  },
};

function statusBadge(item) {
  if (item.status === "mastered") return { tone: "green", label: "Mastered" };
  if (item.status === "due") return { tone: "red", label: "Due now" };
  return { tone: "blue", label: dueLabel(item.next_review_at) };
}

// counts: { due, upcoming, mastered }
export default function RevisionList({ counts }) {
  const [tab, setTab] = useState(() =>
    counts.due > 0 ? "due" : counts.upcoming > 0 ? "upcoming" : "mastered"
  );
  const [page, setPage] = useState(1);

  const { data, loading, error, reload } = useAsyncData(
    () => fetchRevisionItems({ status: tab, page, page_size: PAGE_SIZE }),
    `${tab}:${page}`
  );

  function changeTab(next) {
    setTab(next);
    setPage(1);
  }

  const empty = EMPTY[tab];

  return (
    <section aria-label="Your weak questions">
      <h3 className="mb-3 font-semibold text-slate-900">Your weak questions</h3>

      <div role="group" aria-label="Filter weak questions" className="mb-4 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            aria-pressed={tab === t.key}
            onClick={() => changeTab(t.key)}
            className={`rounded-full px-3 py-1.5 text-sm font-medium ${
              tab === t.key
                ? "bg-blue-600 text-white"
                : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
            }`}
          >
            {t.label} ({counts[t.key]})
          </button>
        ))}
      </div>

      {loading && (
        <div className="space-y-3" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      )}

      {!loading && error && <ErrorState message={error} onRetry={reload} />}

      {!loading && !error && data && data.items.length === 0 && (
        <div className={cardClass}>
          <EmptyState icon={empty.icon} title={empty.title} description={empty.text} />
        </div>
      )}

      {!loading && !error && data && data.items.length > 0 && (
        <>
          <ul className="space-y-3">
            {data.items.map((item) => {
              const badge = statusBadge(item);
              return (
                <li key={item.question_id} className={`${cardClass} p-4`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={badge.tone}>{badge.label}</Badge>
                    <Badge tone={DIFFICULTY_TONE[item.difficulty] || "slate"}>
                      {labelOf(DIFFICULTIES, item.difficulty)}
                    </Badge>
                    <span className="text-xs text-slate-500">
                      Missed {plural(item.wrong_count, "time")}
                      {item.status === "upcoming" && item.correct_streak > 0
                        ? " · 1 correct review so far"
                        : ""}
                    </span>
                  </div>

                  <p className="mt-2 line-clamp-2 whitespace-pre-line font-medium text-slate-900">
                    {item.text}
                  </p>

                  <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs text-slate-500">
                      {item.subject.name}
                      {item.chapter ? ` › ${item.chapter.title}` : ""}
                    </p>
                    {item.chapter && (
                      <Link
                        to={`/chapters/${item.chapter.id}`}
                        className="text-sm font-medium text-blue-700 hover:underline"
                      >
                        Review the chapter
                      </Link>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          <Pagination page={page} pageSize={PAGE_SIZE} total={data.total} onChange={setPage} />
        </>
      )}
    </section>
  );
}