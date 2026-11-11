import { createContext, useCallback, useContext, useEffect, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { AlertCircle, CheckCircle2, X } from "lucide-react";
import { createPortal } from "react-dom";

const NoticeContext = createContext<(text: string, error?: boolean) => void>(
  () => {},
);
export const NoticeLayerContext = createContext<Dispatch<SetStateAction<Element | null>>>(() => {});

export function useNotice() {
  return useContext(NoticeContext);
}

export function NoticeProvider({ children }: { children: ReactNode }) {
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(
    null,
  );
  const [dialog, setDialog] = useState<Element | null>(null);
  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(id);
  }, [notice]);
  const notify = useCallback(
    (text: string, error = false) => setNotice({ text, error }),
    [],
  );
  const toast = notice && (
    <div
      className={"toast " + (notice.error ? "toast-error" : "")}
      role={notice.error ? "alert" : "status"}
    >
      {notice.error ? <AlertCircle size={20} /> : <CheckCircle2 size={20} />}
      <span>{notice.text}</span>
      <button
        type="button"
        className="icon-button"
        aria-label="Đóng thông báo"
        onClick={() => setNotice(null)}
      >
        <X size={16} />
      </button>
    </div>
  );
  return (
    <NoticeContext.Provider value={notify}>
      <NoticeLayerContext.Provider value={setDialog}>
        {children}
        {dialog ? createPortal(toast, dialog) : toast}
      </NoticeLayerContext.Provider>
    </NoticeContext.Provider>
  );
}
