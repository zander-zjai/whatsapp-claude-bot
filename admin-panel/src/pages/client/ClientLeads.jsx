import { useEffect, useState } from 'react';
import ClientLayout from '../../components/ClientLayout';
import LoadingSpinner from '../../components/LoadingSpinner';
import ErrorMessage from '../../components/ErrorMessage';
import { getClientCallLogs } from '../../api/clientPortalEndpoints';
import { getErrorMessage } from '../../api/client';

function formatDateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-ZA', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export default function ClientLeads() {
  const [calls, setCalls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    getClientCallLogs()
      .then((data) => { if (!cancelled) setCalls(data); })
      .catch((err) => { if (!cancelled) setError(getErrorMessage(err, 'Failed to load leads')); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const leads = calls
    .filter((call) => call.callback_requested)
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  return (
    <ClientLayout title="Callback Requests">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-cream-dim">
          Callers who asked Zara for a callback — {leads.length} pending
        </p>
      </div>

      {loading && <LoadingSpinner label="Loading callbacks…" />}
      {!loading && error && <ErrorMessage message={error} />}

      {!loading && !error && leads.length === 0 && (
        <div className="rounded-xl border border-dashed border-line bg-panel py-16 text-center text-cream-dim">
          <p className="text-lg">🙌</p>
          <p className="mt-2 font-medium">Nothing to action right now</p>
          <p className="mt-1 text-sm">
            Calls where Zara hears a callback request will show up here, newest first.
          </p>
        </div>
      )}

      {!loading && !error && leads.length > 0 && (
        <div className="space-y-3">
          {leads.map((call) => (
            <div
              key={call.id}
              className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-cream">{call.caller_name || call.caller || 'Unknown'}</p>
                  {call.caller_name && (
                    <p className="font-mono text-xs text-cream-dim">{call.caller}</p>
                  )}
                </div>
                <p className="text-xs text-cream-dim">{formatDateTime(call.timestamp)}</p>
              </div>
              <p className="mt-2 text-sm text-cream">{call.summary}</p>
            </div>
          ))}
        </div>
      )}
    </ClientLayout>
  );
}
