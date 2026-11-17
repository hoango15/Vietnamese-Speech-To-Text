import { useEffect } from "react";
import { useBlocker } from "react-router-dom";

export function useUnsavedChanges(
  dirty: boolean,
  report?: (dirty: boolean) => void,
  otherDirty = false,
  navigationLocked = false,
): void {
  useEffect(() => {
    report?.(dirty);
    return () => report?.(false);
  }, [dirty, report]);
  const blocked = dirty || otherDirty || navigationLocked;
  const blocker = useBlocker(blocked);
  useEffect(() => {
    if (blocker.state === "blocked") {
      if (navigationLocked) {
        blocker.reset();
        return;
      }
      if (
        window.confirm(
          "Bạn có thay đổi chưa lưu. Rời trang và bỏ các thay đổi này?",
        )
      )
        blocker.proceed();
      else blocker.reset();
    }
  }, [blocker, navigationLocked]);
  useEffect(() => {
    if (!blocked) return;
    const listener = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", listener);
    return () => window.removeEventListener("beforeunload", listener);
  }, [blocked]);
}
