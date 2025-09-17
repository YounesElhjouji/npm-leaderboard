import { useCallback, useEffect, useState } from "react";

export type ToastKind = "info" | "success" | "warning" | "error";

export interface Toast {
  id: string;
  kind: ToastKind;
  message: string;
  ttlMs?: number;
}

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const remove = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const push = useCallback(
    (kind: ToastKind, message: string, ttlMs = 5000) => {
      const id = Math.random().toString(36).slice(2);
      const toast: Toast = { id, kind, message, ttlMs };
      setToasts((prev) => [...prev, toast]);
      if (ttlMs > 0) {
        setTimeout(() => remove(id), ttlMs);
      }
      return id;
    },
    [remove],
  );

  // Clear on unmount (defensive)
  useEffect(() => {
    return () => setToasts([]);
  }, []);

  return { toasts, push, remove };
}
