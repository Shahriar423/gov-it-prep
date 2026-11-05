import { Children, cloneElement, isValidElement } from "react";
import { BookOpen, CheckCircle2, FileText, Flag, Lightbulb, ListChecks, PenLine, XCircle } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";

import { convertComparisonTables } from "../../utils/comparisonTables";
import { normalizeLessonContent } from "../../utils/lessonContent";

/**
 * Map common callout lead-ins to visual styles.
 * Blockquotes that start with **Definition:** etc. become distinct panels.
 */
function CalloutBlock({ children, ...props }) {
  const flat = flattenText(children).trim();
  const match = /^(definition|example|examples|note|notes|exam\s*tip|tip|key\s*point|key\s*points|important|advantage|advantages|disadvantage|disadvantages|solved\s*problem|solution|summary|remember|caution|warning)\s*:/i.exec(
    flat
  );

  if (!match) {
    return (
      <blockquote
        className="border-l-4 border-[#E2E8F0] bg-[#F8FAFC] px-4 py-3 text-[#1F2937] not-italic"
        {...props}
      >
        {children}
      </blockquote>
    );
  }

  const kind = match[1].toLowerCase().replace(/\s+/g, " ");
  const style = calloutStyle(kind);

  return (
    <aside
      className={`my-4 rounded-xl border px-4 py-3 ${style.box}`}
      role="note"
      aria-label={match[1]}
    >
      <div className={`text-sm leading-relaxed ${style.text}`}>{children}</div>
    </aside>
  );
}

function calloutStyle(kind) {
  if (kind.startsWith("definition") || kind === "summary") {
    return { box: "border-[#BFDBFE] bg-[#EFF6FF]", text: "text-[#1F2937]" };
  }
  if (kind.startsWith("example") || kind.startsWith("solved") || kind === "solution") {
    return { box: "border-[#A7F3D0] bg-[#ECFDF5]", text: "text-[#1F2937]" };
  }
  if (kind.includes("tip") || kind.startsWith("key") || kind === "important" || kind === "remember") {
    return { box: "border-[#FDE68A] bg-[#FFFBEB]", text: "text-[#1F2937]" };
  }
  if (kind.startsWith("advantage")) {
    return { box: "border-[#99F6E4] bg-[#F0FDFA]", text: "text-[#1F2937]" };
  }
  if (kind.startsWith("disadvantage") || kind === "caution" || kind === "warning") {
    return { box: "border-[#FECDD3] bg-[#FFF1F2]", text: "text-[#1F2937]" };
  }
  return { box: "border-[#E2E8F0] bg-[#F8FAFC]", text: "text-[#1F2937]" };
}

function flattenText(node) {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(flattenText).join("");
  if (node.props && node.props.children != null) return flattenText(node.props.children);
  return "";
}

