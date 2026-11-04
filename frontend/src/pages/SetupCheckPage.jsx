import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { fetchHealth } from "../api/health.api";

const DOT_COLORS = {
  ok: "bg-green-500",
  fail: "bg-red-500",
  wait: "bg-gray-400",
};

function StatusRow({ label, state, text }) {
  return (
    <li className="flex items-center justify-between py-3">
      <span className="font-medium">{label}</span>
      <span className="flex items-center gap-2">
        <span className={`h-2.5 w-2.5 rounded-full ${DOT_COLORS[state]}`} aria-hidden="true" />
        <span>{text}</span>
      </span>
    </li>
  );
}

export default function SetupCheckPage() {
  const [state, setState] = useState({ status: "loading", data: null });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    document.title = "Gov IT Prep Portal";
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchHealth()
      .then((data) => {
        if (!cancelled) setState({ status: "ok", data });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "error", data: null });
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const recheck = () => {
    setState({ status: "loading", data: null });
    setAttempt((n) => n + 1);
  };

  const { status, data } = state;

  const backendState = status === "ok" ? "ok" : status === "error" ? "fail" : "wait";
  const backendText =
    status === "ok" ? "Working" : status === "error" ? "Unavailable" : "Checking…";

  let dbState = "wait";
  let dbText = "Checking…";
  if (status === "error") {
    dbText = "Not checked";
  } else if (status === "ok") {
    const connected = data.database === "connected";
    dbState = connected ? "ok" : "fail";
    dbText = connected ? "Connected" : "Unavailable";
  }

  return (
    <main className="min-h-screen bg-gray-50 text-gray-900">
      <div className="mx-auto max-w-xl px-4 py-10">
        <p className="text-sm text-gray-500">System status</p>
        <h1 className="text-2xl font-bold">Gov IT Prep Portal</h1>
        <p className="mt-4 text-gray-700">
          This page confirms that the frontend, backend, and database are connected.
        </p>

        <section className="mt-6 rounded-lg border border-gray-200 bg-white p-4">
          <ul className="divide-y divide-gray-100">
            <StatusRow label="Frontend" state="ok" text="Running" />
            <StatusRow label="Backend server" state={backendState} text={backendText} />
            <StatusRow label="Database" state={dbState} text={dbText} />
          </ul>

          {status === "error" && (
            <p role="alert" className="mt-3 text-sm text-red-700">
              Cannot reach the backend. Is it running on the expected address?
            </p>
          )}

          <button
            type="button"
            onClick={recheck}
            className="mt-4 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Check again
          </button>
        </section>

        <p className="mt-6 text-sm">
          <Link to="/dashboard" className="text-blue-700 underline">
            Back to the app
          </Link>
        </p>
      </div>
    </main>
  );
}
