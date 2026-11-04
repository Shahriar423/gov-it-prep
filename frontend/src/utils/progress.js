export function progressTone(percent) {
  if (percent >= 70) return "green";
  if (percent >= 40) return "blue";
  return "amber";
}