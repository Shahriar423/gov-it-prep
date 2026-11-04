import { ArrowLeft, ArrowRight, CheckCircle2, List, Minus, Plus, RotateCcw, Maximize2, Minimize2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { fetchChapter, setChapterCompletion } from "../../api/content.api";
import ConceptFlow, { extractProcessSteps } from "../../components/common/ConceptFlow";
import Breadcrumbs from "../../components/common/Breadcrumbs";
import ErrorState from "../../components/common/ErrorState";
import MarkdownContent from "../../components/common/MarkdownContent";
import Skeleton from "../../components/common/Skeleton";
import { useAsyncData } from "../../hooks/useAsyncData";
import { getErrorMessage } from "../../utils/errors";
import { extractToc, normalizeLessonContent } from "../../utils/lessonContent";
import { btnPrimary, btnSecondary, cardClass } from "../../utils/ui";

const FONT_MIN = 15;
const FONT_MAX = 20;
const FONT_DEFAULT = 16.5;

export default function ChapterPage() {
  const { chapterId } = useParams();
  const { data: chapter, loading, error, reload, setData } = useAsyncData(
    () => fetchChapter(chapterId),
    chapterId
  );
  const [toggling, setToggling] = useState(false);
  const [toggleError, setToggleError] = useState("");
  const [tocOpen, setTocOpen] = useState(false);
  const [fontSize, setFontSize] = useState(FONT_DEFAULT);
  const [focusMode, setFocusMode] = useState(false);

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
      <div aria-busy="true" className="w-full space-y-4">
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

  return (
    <div
      className={`lesson-reading w-full pb-10 ${focusMode ? "lesson-focus-mode" : ""}`}
      style={{ "--lesson-font-size": `${fontSize}px` }}
    >
      {!focusMode && (
        <Breadcrumbs
          items={[
            { label: "Subjects", to: "/subjects" },
            { label: chapter.subject.name, to: `/subjects/${chapter.subject.id}` },
            { label: chapter.title },
          ]}
        />
      )}

      {/* Compact reading toolbar */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-500 sm:text-sm">
          {focusMode ? "Focus mode — press Esc to exit" : "Reading view"}
        </p>
        <div
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1 shadow-sm"
          role="group"
          aria-label="Reading controls"
        >
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 disabled:opacity-40"
            aria-label="Decrease font size"
            disabled={fontSize <= FONT_MIN}
            onClick={() => setFontSize((s) => Math.max(FONT_MIN, +(s - 1).toFixed(1)))}
          >
            <Minus className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            className="inline-flex h-8 items-center justify-center rounded-md px-2 text-xs font-medium text-slate-600 hover:bg-slate-100"
            aria-label="Reset font size"
            onClick={() => setFontSize(FONT_DEFAULT)}
            title="Reset font size"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 disabled:opacity-40"
            aria-label="Increase font size"
            disabled={fontSize >= FONT_MAX}
            onClick={() => setFontSize((s) => Math.min(FONT_MAX, +(s + 1).toFixed(1)))}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
          </button>
          <span className="mx-1 h-5 w-px bg-slate-200" aria-hidden="true" />
          <button
            type="button"
            className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-slate-700 hover:bg-slate-100"
            aria-label={focusMode ? "Exit focus mode" : "Enter focus mode"}
            aria-pressed={focusMode}
            onClick={() => setFocusMode((v) => !v)}
          >
            {focusMode ? (
              <>
                <Minimize2 className="h-3.5 w-3.5" aria-hidden="true" />
                Exit focus
              </>
            ) : (
              <>
                <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
                Focus
              </>
            )}
          </button>
        </div>
      </div>

      <article className={`${cardClass} overflow-hidden`}>
        <header className="border-b border-slate-100 bg-gradient-to-b from-slate-50 to-white px-5 py-5 sm:px-8 sm:py-6 lg:px-10">
          <p className="text-xs font-medium uppercase tracking-wide text-[#64748B]">
            {chapter.subject.name}
            {chapter.subject.category ? ` · ${chapter.subject.category}` : ""}
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-[#111827] sm:text-3xl">
            {chapter.title}
          </h1>
          {chapter.summary && (
            <p className="mt-3 max-w-3xl text-sm leading-relaxed text-[#64748B] sm:text-base">
              {chapter.summary}
            </p>
          )}
          {chapter.is_completed && (
            <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800">
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
              Completed
            </p>
          )}
        </header>

        {toc.length >= 2 && (
          <div className="border-b border-slate-100 px-5 py-3 sm:px-8 lg:px-10">
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

        <div className="lesson-body px-5 py-6 sm:px-8 sm:py-8 lg:px-10">
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
              <MarkdownContent>{chapter.content}</MarkdownContent>
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
    </div>
  );
}