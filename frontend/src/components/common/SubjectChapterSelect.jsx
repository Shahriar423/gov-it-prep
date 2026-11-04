import { adminFetchChapters } from "../../api/adminContent.api";
import { useAsyncData } from "../../hooks/useAsyncData";
import { inputClass, labelClass } from "../../utils/ui";

// Two linked dropdowns: choosing a subject loads that subject's chapters.
// Used by the admin question list (filters) and the question form.
export default function SubjectChapterSelect({
  subjects,
  subjectId,
  chapterId,
  onChange, // (subjectId, chapterId) => void
  allowAll = false,
  idPrefix = "sc",
}) {
  const { data } = useAsyncData(
    () => (subjectId ? adminFetchChapters(subjectId) : Promise.resolve({ chapters: [] })),
    subjectId || "none"
  );
  const chapters = data?.chapters ?? [];

  return (
    <>
      <div>
        <label htmlFor={`${idPrefix}-subject`} className={labelClass}>
          Subject
        </label>
        <select
          id={`${idPrefix}-subject`}
          value={subjectId}
          onChange={(e) => onChange(e.target.value, "")}
          className={`${inputClass} mt-1`}
        >
          <option value="">{allowAll ? "All subjects" : "Select a subject"}</option>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor={`${idPrefix}-chapter`} className={labelClass}>
          Chapter
        </label>
        <select
          id={`${idPrefix}-chapter`}
          value={chapterId}
          disabled={!subjectId}
          onChange={(e) => onChange(subjectId, e.target.value)}
          className={`${inputClass} mt-1`}
        >
          <option value="">{allowAll ? "All chapters" : "No specific chapter"}</option>
          {chapters.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
              {c.is_published ? "" : " (draft)"}
            </option>
          ))}
        </select>
      </div>
    </>
  );
}