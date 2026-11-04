export const KIND_LABELS = {
  notes: "Study notes",
  previous_year: "Previous-year paper",
};
export const KIND_TONE = { notes: "blue", previous_year: "slate" };

export const STATUS_LABELS = { ready: "Ready", processing: "Processing", failed: "Failed" };
export const STATUS_TONE = { ready: "green", processing: "amber", failed: "red" };

export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function examTagsLabel(tags) {
  return tags && tags.length > 0 ? tags.join(", ") : "All exams";
}

// "networking_notes-2024.pdf" -> "networking notes 2024"
export function titleFromFilename(name) {
  return name
    .replace(/\.pdf$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 150);
}

export function emptyMeta() {
  return { title: "", kind: "notes", subjectId: "", chapterId: "", examTags: [], year: "", paperType: "mcq" };
}

export function metaFromMaterial(material) {
  return {
    title: material.title,
    kind: material.kind,
    subjectId: material.subject?.id ?? "",
    chapterId: material.chapter?.id ?? "",
    examTags: [...material.exam_tags],
    year: material.year ? String(material.year) : "",
    paperType: "mcq", // the question paper type is chosen at upload and cannot be changed afterwards
  };
}

// Same rules as the backend. The backend is still the one that enforces them.
export function validateMeta(meta) {
  if (meta.title.trim().length < 3) return "The title must be at least 3 characters long.";
  if (!meta.subjectId) return "Please choose a subject.";
  if (meta.kind === "previous_year" && meta.year !== "") {
    const year = Number(meta.year);
    if (!Number.isInteger(year) || year < 1980 || year > 2100) {
      return "Year must be a number between 1980 and 2100.";
    }
  }
  return null;
}

export function toPayload(meta) {
  return {
    title: meta.title.trim(),
    kind: meta.kind,
    subject_id: meta.subjectId,
    chapter_id: meta.chapterId || null,
    exam_tags: meta.examTags,
    year: meta.kind === "previous_year" && meta.year !== "" ? Number(meta.year) : null,
    paper_type: meta.kind === "previous_year" ? meta.paperType : null,
  };
}