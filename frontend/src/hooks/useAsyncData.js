import { useCallback, useEffect, useState } from "react";

import { getErrorMessage } from "../utils/errors";

/**
 * Loads data and tracks loading/error state.
 *   loader: function returning a Promise
 *   key:    a string that identifies what is being loaded (e.g. the id in the URL).
 *           When the key changes, the data is loaded again.
 * Returns { data, loading, error, reload, setData }.
 */
export function useAsyncData(loader, key) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState({ id: null, data: null, error: "" });

  const requestId = `${key}#${attempt}`;

  useEffect(() => {
    let cancelled = false;

    loader()
      .then((data) => {
        if (!cancelled) setResult({ id: requestId, data, error: "" });
      })
      .catch((err) => {
        if (!cancelled) setResult({ id: requestId, data: null, error: getErrorMessage(err) });
      });

    return () => {
      cancelled = true;
    };
    // The loader is intentionally not a dependency: `key` identifies what is loaded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestId]);

  const loading = result.id !== requestId;

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  // Lets a page update the loaded data locally (for example after a button click)
  const setData = useCallback((updater) => {
    setResult((r) => ({
      ...r,
      data: typeof updater === "function" ? updater(r.data) : updater,
    }));
  }, []);

  return {
    data: loading ? null : result.data,
    loading,
    error: loading ? "" : result.error,
    reload,
    setData,
  };
}