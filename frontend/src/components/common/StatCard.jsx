import { Link } from "react-router-dom";

const TONES = {
  blue: "bg-blue-50 text-blue-600",
  green: "bg-emerald-50 text-emerald-600",
  amber: "bg-amber-50 text-amber-600",
  violet: "bg-violet-50 text-violet-600",
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
    "rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-blue-300 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600";

  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <p className="mt-1 text-3xl font-bold tracking-tight text-slate-900">{value}</p>
        </div>
        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${TONES[tone] || TONES.blue}`}
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