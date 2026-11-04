import { useCallback, useEffect, useState } from "react";

import { fetchDashboardSummary } from "../api/dashboard.api";
import { getErrorMessage } from "../utils/errors";

export function useDashboard() {
  const [state, setState] = useState({ data: null, loading: true, error: "" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;

    fetchDashboardSummary()
      .then((data) => {
        if (!cancelled) setState({ data, loading: false, error: "" });
      })
      .catch((err) => {
        if (!cancelled) setState({ data: null, loading: false, error: getErrorMessage(err) });
      });

    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const reload = useCallback(() => {
    setState((s) => ({ ...s, loading: true, error: "" }));
    setAttempt((n) => n + 1);
  }, []);

  return { ...state, reload };
}