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

const LEAD_CLASSES = {
  hot: 'bg-red-100 text-red-700',
  warm: 'bg-orange-100 text-orange-700',
  cold: 'bg-gray-100 text-gray-500',
};

function LeadBadge({ tag }) {
  if (!tag) return <span className="text-xs text-gray-400">—</span>;
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium capitalize ${LEAD_CLASSES[tag] || LEAD_CLASSES.cold}`}>
      {tag}
    </span>
  );
}

function EndedBadge({ reason }) {
  const lower = (reason || '').toLowerCase();
  const isCustomer = lower.includes('customer');
  const isAssistant = lower.includes('assistant');
  const color = isCustomer
    ? 'bg-blue-100 text-blue-700'
    : isAssistant
    ? 'bg-orange-100 text-orange-700'
    : 'bg-gray-100 text-gray-600';
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${color}`}>
      {reason || 'Unknown'}
    </span>
  );
}

export default function ClientCallLogs() {
  const [calls, setCalls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    getClientCallLogs()
      .then((data) => { if (!cancelled) setCalls(data); })
      .catch((err) => { if (!cancelled) setError(getErrorMessage(err, 'Failed to load call logs')); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return (
    <ClientLayout title="Call Logs">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-gray-500">{calls.length} call(s) on record</p>
      </div>

      {loading && <LoadingSpinner label="Loading call logs…" />}
      {!loading && error && <ErrorMessage message={error} />}

      {!loading && !error && calls.length === 0 && (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white py-16 text-center text-gray-500">
          <p className="text-lg">📞</p>
          <p className="mt-2 font-medium">No calls yet</p>
          <p className="mt-1 text-sm">
            Call logs appear here after Zara handles her first missed call.
          </p>
        </div>
      )}

      {!loading && !error && calls.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Date &amp; Time</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Caller</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Ended</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Lead</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Summary</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {calls.map((call) => (
                <tr
                  key={call.id}
                  className="hover:bg-gray-50 cursor-pointer"
                  onClick={() => setExpanded(expanded === call.id ? null : call.id)}
                >
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                    {formatDateTime(call.timestamp)}
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-900">{call.caller || 'Unknown'}</td>
                  <td className="px-4 py-3">
                    <EndedBadge reason={call.ended_reason} />
                  </td>
                  <td className="px-4 py-3">
                    <LeadBadge tag={call.lead_tag} />
                  </td>
                  <td className="px-4 py-3 text-gray-600">
                    {expanded === call.id ? (
                      <span className="whitespace-pre-wrap">{call.summary}</span>
                    ) : (
                      <span className="line-clamp-1">{call.summary}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ClientLayout>
  );
}
