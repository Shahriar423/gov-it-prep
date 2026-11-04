// Same rules as the backend. The backend is still the one that enforces them.
export function checkPassword(pw) {
  if (pw.length < 8) return "Password must be at least 8 characters long.";
  if (new TextEncoder().encode(pw).length > 72) return "Password is too long (maximum 72 bytes).";
  if (!/\p{L}/u.test(pw) || !/\p{Nd}/u.test(pw)) {
    return "Password must contain at least one letter and one number.";
  }
  return null;
}