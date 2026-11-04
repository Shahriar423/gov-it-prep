import SubjectChapterSelect from "../common/SubjectChapterSelect";
import { inputClass, labelClass } from "../../utils/ui";

const PAPER_TYPES = [
  { value: "mcq", label: "MCQ PDF", hint: "Multiple-choice questions only" },
  { value: "written", label: "Written PDF", hint: "Written / descriptive questions only" },
];

// The shared form fields for uploading and editing a source material.
// value: { title, kind, subjectId, chapterId, examTags, year, paperType }
export default function MaterialMetaFields({
  value,
  onChange,
  subjects,
  options,
  disabled = false,
  idPrefix = "mat",
  showPaperType = false,
}) {
  const set = (patch) => onChange({ ...value, ...patch });

  function toggleTag(tag) {
    const next = value.examTags.includes(tag)
      ? value.examTags.filter((t) => t !== tag)
      : [...value.examTags, tag];
    set({ examTags: next });
  }

  return (
    <fieldset disabled={disabled} className="m-0 min-w-0 space-y-5 border-0 p-0">
      <div>
        <label htmlFor={`${idPrefix}-title`} className={labelClass}>
          Title
        </label>
        <input
          id={`${idPrefix}-title`}
          value={value.title}
          onChange={(e) => set({ title: e.target.value })}
          maxLength={150}
          required
          placeholder="e.g. Computer Networking: Chapter 3 notes"
          className={`${inputClass} mt-1`}
        />
      </div>

      <div>
        <label htmlFor={`${idPrefix}-kind`} className={labelClass}>
          Material type
        </label>
        <select
          id={`${idPrefix}-kind`}
          value={value.kind}
          onChange={(e) => set({ kind: e.target.value })}
          className={`${inputClass} mt-1`}
        >
          {options.kinds.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </select>
      </div>

      {showPaperType && value.kind === "previous_year" && (
        <fieldset className="m-0 min-w-0 border-0 p-0">
          <legend className={labelClass}>Question paper type</legend>
          <p className="mt-1 text-xs text-slate-500">
            This decides how the PDF is read and where its questions go. Choose the type that matches the whole PDF.
            It cannot be changed after upload.
          </p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {PAPER_TYPES.map((type) => (
              <label
                key={type.value}
                className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 text-sm ${
                  value.paperType === type.value ? "border-blue-500 bg-blue-50" : "border-slate-300 bg-white"
                }`}
              >
                <input
                  type="radio"
                  name={`${idPrefix}-paper-type`}
                  value={type.value}
                  checked={value.paperType === type.value}
                  onChange={() => set({ paperType: type.value })}
                  className="mt-0.5 h-4 w-4 border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <span>
                  <span className="block font-medium text-slate-900">{type.label}</span>
                  <span className="block text-xs text-slate-500">{type.hint}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <SubjectChapterSelect
          subjects={subjects}
          subjectId={value.subjectId}
          chapterId={value.chapterId}
          idPrefix={idPrefix}
          onChange={(subjectId, chapterId) => set({ subjectId, chapterId })}
        />
      </div>

      <fieldset className="m-0 min-w-0 border-0 p-0">
        <legend className={labelClass}>Recruitment exams</legend>
        <p className="mt-1 text-xs text-slate-500">
          Tick the exams this material is useful for. Leave all unticked if it applies to every exam.
        </p>
        <div className="mt-2 space-y-2">
          {options.target_exams.map((exam) => (
            <label key={exam} className="flex cursor-pointer items-center gap-3 text-sm text-slate-800">
              <input
                type="checkbox"
                checked={value.examTags.includes(exam)}
                onChange={() => toggleTag(exam)}
                className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              {exam}
            </label>
          ))}
        </div>
      </fieldset>

      {value.kind === "previous_year" && (
        <div>
          <label htmlFor={`${idPrefix}-year`} className={labelClass}>
            Exam year <span className="font-normal text-slate-500">(optional)</span>
          </label>
          <input
            id={`${idPrefix}-year`}
            type="number"
            min={1980}
            max={2100}
            value={value.year}
            onChange={(e) => set({ year: e.target.value })}
            className={`${inputClass} mt-1`}
          />
        </div>
      )}
    </fieldset>
  );
}