const TONES = {
  blue: "bg-linear-to-r from-purple-500 to-pink-500",
  green: "bg-linear-to-r from-emerald-400 to-teal-500",
  amber: "bg-linear-to-r from-amber-400 to-orange-500",
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
      className="h-2 w-full overflow-hidden rounded-full bg-slate-200/80"
    >
      <div
        className={`h-full rounded-full transition-all duration-500 ${TONES[tone] || TONES.blue}`}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}