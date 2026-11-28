import { useRef, useState } from "react";
import { useNotice } from "../ui/NoticeProvider";
import { message } from "../lib/errors";

export function useAction() {
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const notify = useNotice();
  const run = async <T,>(
    task: () => Promise<T>,
    success?: string,
  ): Promise<T | undefined> => {
    if (pending.current) return undefined;
    pending.current = true;
    setBusy(true);
    try {
      const result = await task();
      if (success) notify(success);
      return result;
    } catch (error) {
      notify(message(error), true);
      return undefined;
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };
  return { busy, run };
}