function headingId(children) {
  const text = flattenText(children)
    .toLowerCase()
    .replace(/[^\w\u0980-\u09FF\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 80);
  return text || undefined;
}

/* ------------------------------------------------------------------
   Lesson variant: bigger callouts and reading-friendly typography
   (used on chapter pages only)
   ------------------------------------------------------------------ */

const CALLOUT_LABELS =
  "definition|example|examples|note|notes|exam\\s*tip|tip|key\\s*point|key\\s*points|important|advantage|advantages|disadvantage|disadvantages|solved\\s*problem|solution|summary|remember|caution|warning";
const CALLOUT_START = new RegExp(`^(${CALLOUT_LABELS})\\s*:`, "i");
const CALLOUT_STRIP = new RegExp(`^\\s*(${CALLOUT_LABELS})\\s*:\\s*`, "i");

const CALLOUT_STYLES = {
  definition: {
    icon: BookOpen,
    box: "border-sky-200 bg-sky-50 dark:border-sky-400/30 dark:bg-sky-400/10",
    bar: "bg-sky-500",
    title: "text-sky-800 dark:text-sky-300",
  },
  summary: {
    icon: ListChecks,
    box: "border-sky-200 bg-sky-50 dark:border-sky-400/30 dark:bg-sky-400/10",
    bar: "bg-sky-500",
    title: "text-sky-800 dark:text-sky-300",
  },
  example: {
    icon: PenLine,
    box: "border-emerald-200 bg-emerald-50 dark:border-emerald-400/30 dark:bg-emerald-400/10",
    bar: "bg-emerald-500",
    title: "text-emerald-800 dark:text-emerald-300",
  },
  tip: {
    icon: Lightbulb,
    box: "border-amber-200 bg-amber-50 dark:border-amber-400/30 dark:bg-amber-400/10",
    bar: "bg-amber-500",
    title: "text-amber-800 dark:text-amber-300",
  },
  key: {
    icon: Flag,
    box: "border-amber-200 bg-amber-50 dark:border-amber-400/30 dark:bg-amber-400/10",
    bar: "bg-amber-500",
    title: "text-amber-800 dark:text-amber-300",
  },
  advantage: {
    icon: CheckCircle2,
    box: "border-teal-200 bg-teal-50 dark:border-teal-400/30 dark:bg-teal-400/10",
    bar: "bg-teal-500",
    title: "text-teal-800 dark:text-teal-300",
  },
  warning: {
    icon: XCircle,
    box: "border-rose-200 bg-rose-50 dark:border-rose-400/30 dark:bg-rose-400/10",
    bar: "bg-rose-500",
    title: "text-rose-800 dark:text-rose-300",
  },
  note: {
    icon: FileText,
    box: "border-violet-200 bg-violet-50 dark:border-violet-400/30 dark:bg-violet-400/10",
    bar: "bg-violet-500",
    title: "text-violet-800 dark:text-violet-300",
  },
};

function lessonCalloutStyle(kind) {
  if (kind.startsWith("definition")) return CALLOUT_STYLES.definition;
  if (kind === "summary") return CALLOUT_STYLES.summary;
  if (kind.startsWith("example") || kind.startsWith("solved") || kind === "solution") return CALLOUT_STYLES.example;
  if (kind.includes("tip")) return CALLOUT_STYLES.tip;
  if (kind.startsWith("key") || kind === "important" || kind === "remember") return CALLOUT_STYLES.key;
  if (kind.startsWith("advantage")) return CALLOUT_STYLES.advantage;
  if (kind.startsWith("disadvantage") || kind === "caution" || kind === "warning") return CALLOUT_STYLES.warning;
  return CALLOUT_STYLES.note;
}

// Removes the first `count` characters of text from a React node tree.
// Returns [newNode, charactersStillToRemove].
function consume(node, count) {
  if (count <= 0 || node == null || typeof node === "boolean") return [node, count];

  if (typeof node === "string" || typeof node === "number") {
    const text = String(node);
    return text.length <= count ? [null, count - text.length] : [text.slice(count), 0];
  }

  if (Array.isArray(node)) {
    const out = [];
    let left = count;
    for (const item of node) {
      if (left > 0) {
        const [next, remaining] = consume(item, left);
        left = remaining;
        if (next !== null && next !== "") out.push(next);
      } else {
        out.push(item);
      }
    }
    return [out, left];
  }

  if (isValidElement(node)) {
    const inner = node.props.children;
    const size = flattenText(inner).length;
    if (size <= count) return [null, count - size];
    const [next] = consume(inner, count);
    const parts = Array.isArray(next) ? next : [next];
    return [cloneElement(node, undefined, ...parts), 0];
  }

  return [node, count];
}

// "**Definition:** A computer is..." -> "A computer is..." (the label is shown in the box header instead)
function stripLeadingLabel(children) {
  const items = Children.toArray(children);
  const index = items.findIndex((item) => isValidElement(item));
  if (index === -1) return children;

  const first = items[index];
  const match = CALLOUT_STRIP.exec(flattenText(first.props.children));
  if (!match) return children;

  const [rest] = consume(first.props.children, match[0].length);
  const parts = Array.isArray(rest) ? rest : [rest];
  if (flattenText(parts).trim() === "") {
    items.splice(index, 1);
  } else {
    items[index] = cloneElement(first, undefined, ...parts);
  }
  return items;
}

function capitalize(text) {
  const lower = text.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

function LessonCallout({ children, ...props }) {
  const flat = flattenText(children).trim();
  const match = CALLOUT_START.exec(flat);

  // A normal quotation
  if (!match) {
    return (
      <blockquote
        className="my-[1.2em] rounded-r-xl border-l-4 border-purple-300 bg-slate-50 px-5 py-3 not-italic"
        {...props}
      >
        {children}
      </blockquote>
    );
  }

  const label = capitalize(match[1].replace(/\s+/g, " "));
  const style = lessonCalloutStyle(match[1].toLowerCase().replace(/\s+/g, " "));
  const Icon = style.icon;

  return (
    <aside
      role="note"
      aria-label={label}
      className={`relative my-[1.5em] overflow-hidden rounded-2xl border py-4 pl-6 pr-5 sm:py-5 sm:pl-7 sm:pr-6 ${style.box}`}
    >
      <span className={`absolute inset-y-0 left-0 w-1.5 ${style.bar}`} aria-hidden="true" />
      <div className={`mb-2 flex items-center gap-2 text-[0.78em] font-bold uppercase tracking-[0.08em] ${style.title}`}>
        <Icon className="h-[1.3em] w-[1.3em]" aria-hidden="true" />
        {label}
      </div>
      <div className="[&>ol]:my-[0.6em] [&>p:first-child]:mt-0 [&>p:last-child]:mb-0 [&>p]:my-[0.6em] [&>ul]:my-[0.6em]">
        {stripLeadingLabel(children)}
      </div>
    </aside>
  );
}

const components = {
  a: ({ node, ...props }) => (
    <a {...props} className="font-medium text-[#1D4ED8] underline-offset-2 hover:text-[#1E40AF] hover:underline" target="_blank" rel="noopener noreferrer" />
  ),
  table: ({ node, ...props }) => (
    <div className="my-4 overflow-x-auto rounded-lg border border-[#E2E8F0]">
      <table className="min-w-full border-collapse text-sm" {...props} />
    </div>
  ),
  thead: ({ node, ...props }) => <thead className="bg-[#F8FAFC] text-left" {...props} />,
  th: ({ node, ...props }) => <th className="border-b border-[#E2E8F0] px-3 py-2 font-semibold text-[#111827]" {...props} />,
  td: ({ node, ...props }) => <td className="border-b border-[#E2E8F0] px-3 py-2 text-[#1F2937]" {...props} />,
  blockquote: ({ node, ...props }) => <CalloutBlock {...props} />,
  h1: ({ node, children, ...props }) => (
    <h1 id={headingId(children)} className="mb-3 mt-8 scroll-mt-24 text-2xl font-bold tracking-tight text-[#111827] first:mt-0" {...props}>
      {children}
    </h1>
  ),
  h2: ({ node, children, ...props }) => (
    <h2 id={headingId(children)} className="mb-3 mt-8 scroll-mt-24 border-b border-[#E2E8F0] pb-2 text-xl font-bold tracking-tight text-[#111827] first:mt-0" {...props}>
      {children}
    </h2>
  ),
  h3: ({ node, children, ...props }) => (
    <h3 id={headingId(children)} className="mb-2 mt-6 scroll-mt-24 text-lg font-semibold text-[#1F2937]" {...props}>
      {children}
    </h3>
  ),
  h4: ({ node, children, ...props }) => (
    <h4 id={headingId(children)} className="mb-2 mt-5 text-base font-semibold text-[#1F2937]" {...props}>
      {children}
    </h4>
  ),
  p: ({ node, ...props }) => <p className="my-3.5 leading-[1.7] text-[#1F2937]" {...props} />,
  ul: ({ node, ...props }) => <ul className="my-3.5 list-disc space-y-1.5 pl-6 text-[#1F2937] marker:text-[#94A3B8]" {...props} />,
  ol: ({ node, ...props }) => <ol className="my-3.5 list-decimal space-y-2 pl-6 text-[#1F2937] marker:font-semibold marker:text-[#64748B]" {...props} />,
  li: ({ node, ...props }) => <li className="leading-[1.7] pl-1" {...props} />,
  strong: ({ node, ...props }) => <strong className="font-semibold text-[#111827]" {...props} />,
  em: ({ node, ...props }) => <em className="italic text-[#1F2937]" {...props} />,
  hr: ({ node, ...props }) => <hr className="my-8 border-[#E2E8F0]" {...props} />,
  code: ({ node, className, children, ...props }) => {
    const isBlock = typeof className === "string" && className.includes("language-");
    if (isBlock) {
      return (
        <code className={`${className || ""} text-sm`} {...props}>
          {children}
        </code>
      );
    }
    return (
      <code className="rounded bg-[#F1F5F9] px-1.5 py-0.5 text-[0.9em] font-mono text-[#1F2937]" {...props}>
        {children}
      </code>
    );
  },
  pre: ({ node, ...props }) => (
    <pre className="my-4 overflow-x-auto rounded-xl border border-[#E2E8F0] bg-[#0F172A] p-4 text-sm leading-relaxed text-[#E2E8F0]" {...props} />
  ),
};

// Chapter pages: sizes are in "em", so everything grows with the student's text-size setting.
// Colours and line height come from the --lesson-* variables (see index.css).
const lessonComponents = {
  ...components,
  a: ({ node, ...props }) => (
    <a {...props} className="font-medium underline decoration-1 underline-offset-4 hover:decoration-2" target="_blank" rel="noopener noreferrer" />
  ),
  table: ({ node, ...props }) => (
    <div className="my-[1.4em] overflow-x-auto rounded-xl border border-slate-200">
      <table className="min-w-full border-collapse text-[0.92em] sm:text-[0.95em]" {...props} />
    </div>
  ),
  thead: ({ node, ...props }) => <thead className="text-left" {...props} />,
  tr: ({ node, ...props }) => <tr className="even:bg-slate-50" {...props} />,
  th: ({ node, ...props }) => (
    <th className="bg-purple-50 px-2.5 py-2.5 text-left font-semibold text-purple-700 sm:px-4" {...props} />
  ),
  td: ({ node, ...props }) => <td className="border-t border-slate-200 px-2.5 py-2.5 align-top sm:px-4" {...props} />,
  blockquote: ({ node, ...props }) => <LessonCallout {...props} />,
  h1: ({ node, children, ...props }) => (
    <h1 id={headingId(children)} className="mb-[0.6em] mt-[1.6em] scroll-mt-36 text-[1.75em] font-bold tracking-tight first:mt-0" {...props}>
      {children}
    </h1>
  ),
  h2: ({ node, children, ...props }) => (
    <h2 id={headingId(children)} className="mb-[0.7em] mt-[2em] scroll-mt-36 border-l-4 border-purple-500 pl-3 text-[1.4em] font-bold tracking-tight first:mt-0" {...props}>
      {children}
    </h2>
  ),
  h3: ({ node, children, ...props }) => (
    <h3 id={headingId(children)} className="mb-[0.5em] mt-[1.6em] scroll-mt-36 text-[1.2em] font-semibold first:mt-0" {...props}>
      {children}
    </h3>
  ),
  h4: ({ node, children, ...props }) => (
    <h4 id={headingId(children)} className="mb-[0.4em] mt-[1.4em] scroll-mt-36 text-[1.05em] font-semibold" {...props}>
      {children}
    </h4>
  ),
  p: ({ node, ...props }) => <p className="my-[1em]" {...props} />,
  ul: ({ node, ...props }) => <ul className="my-[1em] list-disc space-y-[0.4em] pl-[1.6em] marker:text-purple-500" {...props} />,
  ol: ({ node, ...props }) => (
    <ol className="my-[1em] list-decimal space-y-[0.5em] pl-[1.7em] marker:font-bold marker:text-purple-600 dark:marker:text-purple-300" {...props} />
  ),
  li: ({ node, ...props }) => <li className="pl-1" {...props} />,
  strong: ({ node, ...props }) => <strong className="font-semibold" {...props} />,
  em: ({ node, ...props }) => <em className="italic" {...props} />,
  hr: ({ node, ...props }) => <hr className="my-[2.2em] border-slate-200" {...props} />,
  code: ({ node, className, children, ...props }) => {
    const isBlock = typeof className === "string" && className.includes("language-");
    if (isBlock) {
      return (
        <code className={`${className || ""} text-[0.9em]`} {...props}>
          {children}
        </code>
      );
    }
    return (
      <code className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[0.88em]" {...props}>
        {children}
      </code>
    );
  },
};

/**
 * Renders chapter / lesson content.
 * Plain pasted notes are normalized into Markdown first; existing Markdown is kept.
 * variant="lesson" gives the roomy reading layout used on chapter pages, and turns
 * flattened "A vs B" comparisons into tables.
 */
export default function MarkdownContent({ children, normalize = true, variant = "default" }) {
  const source = typeof children === "string" ? children : "";
  const normalized = normalize ? normalizeLessonContent(source) : source;
  const markdown = variant === "lesson" ? convertComparisonTables(normalized) : normalized;

  return (
    <div className="lesson-content max-w-none">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={variant === "lesson" ? lessonComponents : components}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
    }
