import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "../api/client";
import { message } from "../lib/errors";

export function useResource<T>(path: string | null, empty404 = false) {
  const [state, setState] = useState({ path, data: null as T | null, error: "", loading: Boolean(path) }),
    [count, setCount] = useState(0);
  const reload = useCallback(() => setCount((n) => n + 1), []);
  const setData = useCallback((data: T | null) => {
    setState((old) => ({ ...old, path, data }));
  }, [path]);
  useEffect(() => {
    if (!path) {
      setState({ path, data: null, error: "", loading: false });
      return;
    }
    const controller = new AbortController();
    setState((old) => ({ path, data: old.path === path ? old.data : null, error: "", loading: true }));
    api
      .request<T>(path, { signal: controller.signal })
      .then((value) => {
        if (!controller.signal.aborted) setState({ path, data: value, error: "", loading: false });
      })
      .catch((e) => {
        if (controller.signal.aborted) return;
        const empty = empty404 && e instanceof ApiError && e.status === 404;
        setState((old) => ({ path, data: empty ? null : old.data, error: empty ? "" : message(e), loading: false }));
      });
    return () => controller.abort();
  }, [path, count, empty404]);
  const current = state.path === path ? state : { data: null, error: "", loading: Boolean(path) };
  return { data: current.data, setData, error: current.error, loading: current.loading, reload };
}
