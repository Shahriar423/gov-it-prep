import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import {
  adminCreateChapter,
  adminFetchChapter,
  adminFetchChapters,
  adminUpdateChapter,
} from "../../api/adminContent.api";
import Breadcrumbs from "../../components/common/Breadcrumbs";
import ErrorState from "../../components/common/ErrorState";
import MarkdownContent from "../../components/common/MarkdownContent";
import PageHeader from "../../components/common/PageHeader";
import Skeleton from "../../components/common/Skeleton";
import { useAsyncData } from "../../hooks/useAsyncData";
import { getErrorMessage } from "../../utils/errors";
import { btnPrimary, btnSecondary, cardClass, inputClass, labelClass } from "../../utils/ui";

function ChapterForm({ subject, chapter }) {
  const navigate = useNavigate();
  const isEdit = Boolean(chapter);
  const listPath = `/admin/subjects/${subject.id}/chapters`;

  const [title, setTitle] = useState(chapter?.title ?? "");
  const [summary, setSummary] = useState(chapter?.summary ?? "");
  const [content, setContent] = useState(chapter?.content ?? "");
  const [order, setOrder] = useState(chapter ? String(chapter.order) : "");
  const [isPublished, setIsPublished] = useState(chapter?.is_published ?? false);
  const [tab, setTab] = useState("write");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    const payload = {
      title: title.trim(),
      summary: summary.trim(),
      content,
      order: order === "" ? null : Number(order),
      is_published: isPublished,
    };
    if (payload.title.length < 2) return setError("Title must be at least 2 characters.");
    if (payload.order !== null && (!Number.isInteger(payload.order) || payload.order < 0)) {
      return setError("Order must be a whole number, 0 or higher.");
    }

    setSaving(true);
    try {
      if (isEdit) await adminUpdateChapter(chapter.id, payload);
      else await adminCreateChapter(subject.id, payload);
      navigate(listPath);
    } catch (err) {
      setError(getErrorMessage(err));
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl">
      <Breadcrumbs
        items={[
          { label: "Admin subjects", to: "/admin/subjects" },
          { label: subject.name, to: listPath },
          { label: isEdit ? "Edit chapter" : "New chapter" },
        ]}
      />
      <PageHeader title={isEdit ? "Edit chapter" : "New chapter"} />

      <form onSubmit={handleSubmit} className={`${cardClass} space-y-5 p-5 sm:p-6`}>
        <div>
          <label htmlFor="chapterTitle" className={labelClass}>
            Title
          </label>
          <input
            id="chapterTitle"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={150}
            required
            autoFocus={!isEdit}
            placeholder="e.g. TCP three-way handshake"
            className={`${inputClass} mt-1`}
          />
        </div>

        <div>
          <label htmlFor="chapterSummary" className={labelClass}>
            Short summary <span className="font-normal text-slate-500">(optional)</span>
          </label>
          <textarea
            id="chapterSummary"
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            maxLength={300}
            rows={2}
            className={`${inputClass} mt-1`}
          />
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label htmlFor="chapterOrder" className={labelClass}>
              Order <span className="font-normal text-slate-500">(optional)</span>
            </label>
            <input
              id="chapterOrder"
              type="number"
              min={0}
              value={order}
              onChange={(e) => setOrder(e.target.value)}
              className={`${inputClass} mt-1`}
            />
            <p className="mt-1 text-xs text-slate-500">Lower numbers come first. Empty = add at the end.</p>
          </div>

          <div className="flex items-start sm:pt-7">
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={isPublished}
                onChange={(e) => setIsPublished(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <span>
                <span className="block text-sm font-medium text-slate-800">Published</span>
                <span className="block text-xs text-slate-500">
                  Students can only see published chapters.
                </span>
              </span>
            </label>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between">
            <label htmlFor="chapterContent" className={labelClass}>
              Study content
            </label>
            <div role="tablist" aria-label="Editor mode" className="inline-flex rounded-lg border border-slate-300 p-0.5 text-sm">
              {["write", "preview"].map((mode) => (
                <button
                  key={mode}
                  type="button"
                  role="tab"
                  aria-selected={tab === mode}
                  onClick={() => setTab(mode)}
                  className={`rounded-md px-3 py-1 capitalize ${
                    tab === mode ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>

          {tab === "write" ? (
            <textarea
              id="chapterContent"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              maxLength={50000}
              rows={18}
              spellCheck
              className={`${inputClass} mt-2 font-mono`}
              placeholder={"## Heading\n\nWrite the lesson here using Markdown."}
            />
          ) : (
            <div className="mt-2 min-h-[16rem] rounded-lg border border-slate-200 bg-white p-4">
              {content.trim() ? (
                <MarkdownContent>{content}</MarkdownContent>
              ) : (
                <p className="text-sm text-slate-500">Nothing to preview yet.</p>
              )}
            </div>
          )}
          <p className="mt-1 text-xs text-slate-500">
            Plain text or Markdown. Headings (#), lists, **bold**, tables, links, code blocks (```), and labels like Definition: / Example: / Exam Tip: are formatted automatically. {content.length.toLocaleString()} / 50,000 characters.
          </p>
        </div>

        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}

        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
          <button type="button" onClick={() => navigate(listPath)} disabled={saving} className={btnSecondary}>
            Cancel
          </button>
          <button type="submit" disabled={saving} className={btnPrimary}>
            {saving ? "Saving…" : isEdit ? "Save changes" : "Create chapter"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function AdminChapterEditPage() {
  const { subjectId, chapterId } = useParams();
  const isNew = !chapterId;

  const { data, loading, error, reload } = useAsyncData(async () => {
    if (isNew) {
      const list = await adminFetchChapters(subjectId);
      return { subject: list.subject, chapter: null };
    }
    const chapter = await adminFetchChapter(chapterId);
    return { subject: chapter.subject, chapter };
  }, isNew ? `new-${subjectId}` : `edit-${chapterId}`);

  if (loading) {
    return (
      <div aria-busy="true" className="mx-auto max-w-4xl space-y-4">
        <Skeleton className="h-6 w-64" />
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="mx-auto max-w-4xl">
        <Breadcrumbs items={[{ label: "Admin subjects", to: "/admin/subjects" }, { label: "Not available" }]} />
        <ErrorState message={error || "Not found."} onRetry={reload} />
      </div>
    );
  }

  return <ChapterForm subject={data.subject} chapter={data.chapter} />;
}