import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

export type ToastTone = "info" | "success" | "warning" | "error";

type ToastInput = {
  title: string;
  description?: string;
  tone?: ToastTone;
  durationMs?: number;
};

type ToastRecord = ToastInput & {
  id: string;
  tone: ToastTone;
  durationMs: number;
};

type ToastContextValue = {
  toast: (input: ToastInput) => string;
  dismiss: (id: string) => void;
};

const DEFAULT_DURATION_MS = 4200;
let toastSequence = 0;

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({
  children,
}: {
  children: ReactNode;
}): ReactNode {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const toast = useCallback((input: ToastInput) => {
    const id = `toast-${Date.now()}-${(toastSequence += 1)}`;
    setToasts((current) => [
      ...current,
      {
        id,
        title: input.title,
        description: input.description,
        tone: input.tone ?? "info",
        durationMs: input.durationMs ?? DEFAULT_DURATION_MS,
      },
    ]);
    return id;
  }, []);

  useEffect(() => {
    for (const item of toasts) {
      if (timersRef.current.has(item.id)) continue;
      const timer = setTimeout(() => {
        dismiss(item.id);
      }, item.durationMs);
      timersRef.current.set(item.id, timer);
    }

    for (const [id, timer] of timersRef.current.entries()) {
      if (toasts.some((item) => item.id === id)) continue;
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, [toasts, dismiss]);

  useEffect(() => {
    return () => {
      for (const timer of timersRef.current.values()) {
        clearTimeout(timer);
      }
      timersRef.current.clear();
    };
  }, []);

  const value = useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {typeof document !== "undefined"
        ? createPortal(
            <div
              className="itecify-toast-viewport"
              aria-live="polite"
              aria-atomic="true"
            >
              {toasts.map((item) => (
                <div
                  key={item.id}
                  className={`itecify-toast itecify-toast--${item.tone}`}
                  role="status"
                >
                  <div className="itecify-toast-copy">
                    <strong>{item.title}</strong>
                    {item.description ? <span>{item.description}</span> : null}
                  </div>
                  <button
                    type="button"
                    className="itecify-toast-close"
                    aria-label="Închide notificarea"
                    onClick={() => {
                      dismiss(item.id);
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>,
            document.body,
          )
        : null}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const value = useContext(ToastContext);
  if (!value) {
    throw new Error("useToast must be used within ToastProvider.");
  }
  return value;
}
