import { CheckCircle2, XCircle } from "lucide-react";
import { useState } from "react";

import { fetchExamStructure, seedExamStructure } from "../../api/adminStructure.api";
import ErrorState from "../../components/common/ErrorState";
import PageHeader from "../../components/common/PageHeader";
import Skeleton from "../../components/common/Skeleton";
import { useAsyncData } from "../../hooks/useAsyncData";
import { getErrorMessage } from "../../utils/errors";
import { btnPrimary, cardClass } from "../../utils/ui";

function StatusIcon({ ok }) {
  return ok ? (
    <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-500" aria-label="Present" />
  ) : (
    <XCircle className="h-5 w-5 shrink-0 text-red-400" aria-label="Missing" />
  );
}

export default function AdminExamStructurePage() {
  const { data, loading, error, reload } = useAsyncData(fetchExamStructure, "exam-structure");
  const [seeding, setSeeding] = useState(false);
  const [seedError, setSeedError] = useState("");
  const [seedResult, setSeedResult] = useState(null);

  async function handleSeed() {
    setSeeding(true);
    setSeedError("");
    setSeedResult(null);
    try {
      setSeedResult(await seedExamStructure());
      reload();
    } catch (err) {
      setSeedError(getErrorMessage(err));
    } finally {
      setSeeding(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Exam structure"
        description="The two exam categories students choose from when they create an exam."
      />

      {loading && (
        <div className="space-y-4" aria-busy="true">
          <Skeleton className="h-24" />
          <Skeleton className="h-64" />
        </div>
      )}

      {!loading && error && <ErrorState message={error} onRetry={reload} />}

      {!loading && !error && data && (
        <div className="space-y-6">
          <section
            className={`rounded-xl border p-4 ${
              data.complete ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"
            }`}
          >
            <p className={`font-semibold ${data.complete ? "text-emerald-900" : "text-amber-900"}`}>
              {data.complete ? "The standard structure is complete." : "Some parts of the standard structure are missing."}
            </p>
            <p className={`mt-1 text-sm ${data.complete ? "text-emerald-800" : "text-amber-900"}`}>
              {data.complete
                ? "You can still add your own chapters under any Technical subject."
                : "Create the missing subjects and chapters in one click. Nothing is renamed or deleted, and existing content is kept."}
            </p>
            {!data.complete && (
              <button type="button" onClick={handleSeed} disabled={seeding} className={`${btnPrimary} mt-3`}>
                {seeding ? "Creating…" : "Create missing structure"}
              </button>
            )}
            {seedError && (
              <p role="alert" className="mt-3 text-sm text-red-700">
                {seedError}
              </p>
            )}
            {seedResult && (
              <p role="status" className="mt-3 text-sm text-emerald-800">
                Created {seedResult.created_subjects.length}{" "}
                {seedResult.created_subjects.length === 1 ? "subject" : "subjects"}
                {seedResult.created_subjects.length > 0 ? ` (${seedResult.created_subjects.join(", ")})` : ""} and{" "}
                {seedResult.created_chapters} {seedResult.created_chapters === 1 ? "chapter" : "chapters"}.
              </p>
            )}
          </section>

          <section className={`${cardClass} p-5`}>
            <h3 className="font-semibold text-slate-900">Non-Technical</h3>
            <p className="mt-1 text-sm text-slate-600">
              Exactly three subjects, recognised by name. When a student picks all of them, the questions are split
              equally between the three.
            </p>
            <ul className="mt-3 space-y-2">
              {data.non_technical.map((s) => (
                <li key={s.name} className="flex items-center gap-2 text-sm text-slate-800">
                  <StatusIcon ok={s.exists} />
                  {s.name}
                  {!s.exists && <span className="text-xs text-red-600">(missing)</span>}
                </li>
              ))}
            </ul>
          </section>

          <section className={`${cardClass} p-5`}>
            <h3 className="font-semibold text-slate-900">IT</h3>
            <p className="mt-1 text-sm text-slate-600">
              Every subject other than the three above is Technical. Students choose one of its chapters, or all of
              them. Any chapter you add under a Technical subject appears in the exam builder automatically.
            </p>

            {data.technical_subjects.length > 0 && (
              <div className="mt-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Technical subjects</p>
                <ul className="mt-2 flex flex-wrap gap-2">
                  {data.technical_subjects.map((s) => (
                    <li key={s.id} className="rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700">
                      {s.name} · {s.chapters_total} {s.chapters_total === 1 ? "chapter" : "chapters"}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Standard chapters</p>
              <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                {data.technical_chapters.map((c) => (
                  <li key={c.title} className="flex items-center gap-2 text-sm text-slate-800">
                    <StatusIcon ok={c.exists} />
                    {c.title}
                  </li>
                ))}
              </ul>
              {data.extra_technical_chapters > 0 && (
                <p className="mt-3 text-sm text-slate-500">
                  Plus {data.extra_technical_chapters} other {data.extra_technical_chapters === 1 ? "chapter" : "chapters"}{" "}
                  you added.
                </p>
              )}
            </div>
          </section>

          <section className={`${cardClass} p-5 text-sm text-slate-600`}>
            <h3 className="font-semibold text-slate-900">How questions find their place</h3>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>
                Assign every question to a subject, and for Technical questions to a chapter, in the Question bank or
                Written questions.
              </li>
              <li>Technical questions without a chapter are only used when a student chooses all Technical chapters.</li>
              <li>
                Chapters created here start unpublished, so students do not see empty chapters in Subjects. The exam
                builder lists them either way.
              </li>
              <li>Renaming Bangla, English or General Knowledge moves that subject to Technical. Keep these names.</li>
            </ul>
          </section>
        </div>
      )}
    </div>
  );
}