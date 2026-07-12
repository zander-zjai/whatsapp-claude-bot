import { useCallback, useEffect, useState } from 'react';

/**
 * Lightweight toast for async action feedback.
 * Usage:
 *   const { toast, showToast } = useToast();
 *   showToast('Quote sent to customer'); // success
 *   showToast('Something failed', 'error');
 *   ... <Toast toast={toast} />
 */
export function useToast() {
  const [toast, setToast] = useState(null);

  const showToast = useCallback((message, type = 'success') => {
    setToast({ message, type, key: Date.now() });
  }, []);

  return { toast, showToast };
}

export default function Toast({ toast }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!toast) return undefined;
    setVisible(true);
    const timer = setTimeout(() => setVisible(false), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  if (!toast || !visible) return null;

  const isError = toast.type === 'error';
  return (
    <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 px-4">
      <div
        className={`flex items-center gap-2 rounded-lg border px-4 py-3 text-sm font-medium shadow-lg ${
          isError
            ? 'border-red-500/40 bg-red-950 text-red-300'
            : 'border-green-500/40 bg-green-950 text-green-300'
        }`}
      >
        <span>{isError ? '⚠️' : '✅'}</span>
        <span>{toast.message}</span>
        <button type="button" onClick={() => setVisible(false)} className="ml-2 opacity-60 hover:opacity-100">
          ✕
        </button>
      </div>
    </div>
  );
}
