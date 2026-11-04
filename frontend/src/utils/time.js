// 75 -> "01:15", 3725 -> "1:02:05"
export function formatClock(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const mm = String(m).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

// 45 -> "45 min", 90 -> "1 h 30 min"
export function formatMinutes(minutes) {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

// 125 -> "2 min 5 s"
export function formatTaken(seconds) {
  const s = Math.max(0, Math.round(seconds));
  const m = Math.floor(s / 60);
  return m > 0 ? `${m} min ${s % 60} s` : `${s} s`;
}

export function formatNegative(value) {
  return value === 0 ? "No negative marking" : `−${value} per wrong answer`;
}

// 7.5 -> "7.5", 7 -> "7", 6.75 -> "6.75"
export function formatScore(value) {
  return Number(value).toString();
}