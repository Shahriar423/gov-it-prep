import { ArrowLeft, ArrowRight, ArrowUp, CheckCircle2, Clock, List, Maximize2, Minimize2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { fetchChapter, setChapterCompletion } from "../../api/content.api";
import ConceptFlow, { extractProcessSteps } from "../../components/common/ConceptFlow";
import Breadcrumbs from "../../components/common/Breadcrumbs";
import ErrorState from "../../components/common/ErrorState";
import MarkdownContent from "../../components/common/MarkdownContent";
import ReadingSettings from "../../components/common/ReadingSettings";
import Skeleton from "../../components/common/Skeleton";
import { useAsyncData } from "../../hooks/useAsyncData";
import { SPACING_VALUES, WIDTH_VALUES, useReadingPrefs } from "../../hooks/useReadingPrefs";
import { useTheme } from "../../hooks/useTheme";
import { useWakeLock } from "../../hooks/useWakeLock";
import { getErrorMessage } from "../../utils/errors";
import { extractToc, normalizeLessonContent } from "../../utils/lessonContent";
import { btnPrimary, btnSecondary, cardClass } from "../../utils/ui";

// How far through the article the student has scrolled (0 to 100)
function useReadingProgress(ref, active) {
  const [percent, setPercent] = useState(0);

  useEffect(() => {
    if (!active) return undefined;
    let frame = 0;

    const update = () => {
      frame = 0;
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const total = rect.height - window.innerHeight;
      const value = total <= 0 ? 100 : Math.min(100, Math.max(0, Math.round((-rect.top / total) * 100)));
      setPercent((current) => (current === value ? current : value));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [ref, active]);

  return percent;
}

function estimateMinutes(content) {
  const words = (content || "").trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

export default function ChapterPage() {
  const { chapterId } = useParams();
  const { data: chapter, loading, error, reload, setData } = useAsyncData(
    () => fetchChapter(chapterId),
    chapterId
  );
  const { isDark } = useTheme();
  const { prefs, setPref, reset } = useReadingPrefs();
  const [toggling, setToggling] = useState(false);
  const [toggleError, setToggleError] = useState("");
  const [tocOpen, setTocOpen] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const articleRef = useRef(null);

  const percent = useReadingProgress(articleRef, Boolean(chapter));
  useWakeLock(prefs.keepAwake);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [chapterId]);

  useEffect(() => {
    if (!focusMode) return;
    const onKey = (e) => {
      if (e.key === "Escape") setFocusMode(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [focusMode]);

  const normalized = useMemo(
    () => (chapter?.content ? normalizeLessonContent(chapter.content) : ""),
    [chapter?.content]
  );
  const toc = useMemo(() => extractToc(normalized), [normalized]);
  const processSteps = useMemo(
    () => (chapter?.content ? extractProcessSteps(chapter.content) : []),
    [chapter?.content]
  );
  const readMinutes = useMemo(() => estimateMinutes(chapter?.content), [chapter?.content]);

  async function toggleCompletion() {
    setToggling(true);
    setToggleError("");
    try {
      const result = await setChapterCompletion(chapter.id, !chapter.is_completed);
      setData((current) => (current ? { ...current, is_completed: result.is_completed } : current));
    } catch (err) {
      setToggleError(getErrorMessage(err));
    } finally {
      setToggling(false);
    }
  }

  if (loading) {
    return (
      <div aria-busy="true" className="mx-auto w-full max-w-3xl space-y-4">
        <Skeleton className="h-6 w-64" />
        <Skeleton className="h-10 w-2/3" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (error || !chapter) {
    return (
      <div>
        <Breadcrumbs items={[{ label: "Subjects", to: "/subjects" }, { label: "Not available" }]} />
        <ErrorState message={error || "Chapter not found."} onRetry={reload} />
      </div>
    );
  }

  const hasContent = chapter.content.trim().length > 0;
  const rootClass = [
    "lesson-reading mx-auto w-full pb-24",
    focusMode ? "lesson-focus-mode" : "",
    prefs.font === "serif" ? "lesson-font-serif" : "",
    prefs.sepia && !isDark ? "lesson-sepia" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const rootStyle = {
    "--lesson-font-size": `${prefs.fontSize}px`,
    "--lesson-leading": SPACING_VALUES[prefs.spacing],
  };
  // Focus mode keeps its own fixed centered column (lesson-focus-mode in index.css).
  // Otherwise the article card is the reading column plus its side padding.
  if (!focusMode) {
    rootStyle.maxWidth = `calc(${WIDTH_VALUES[prefs.width]} + 6rem)`;
  }

  return (
    <div className={rootClass} style={rootStyle}>
      {!focusMode && (
        <Breadcrumbs
          items={[
            { label: "Subjects", to: "/subjects" },
            { label: chapter.subject.name, to: `/subjects/${chapter.subject.id}` },
            { label: chapter.title },
          ]}
        />
      )}

      {/* Reading toolbar: stays visible while scrolling */}
      <div className="sticky top-[4.25rem] z-20 mb-4">
        <div className="rounded-xl border border-slate-200 bg-white/90 shadow-sm backdrop-blur">
          <div className="flex items-center justify-between gap-2 px-3 py-1.5 sm:px-4">
            <p className="min-w-0 truncate text-xs text-slate-500 sm:text-sm" aria-live="polite">
              {focusMode ? "Focus mode — press Esc to exit" : `${readMinutes} min read`}
              <span className="font-medium text-slate-700"> · {percent}% read</span>
            </p>
            <div className="flex shrink-0 items-center gap-1">
              <ReadingSettings prefs={prefs} onChange={setPref} onReset={reset} isDark={isDark} />
              <button
                type="button"
                onClick={() => setFocusMode((v) => !v)}
                aria-pressed={focusMode}
                aria-label={focusMode ? "Exit focus mode" : "Enter focus mode"}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-slate-700 transition hover:bg-purple-50 hover:text-purple-700 focus-visible:outline-2 focus-visible:outline-purple-600"
              >
                {focusMode ? (
                  <Minimize2 className="h-4 w-4" aria-hidden="true" />
                ) : (
                  <Maximize2 className="h-4 w-4" aria-hidden="true" />
                )}
                <span className="hidden sm:inline">{focusMode ? "Exit focus" : "Focus"}</span>
              </button>
            </div>
          </div>
          <div
            role="progressbar"
            aria-label="Reading progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            className="h-1 w-full overflow-hidden rounded-b-xl bg-slate-100"
          >
            <div
              className="h-full bg-linear-to-r from-purple-500 to-pink-500 transition-[width] duration-200"
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
      </div>

      <article ref={articleRef} className="lesson-article overflow-hidden rounded-2xl border shadow-sm">
        <header className="lesson-header border-b px-5 py-6 sm:px-8 sm:py-8 lg:px-10">
          <p className="text-xs font-semibold uppercase tracking-wider text-[color:var(--lesson-muted)]">
            {chapter.subject.name}
            {chapter.subject.category ? ` · ${chapter.subject.category}` : ""}
          </p>
          <h1 className="mt-2 text-2xl font-bold leading-tight tracking-tight text-[color:var(--lesson-heading)] sm:text-3xl">
            {chapter.title}
          </h1>
          {chapter.summary && (
            <p className="mt-3 max-w-3xl text-base leading-relaxed text-[color:var(--lesson-muted)]">
              {chapter.summary}
            </p>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-purple-50 px-2.5 py-1 text-xs font-medium text-purple-700">
              <Clock className="h-3.5 w-3.5" aria-hidden="true" />
              {readMinutes} min read
            </span>
            {chapter.is_completed && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800">
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                Completed
              </span>
            )}
          </div>
        </header>

        {toc.length >= 2 && (
          <div className="lesson-divider border-b px-5 py-3 sm:px-8 lg:px-10">
            <button
              type="button"
              onClick={() => setTocOpen((v) => !v)}
              className="flex items-center gap-2 text-sm font-medium text-slate-700 hover:text-blue-700"
              aria-expanded={tocOpen}
            >
              <List className="h-4 w-4" aria-hidden="true" />
              {tocOpen ? "Hide contents" : "On this page"}
            </button>
            {tocOpen && (
              <nav aria-label="Chapter sections" className="mt-3">
                <ol className="columns-1 gap-x-8 space-y-1.5 text-sm sm:columns-2">
                  {toc.map((item) => (
                    <li key={item.id} className={`break-inside-avoid ${item.level === 3 ? "pl-4" : ""}`}>
                      <a
                        href={`#${item.id}`}
                        className="text-slate-600 hover:text-blue-700 hover:underline"
                        onClick={() => setTocOpen(false)}
                      >
                        {item.text}
                      </a>
                    </li>
                  ))}
                </ol>
              </nav>
            )}
          </div>
        )}

        <div className="lesson-body px-5 py-7 sm:px-8 sm:py-10 lg:px-10">
          {hasContent ? (
            <>
              {processSteps.length >= 3 && (
                <div className="mb-8">
                  <ConceptFlow
                    steps={processSteps}
                    title="Visual overview of this topic"
                  />
                </div>
              )}
              <MarkdownContent variant="lesson">{chapter.content}</MarkdownContent>
            </>
          ) : (
            <p className="text-sm text-slate-500">This chapter has no study content yet.</p>
          )}
        </div>
      </article>

      {!focusMode && (
        <>
          <section
            aria-label="Chapter completion"
            className={`${cardClass} mt-6 flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5`}
          >
            <div>
              {chapter.is_completed ? (
                <p className="flex items-center gap-2 text-sm font-medium text-emerald-700">
                  <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
                  You completed this chapter
                </p>
              ) : (
                <p className="text-sm text-slate-600">Finished reading? Mark this chapter as complete.</p>
              )}
              {toggleError && (
                <p role="alert" className="mt-1 text-sm text-red-700">
                  {toggleError}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={toggleCompletion}
              disabled={toggling}
              className={chapter.is_completed ? btnSecondary : btnPrimary}
            >
              {toggling ? "Saving…" : chapter.is_completed ? "Mark as not complete" : "Mark as complete"}
            </button>
          </section>

          <nav aria-label="Chapter navigation" className="mt-6 flex items-stretch justify-between gap-3">
            {chapter.prev_chapter ? (
              <Link
                to={`/chapters/${chapter.prev_chapter.id}`}
                className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm hover:border-blue-300"
              >
                <ArrowLeft className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block text-xs text-slate-500">Previous</span>
                  <span className="block truncate font-medium text-slate-900">{chapter.prev_chapter.title}</span>
                </span>
              </Link>
            ) : (
              <span className="flex-1" />
            )}
            {chapter.next_chapter ? (
              <Link
                to={`/chapters/${chapter.next_chapter.id}`}
                className="flex min-w-0 flex-1 items-center justify-end gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-right text-sm shadow-sm hover:border-blue-300"
              >
                <span className="min-w-0">
                  <span className="block text-xs text-slate-500">Next</span>
                  <span className="block truncate font-medium text-slate-900">{chapter.next_chapter.title}</span>
                </span>
                <ArrowRight className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
              </Link>
            ) : (
              <span className="flex-1" />
            )}
          </nav>
        </>
      )}

      {/* Back to top, once the student has started scrolling */}
      {percent > 4 && (
        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          aria-label="Back to top"
          className="fixed bottom-5 right-4 z-30 flex h-11 w-11 items-center justify-center rounded-full bg-linear-to-br from-purple-600 to-pink-500 text-white shadow-lg shadow-purple-500/30 transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-600 sm:right-6"
        >
          <ArrowUp className="h-5 w-5" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}