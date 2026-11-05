import { Link } from "react-router-dom";

const TONES = {
  blue: "from-purple-500 to-pink-500 shadow-purple-500/30",
  green: "from-emerald-400 to-teal-500 shadow-emerald-500/30",
  amber: "from-amber-400 to-orange-500 shadow-orange-500/30",
  violet: "from-sky-500 to-indigo-500 shadow-indigo-500/30",
};

export default function StatCard({
  icon: Icon,
  label,
  value,
  caption,
  tone = "blue",
  children,
  to,
}) {
  const className =
    "rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-purple-200 hover:shadow-lg hover:shadow-purple-500/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-600";

  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <p className="mt-1 text-3xl font-bold tracking-tight text-slate-900">{value}</p>
        </div>
        <span
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-linear-to-br text-white shadow-lg ${TONES[tone] || TONES.blue}`}
        >
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
      </div>
      {children && <div className="mt-4">{children}</div>}
      {caption && <p className="mt-3 text-xs text-slate-500">{caption}</p>}
    </>
  );

  if (to) {
    return (
      <Link to={to} className={`block ${className}`}>
        {content}
      </Link>
    );
  }

  return <div className={className}>{content}</div>;
}