export const DIFFICULTIES = [
  { value: "easy", label: "Easy" },
  { value: "medium", label: "Medium" },
  { value: "hard", label: "Hard" },
];

export const SOURCES = [
  { value: "pyq", label: "Previous year (PYQ)" },
  { value: "notes", label: "Study notes" },
  { value: "ai", label: "AI-generated" },
];

export const STATUSES = [
  { value: "draft", label: "Draft" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
];

export const OPTION_LETTERS = ["A", "B", "C", "D", "E", "F"];

export const DIFFICULTY_TONE = { easy: "green", medium: "amber", hard: "red" };
export const STATUS_TONE = { approved: "green", draft: "amber", rejected: "red" };

export function labelOf(list, value) {
  return list.find((item) => item.value === value)?.label ?? value;
}

// Short tag such as "PYQ · Assistant Programmer 2019"
export function sourceTag(question) {
  if (question.source === "pyq") {
    const parts = [question.exam_name, question.year].filter(Boolean);
    return parts.length ? `PYQ · ${parts.join(" ")}` : "PYQ";
  }
  if (question.source === "notes") return "Study notes";
  if (question.source === "ai") return "AI-generated";
  return "Practice";
}