import { createContext, useCallback, useContext, useRef, useState } from "react";
import { prettyType } from "../services/format.js";

const ToastCtx = createContext({ push: () => {} });
export const useToast = () => useContext(ToastCtx);

let idc = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const remove = useCallback((id) => {
    setToasts((t) => t.map((x) => (x.id === id ? { ...x, out: true } : x)));
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 300);
  }, []);

  const push = useCallback((violation, onClick) => {
    const id = ++idc;
    setToasts((t) => [...t, { id, violation, onClick }].slice(-4));
    setTimeout(() => remove(id), 8000);
  }, [remove]);

  return (
    <ToastCtx.Provider value={{ push }}>
      {children}
      <div className="toast-stack" aria-live="assertive">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`toast${t.out ? " out" : ""}`}
            data-sev={t.violation.severity || "low"}
            onClick={() => { t.onClick && t.onClick(t.violation); remove(t.id); }}
          >
            <div className="toast-title">
              <span className={`sev ${t.violation.severity || "low"}`}>{t.violation.severity || "low"}</span>
              {prettyType(t.violation.type)}
            </div>
            <div className="toast-body">
              <span className="plate">{t.violation.plate || "UNREAD"}</span> · {t.violation.camera_name || t.violation.camera_id || ""}
            </div>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
