import { useEffect, useState } from 'react';
import ClientLayout from '../../components/ClientLayout';
import StatsCard from '../../components/StatsCard';
import LoadingSpinner from '../../components/LoadingSpinner';
import ErrorMessage from '../../components/ErrorMessage';
import { getClientMe } from '../../api/clientPortalEndpoints';
import { getErrorMessage } from '../../api/client';

export default function ClientDashboard() {
  const [client, setClient] = useState(null);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError('');
      try {
        const data = await getClientMe();
        if (cancelled) return;
        setClient(data.client);
        setSummary(data.summary);
      } catch (err) {
        if (!cancelled) setError(getErrorMessage(err, 'Failed to load dashboard'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <ClientLayout title="Dashboard">
      {loading && <LoadingSpinner label="Loading dashboard…" />}
      {!loading && error && <ErrorMessage message={error} />}

      {!loading && !error && summary && (
        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Welcome back, {client?.name}</h2>
            <p className="text-sm text-gray-500">Here's how your WhatsApp assistant is doing.</p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatsCard label="Messages Today" value={summary.messages_today} icon="💬" />
            <StatsCard
              label="Messages This Month"
              value={`${summary.messages_this_month} / ${summary.monthly_message_limit}`}
              icon="📈"
            />
            <StatsCard label="Active Conversations" value={summary.active_conversations} icon="🗒️" />
            <StatsCard label="Pending Quotes" value={summary.pending_quotes} icon="📋" />
          </div>
        </div>
      )}
    </ClientLayout>
  );
}
