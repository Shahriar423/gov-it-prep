import { useMemo, useState } from "react";

/**
 * Lightweight animated process / concept flow for exam notes.
 * Built with pure React + SVG — no extra dependencies.
 */

const COLORS = [
  { bg: "bg-blue-600", ring: "ring-blue-200", soft: "bg-blue-50", text: "text-blue-900", border: "border-blue-200" },
  { bg: "bg-violet-600", ring: "ring-violet-200", soft: "bg-violet-50", text: "text-violet-900", border: "border-violet-200" },
  { bg: "bg-emerald-600", ring: "ring-emerald-200", soft: "bg-emerald-50", text: "text-emerald-900", border: "border-emerald-200" },
  { bg: "bg-amber-500", ring: "ring-amber-200", soft: "bg-amber-50", text: "text-amber-900", border: "border-amber-200" },
  { bg: "bg-rose-500", ring: "ring-rose-200", soft: "bg-rose-50", text: "text-rose-900", border: "border-rose-200" },
  { bg: "bg-teal-600", ring: "ring-teal-200", soft: "bg-teal-50", text: "text-teal-900", border: "border-teal-200" },
];

/**
 * Pull short sequential process steps from plain / normalized lesson text.
 * Returns [{ title, detail }] or [].
 */
export function extractProcessSteps(raw) {
  if (!raw || typeof raw !== "string") return [];

  const text = raw.replace(/\r\n/g, "\n");
  const lines = text.split("\n").map((l) => l.trim());

  const items = [];
  let i = 0;
  while (i < lines.length) {
    const m = /^(\d{1,3})[.)]\s+(.+)$/.exec(lines[i]);
    if (!m) {
      i += 1;
      continue;
    }
    let title = m[2].trim();
    title = title.replace(/\b(?:Definition|Example|Note|Exam\s*Tip|Tip)\s*[:.\-–—].*$/i, "").trim();
    title = title.replace(/\*+/g, "").trim();

    const detailParts = [];
    let j = i + 1;
    while (j < lines.length) {
      const next = lines[j];
      if (!next) break;
      if (/^\d{1,3}[.)]\s+/.test(next)) break;
      if (/^#{1,6}\s/.test(next) || /^#\S/.test(next)) break;
      const clean = next.replace(/^>\s?/, "").trim();
      if (/^\*\*[^*]+\*\*:/.test(clean)) break;
      if (/^(definition|example|note|exam\s*tip|tip)\s*[:.\-–—]/i.test(clean)) break;
      detailParts.push(clean);
      j += 1;
    }

    const isQuestion = /\?/.test(title) || title.length > 48;
    const wordCount = title.split(/\s+/).filter(Boolean).length;
    items.push({
      title,
      detail: detailParts.join(" ").trim(),
      _short: !isQuestion && wordCount > 0 && wordCount <= 6 && title.length <= 48,
    });
    i = j;
  }

  // Longest run of consecutive short process-like steps
  let best = [];
  let run = [];
  for (const it of items) {
    if (it._short) {
      run.push({ title: it.title, detail: it.detail });
      if (run.length > best.length) best = run.slice();
    } else {
      run = [];
    }
  }

  if (best.length >= 3 && best.length <= 8) return best;
  return [];
}

export default function ConceptFlow({ steps, title = "Process overview" }) {
  const [active, setActive] = useState(0);
  const palette = useMemo(() => steps.map((_, idx) => COLORS[idx % COLORS.length]), [steps]);

  if (!steps || steps.length < 2) return null;

  return (
    <section
      aria-label={title}
      className="my-6 overflow-hidden rounded-2xl border border-slate-200 bg-gradient-to-b from-slate-50 to-white"
    >
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 sm:px-5">
        <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
        <p className="text-xs text-slate-500">Tap a step to focus</p>
      </div>

      {/* Desktop: horizontal flow */}
      <div className="hidden overflow-x-auto px-4 py-6 sm:block sm:px-6">
        <div className="flex min-w-max items-start justify-center gap-0">
          {steps.map((step, idx) => {
            const c = palette[idx];
            const isActive = active === idx;
            return (
              <div key={idx} className="flex items-start">
                <button
                  type="button"
                  onClick={() => setActive(idx)}
                  className={`group flex w-36 flex-col items-center text-center transition sm:w-40 ${
                    isActive ? "opacity-100" : "opacity-80 hover:opacity-100"
                  }`}
                >
                  <span
                    className={`flex h-11 w-11 items-center justify-center rounded-full text-sm font-bold text-white shadow-md ring-4 transition ${c.bg} ${
                      isActive ? c.ring : "ring-transparent"
                    }`}
                  >
                    {idx + 1}
                  </span>
                  <span className={`mt-2 text-sm font-semibold leading-snug ${isActive ? c.text : "text-slate-800"}`}>
                    {step.title}
                  </span>
                </button>
                {idx < steps.length - 1 && (
                  <div className="mt-5 flex w-8 items-center sm:w-10" aria-hidden="true">
                    <div className="h-0.5 w-full bg-slate-300">
                      <div
                        className={`h-0.5 bg-blue-500 transition-all duration-500 ${
                          active > idx ? "w-full" : "w-0"
                        }`}
                      />
                    </div>
                    <svg className="-ml-1 h-3 w-3 shrink-0 text-slate-400" viewBox="0 0 12 12" fill="currentColor">
                      <path d="M4 2l5 4-5 4V2z" />
                    </svg>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Mobile: vertical flow */}
      <div className="px-4 py-4 sm:hidden">
        <ol className="relative ml-4 space-y-0 border-l-2 border-slate-200">
          {steps.map((step, idx) => {
            const c = palette[idx];
            const isActive = active === idx;
            return (
              <li key={idx} className="relative pb-5 pl-6 last:pb-0">
                <button type="button" onClick={() => setActive(idx)} className="w-full text-left">
                  <span
                    className={`absolute -left-[1.15rem] top-0 flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white ring-4 ${c.bg} ${
                      isActive ? c.ring : "ring-white"
                    }`}
                  >
                    {idx + 1}
                  </span>
                  <span className={`block text-sm font-semibold ${isActive ? c.text : "text-slate-800"}`}>
                    {step.title}
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </div>

      {/* Active step detail */}
      <div className={`border-t border-slate-100 px-4 py-4 sm:px-6 ${palette[active].soft}`}>
        <p className={`text-xs font-semibold uppercase tracking-wide ${palette[active].text}`}>
          Step {active + 1} of {steps.length} · {steps[active].title}
        </p>
        {steps[active].detail ? (
          <p className="mt-1 text-sm leading-relaxed text-slate-700">{steps[active].detail}</p>
        ) : (
          <p className="mt-1 text-sm text-slate-500">See the notes below for details on this step.</p>
        )}
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            disabled={active === 0}
            onClick={() => setActive((v) => Math.max(0, v - 1))}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 disabled:opacity-40"
          >
            Previous
          </button>
          <button
            type="button"
            disabled={active >= steps.length - 1}
            onClick={() => setActive((v) => Math.min(steps.length - 1, v + 1))}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 disabled:opacity-40"
          >
            Next step
          </button>
        </div>
      </div>
    </section>
  );
}