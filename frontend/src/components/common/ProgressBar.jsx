const TONES = {
  blue: "bg-blue-600",
  green: "bg-emerald-500",
  amber: "bg-amber-500",
};

export default function ProgressBar({ value, label, tone = "blue" }) {
  const percent = Math.max(0, Math.min(100, Number(value) || 0));

  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      className="h-2 w-full overflow-hidden rounded-full bg-slate-200"
    >
      <div
        className={`h-full rounded-full transition-all duration-500 ${TONES[tone] || TONES.blue}`}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}