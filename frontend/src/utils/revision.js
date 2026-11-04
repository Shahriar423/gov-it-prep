// Time until a date, as a short phrase: "now", "in 25 min", "in 3 hours", "in 2 days"
export function relativeTime(iso) {
  if (!iso) return "now";
  const diff = new Date(iso).getTime() - Date.now();
  if (Number.isNaN(diff) || diff <= 0) return "now";

  const minutes = Math.ceil(diff / 60000);
  if (minutes < 60) return `in ${minutes} min`;
  const hours = Math.ceil(minutes / 60);
  if (hours < 24) return `in ${hours} ${hours === 1 ? "hour" : "hours"}`;
  const days = Math.ceil(hours / 24);
  return `in ${days} ${days === 1 ? "day" : "days"}`;
}

// "Due now" or "Due in 2 days"
export function dueLabel(iso) {
  const rel = relativeTime(iso);
  return rel === "now" ? "Due now" : `Due ${rel}`;
}

export function plural(count, word) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}