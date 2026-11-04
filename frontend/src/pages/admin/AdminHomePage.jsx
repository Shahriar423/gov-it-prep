import { FileSearch, FileText, HelpCircle, Layers, Library, PenLine } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { adminPing } from "../../api/admin.api";
import PageHeader from "../../components/common/PageHeader";
import { getErrorMessage } from "../../utils/errors";
import { cardClass } from "../../utils/ui";

const ACTIVE_CARDS = [
  {
    to: "/admin/subjects",
    icon: Library,
    title: "Subjects & chapters",
    text: "Create subjects, write chapters, and publish study content.",
  },
  {
    to: "/admin/exam-structure",
    icon: Layers,
    title: "Exam structure",
    text: "Set up the Technical and Non-Technical categories that students choose when creating an exam.",
  },
  {
    to: "/admin/materials",
    icon: FileText,
    title: "Source materials",
    text: "Upload PDF study notes and previous-year papers. Questions come only from previous-year PDFs after admin review.",
  },
  {
    to: "/admin/previous-year",
    icon: FileSearch,
    title: "Previous-year papers",
    text: "Upload previous-year PDFs at any time. Their questions are extracted automatically and wait for your review.",
  },
  {
    to: "/admin/questions",
    icon: HelpCircle,
    title: "Question bank",
    text: "Add, review, and approve MCQs used in practice and exams.",
  },
  {
    to: "/admin/written-questions",
    icon: PenLine,
    title: "Written questions",
    text: "Add and approve the 10-mark questions used in written exams.",
  },
];

export default function AdminHomePage() {
  const [result, setResult] = useState({ status: "loading", message: "" });

  useEffect(() => {
    let cancelled = false;
    adminPing()
      .then((data) => {
        if (!cancelled) setResult({ status: "ok", message: data.message });
      })
      .catch((err) => {
        if (!cancelled) setResult({ status: "error", message: getErrorMessage(err) });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div>
      <PageHeader title="Admin overview" description="Manage the learning content of the portal." />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {ACTIVE_CARDS.map(({ to, icon: Icon, title, text }) => (
          <Link
            key={to}
            to={to}
            className="group rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-blue-300 hover:shadow-md"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <Icon className="h-5 w-5" aria-hidden="true" />
            </span>
            <h3 className="mt-4 font-semibold text-slate-900 group-hover:text-blue-700">{title}</h3>
            <p className="mt-1 text-sm text-slate-600">{text}</p>
          </Link>
        ))}
      </div>

      <section className={`${cardClass} mt-6 p-5`}>
        <h3 className="font-semibold text-slate-900">Server-side admin check</h3>
        <p
          className={
            result.status === "ok"
              ? "mt-2 text-sm text-emerald-700"
              : result.status === "error"
              ? "mt-2 text-sm text-red-700"
              : "mt-2 text-sm text-slate-500"
          }
        >
          {result.status === "loading" ? "Checking…" : result.message}
        </p>
      </section>
    </div>
  );
}