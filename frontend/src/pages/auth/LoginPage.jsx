import { ArrowRight, Eye, EyeOff } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

import { useAuth } from "../../hooks/useAuth";
import { getErrorMessage } from "../../utils/errors";

const PAGE_GRADIENT = "linear-gradient(135deg, #ffb26b 0%, #ff5e8e 50%, #8a3a9c 100%)";
const BUTTON_GRADIENT = "linear-gradient(90deg, #ffa86a 0%, #ff5e8e 50%, #8e3a9e 100%)";
const BLOB_GRADIENT = "linear-gradient(135deg, #ff5e8e 0%, #8e3a9e 100%)";

const INPUT_CLASS =
  "block w-full rounded-lg bg-gray-200 py-3 pl-11 text-sm text-gray-800 placeholder:text-gray-500 transition focus:bg-white focus:outline-none focus:ring-2 focus:ring-pink-400 disabled:cursor-not-allowed disabled:opacity-70";

function MailIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5" aria-hidden="true">
      <path d="M12 2a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1V7a5 5 0 0 0-5-5Zm-3 8V7a3 3 0 0 1 6 0v3H9Z" />
    </svg>
  );
}

// The decorative artwork on the left of the card
function Artwork() {
  return (
    <svg
      className="absolute inset-0 h-full w-full"
      viewBox="0 0 448 480"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="loginGradPink" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ff5e8e" />
          <stop offset="1" stopColor="#8e3a9e" />
        </linearGradient>
        <linearGradient id="loginGradPeach" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffc27a" />
          <stop offset="1" stopColor="#ff7a8a" />
        </linearGradient>
      </defs>

      {/* Pale ring around the big shape */}
      <g transform="translate(-80 -90)">
        <path
          d="M0 0 H205 A205 205 0 0 1 410 205 A205 205 0 0 1 205 410 A205 205 0 0 1 0 205 Z"
          fill="none"
          stroke="#f6cfe2"
          strokeWidth="22"
        />
      </g>

      {/* Big teardrop */}
      <g transform="translate(-50 -60)">
        <path
          d="M0 0 H175 A175 175 0 0 1 350 175 A175 175 0 0 1 175 350 A175 175 0 0 1 0 175 Z"
          fill="url(#loginGradPink)"
        />
      </g>

      {/* Small shape at the top */}
      <rect x="350" y="-80" width="140" height="160" rx="70" fill="url(#loginGradPink)" />

      {/* Small pill at the bottom left */}
      <rect x="-50" y="350" width="140" height="64" rx="32" transform="rotate(40 20 382)" fill="url(#loginGradPink)" />

      {/* Peach shape rising from the bottom */}
      <rect x="200" y="400" width="170" height="170" rx="85" transform="rotate(-25 285 485)" fill="url(#loginGradPeach)" />
    </svg>
  );
}

export default function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await login(email.trim(), password);
      // On success, GuestRoute automatically redirects to the dashboard
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-10" style={{ background: PAGE_GRADIENT }}>
      <div className="relative grid w-full max-w-4xl overflow-hidden rounded-3xl bg-white shadow-2xl shadow-black/30 md:min-h-[30rem] md:grid-cols-2">
        {/* Decorative side (desktop) */}
        <div className="relative hidden overflow-hidden md:block">
          <Artwork />
        </div>

        {/* Small decoration for phones */}
        <div
          className="pointer-events-none absolute -left-10 -top-10 h-28 w-28 rounded-full md:hidden"
          style={{ background: BLOB_GRADIENT }}
          aria-hidden="true"
        />

        {/* Form side */}
        <section className="relative flex flex-col px-8 py-10 sm:px-12 md:py-12">
          <div className="my-auto">
            <p className="text-center text-xs font-semibold uppercase tracking-widest text-gray-400">
              Keep Learning!
            </p>
            <h1 className="mt-2 text-center text-3xl font-bold text-gray-900">Login</h1>

            <form onSubmit={handleSubmit} className="mt-8 space-y-4">
              <div>
                <label htmlFor="email" className="sr-only">
                  Email
                </label>
                <div className="relative">
                  <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-gray-600">
                    <MailIcon />
                  </span>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    placeholder="Email"
                    required
                    disabled={submitting}
                    className={`${INPUT_CLASS} pr-4`}
                  />
                </div>
              </div>

              <div>
                <label htmlFor="password" className="sr-only">
                  Password
                </label>
                <div className="relative">
                  <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-gray-600">
                    <LockIcon />
                  </span>
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    placeholder="Password"
                    required
                    disabled={submitting}
                    className={`${INPUT_CLASS} pr-11`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    aria-pressed={showPassword}
                    className="absolute inset-y-0 right-0 flex items-center rounded-r-lg px-3 text-gray-500 hover:text-gray-700 focus-visible:text-pink-600 focus-visible:outline-none"
                  >
                    {showPassword ? (
                      <EyeOff className="h-5 w-5" aria-hidden="true" />
                    ) : (
                      <Eye className="h-5 w-5" aria-hidden="true" />
                    )}
                  </button>
                </div>
              </div>

              {error && (
                <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-800">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={submitting}
                style={{ background: BUTTON_GRADIENT }}
                className="flex w-full items-center justify-center gap-2 rounded-full px-4 py-3 text-sm font-semibold uppercase tracking-wide text-white shadow-md transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pink-500 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {submitting && (
                  <span
                    className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
                    aria-hidden="true"
                  />
                )}
                {submitting ? "Logging in…" : "Login"}
              </button>
            </form>
          </div>

          <p className="mt-8 text-center text-sm text-gray-500">
            <Link to="/register" className="inline-flex items-center gap-1.5 hover:text-pink-600 hover:underline">
              Create Your Account
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </p>
        </section>
      </div>
    </main>
  );
}