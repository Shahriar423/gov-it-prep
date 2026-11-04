import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";

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

/**
 * Renders chapter / lesson content.
 * Plain pasted notes are normalized into Markdown first; existing Markdown is kept.
 */
export default function MarkdownContent({ children, normalize = true }) {
  const source = typeof children === "string" ? children : "";
  const markdown = normalize ? normalizeLessonContent(source) : source;

  return (
    <div className="lesson-content max-w-none">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={components}
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}