export const PIPELINE_LABELS = {
  uploaded: "Uploaded",
  processing: "Processing",
  review_required: "Review required",
  completed: "Completed",
  failed: "Failed",
  paused: "Paused",
};

export const PIPELINE_TONE = {
  uploaded: "slate",
  processing: "blue",
  review_required: "amber",
  completed: "green",
  failed: "red",
  paused: "amber",
};

export const PIPELINE_ORDER = ["review_required", "processing", "uploaded", "paused", "failed", "completed"];

export const PAPER_TYPE_LABELS = { mcq: "MCQ PDF", written: "Written PDF" };
export const PAPER_TYPE_TONE = { mcq: "blue", written: "slate" };

// Warnings found while extracting. They never block approval, but they ask for a closer look.
export const FLAG_LABELS = {
  answer_unverified: "A printed answer was found but could not be verified",
  answer_from_key: "Answer taken from an answer key (check the numbering)",
  key_ambiguous: "The answer key is unclear for this number",
  incomplete: "Incomplete question",
  unusual_option_count: "Unusual number of options",
  duplicate_options: "Two options are identical",
  long_option: "An option is very long",
  option_text_differs: "An option differs from the PDF text",
  explanation_unverified: "A printed explanation could not be verified and was left out",
  check_numbering: "Question numbering looks irregular (check the order)",
  parse_uncertain: "The options could not be read cleanly",
  looks_like_mcq: "Looks like a multiple-choice question",
  possibly_incomplete: "The question may continue beyond what was read",
};

export const ANSWER_STATUS_LABELS = {
  printed: "Printed answer (verified in the PDF)",
  key: "Taken from the answer key",
  manual: "Chosen by an admin",
  missing: "No answer",
};

export const EXTRACTION_REJECTIONS = {
  malformed: "Malformed item",
  bad_question: "Question text too short or too long",
  no_options: "Numbered line without answer options (not an MCQ)",
  too_many_options: "More than 6 options",
  not_in_source: "Question text not found in the PDF",
  starts_in_continuation: "Belongs to the next section (extracted there)",
};

export const PAUSE_HINTS = {
  restart: "It resumes automatically.",
  stopped: "Press Resume to continue.",
  failures: "Press Retry to try the failed parts again.",
  other: "Press Resume to continue.",
};