import { useState } from "react";
import { Link } from "react-router-dom";

import TextField from "../../components/common/TextField";
import { useAuth } from "../../hooks/useAuth";
import { getErrorMessage } from "../../utils/errors";

// Same rules as the backend. The backend is still the one that enforces them.
function checkPassword(pw) {
  if (pw.length < 8) return "Password must be at least 8 characters long.";
  if (new TextEncoder().encode(pw).length > 72) return "Password is too long (maximum 72 bytes).";
  if (!/\p{L}/u.test(pw) || !/\p{Nd}/u.test(pw)) {
    return "Password must contain at least one letter and one number.";
  }
  return null;
}

export default function RegisterPage() {
  const { register } = useAuth();
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    confirm: "",
  });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const setField = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (form.name.trim().length < 2) return setError("Please enter your name.");
    const pwProblem = checkPassword(form.password);
    if (pwProblem) return setError(pwProblem);
    if (form.password !== form.confirm) return setError("Passwords do not match.");

    setSubmitting(true);
    try {
      await register({
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
      });
      // On success, GuestRoute automatically redirects to the dashboard
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-8">
      <div className="w-full max-w-sm rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h1 className="text-xl font-bold">Create your account</h1>
        <p className="mt-1 text-sm text-gray-600">Gov IT Prep Portal</p>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <TextField
            id="name"
            label="Full name"
            value={form.name}
            onChange={setField("name")}
            autoComplete="name"
          />
          <TextField
            id="email"
            label="Email"
            type="email"
            value={form.email}
            onChange={setField("email")}
            autoComplete="email"
          />
          <TextField
            id="password"
            label="Password"
            type="password"
            value={form.password}
            onChange={setField("password")}
            autoComplete="new-password"
            hint="At least 8 characters, with a letter and a number."
          />
          <TextField
            id="confirm"
            label="Confirm password"
            type="password"
            value={form.confirm}
            onChange={setField("confirm")}
            autoComplete="new-password"
          />

          {error && (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {submitting ? "Creating account…" : "Register"}
          </button>
        </form>

        <p className="mt-4 text-sm text-gray-600">
          Already have an account?{" "}
          <Link to="/login" className="text-blue-700 underline">
            Log in
          </Link>
        </p>
      </div>
    </main>
  );
}