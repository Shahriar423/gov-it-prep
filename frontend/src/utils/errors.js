// Turns an axios error into one readable sentence for the user.
export function getErrorMessage(error, fallback = "Something went wrong. Please try again.") {
  if (!error?.response) {
    return "Cannot reach the server. Please check that the backend is running.";
  }

  const detail = error.response.data?.detail;

  if (typeof detail === "string") return detail;

  // FastAPI validation errors (422) arrive as a list
  if (Array.isArray(detail) && detail.length > 0) {
    const first = detail[0];
    const msg = String(first.msg || "").replace(/^Value error,\s*/, "");
    const field = Array.isArray(first.loc) ? first.loc[first.loc.length - 1] : "";
    return field && !String(first.msg).startsWith("Value error")
      ? `${field}: ${msg}`
      : msg || fallback;
  }

  return fallback;
}
