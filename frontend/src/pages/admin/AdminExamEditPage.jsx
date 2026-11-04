import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { adminCreateExam, adminFetchExam, adminUpdateExam } from "../../api/adminExams.api";
import ExamQuestionPicker from "../../components/admin/ExamQuestionPicker";
import Breadcrumbs from "../../components/common/Breadcrumbs";
import ErrorState from "../../components/common/ErrorState";
import PageHeader from "../../components/common/PageHeader";
import Skeleton from "../../components/common/Skeleton";
import { useAsyncData } from "../../hooks/useAsyncData";
import { getErrorMessage } from "../../utils/errors";
import { btnPrimary, btnSecondary, cardClass, inputClass, labelClass } from "../../utils/ui";

function ExamForm({ exam }) {
  const navigate = useNavigate();
  const isEdit = Boolean(exam);

  const [title, setTitle] = useState(exam?.title ?? "");
  const [description, setDescription] = useState(exam?.description ?? "");
  const [duration, setDuration] = useState(exam ? String(exam.duration_minutes) : "60");
  const [negative, setNegative] = useState(exam ? String(exam.negative_marking) : "0.25");
  const [status, setStatus] = useState(exam?.status ?? "draft");
  const [selected, setSelected] = useState(exam?.questions ?? []);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    const minutes = Number(duration);
    if (title.trim().length < 3) return setError("The title must be at least 3 characters long.");
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 240) {
      return setError("Duration must be a whole number of minutes between 1 and 240.");
    }
    if (status === "published") {
      if (selected.length === 0) return setError("Add at least one question before publishing.");
      if (selected.some((q) => q.status !== "approved")) {
        return setError("All questions must be approved before publishing. Approve or remove the flagged ones.");
      }
    }

    const payload = {
      title: title.trim(),
      description: description.trim(),
      duration_minutes: minutes,
      negative_marking: Number(negative),
      status,
      question_ids: selected.map((q) => q.id),
    };

    setSaving(true);
    try {
      if (isEdit) await adminUpdateExam(exam.id, payload);
      else await adminCreateExam(payload);
      navigate("/admin/exams");
    } catch (err) {
      setError(getErrorMessage(err));
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl">
      <Breadcrumbs
        items={[
          { label: "Mock exam papers", to: "/admin/exams" },
          { label: isEdit ? "Edit paper" : "New paper" },
        ]}
      />
      <PageHeader title={isEdit ? "Edit mock paper" : "New mock paper"} />

      <form onSubmit={handleSubmit} className="space-y-6">
        <section className={`${cardClass} space-y-5 p-5 sm:p-6`}>
          <div>
            <label htmlFor="exam-title" className={labelClass}>
              Title
            </label>
            <input
              id="exam-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={150}
              required
              autoFocus={!isEdit}
              placeholder="e.g. Assistant Programmer – Mock Test 1"
              className={`${inputClass} mt-1`}
            />
          </div>

          <div>
            <label htmlFor="exam-description" className={labelClass}>
              Description <span className="font-normal text-slate-500">(optional)</span>
            </label>
            <textarea
              id="exam-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={500}
              rows={2}
              className={`${inputClass} mt-1`}
            />
          </div>

          <div className="grid gap-5 sm:grid-cols-3">
            <div>
              <label htmlFor="exam-duration" className={labelClass}>
                Duration (minutes)
              </label>
              <input
                id="exam-duration"
                type="number"
                min={1}
                max={240}
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                required
                className={`${inputClass} mt-1`}
              />
              <p className="mt-1 text-xs text-slate-500">Use 1 to test the time-up screen.</p>
            </div>

            <div>
              <label htmlFor="exam-negative" className={labelClass}>
                Negative marking
              </label>
              <select
                id="exam-negative"
                value={negative}
                onChange={(e) => setNegative(e.target.value)}
                className={`${inputClass} mt-1`}
              >
                <option value="0">None</option>
                <option value="0.25">−0.25 per wrong answer</option>
                <option value="0.5">−0.50 per wrong answer</option>
              </select>
            </div>

            <div>
              <label htmlFor="exam-status" className={labelClass}>
                Status
              </label>
              <select
                id="exam-status"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className={`${inputClass} mt-1`}
              >
                <option value="draft">Draft (hidden)</option>
                <option value="published">Published</option>
              </select>
              <p className="mt-1 text-xs text-slate-500">Publishing needs all questions approved.</p>
            </div>
          </div>
        </section>

        <ExamQuestionPicker selected={selected} onChange={setSelected} />

        {error && (
          <p role="alert" className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        )}

        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={() => navigate("/admin/exams")}
            disabled={saving}
            className={btnSecondary}
          >
            Cancel
          </button>
          <button type="submit" disabled={saving} className={btnPrimary}>
            {saving ? "Saving…" : isEdit ? "Save changes" : "Create paper"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function AdminExamEditPage() {
  const { examId } = useParams();

  const { data, loading, error, reload } = useAsyncData(
    () => (examId ? adminFetchExam(examId) : Promise.resolve(null)),
    examId || "new"
  );

  if (loading) {
    return (
      <div aria-busy="true" className="mx-auto max-w-4xl space-y-4">
        <Skeleton className="h-6 w-56" />
        <Skeleton className="h-72" />
        <Skeleton className="h-72" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-4xl">
        <Breadcrumbs items={[{ label: "Mock exam papers", to: "/admin/exams" }, { label: "Not available" }]} />
        <ErrorState message={error} onRetry={reload} />
      </div>
    );
  }

  return <ExamForm key={examId || "new"} exam={data} />;
}