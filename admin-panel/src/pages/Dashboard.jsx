import { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import StatsCard from '../components/StatsCard';
import MessageChart from '../components/MessageChart';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorMessage from '../components/ErrorMessage';
import { getStats, getHealth } from '../api/endpoints';
import { getErrorMessage } from '../api/client';

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [serverOnline, setServerOnline] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError('');
      try {
        const [statsData] = await Promise.all([getStats()]);
        if (cancelled) return;
        setStats(statsData);

        try {
          await getHealth();
          if (!cancelled) setServerOnline(true);
        } catch {
          if (!cancelled) setServerOnline(false);
        }
      } catch (err) {
        if (!cancelled) setError(getErrorMessage(err, 'Failed to load dashboard stats'));
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
    <Layout title="Dashboard">
      {loading && <LoadingSpinner label="Loading dashboard…" />}
      {!loading && error && <ErrorMessage message={error} />}

      {!loading && !error && stats && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatsCard label="Active Clients" value={stats.active_clients} icon="👥" />
            <StatsCard label="Messages Today" value={stats.messages_today} icon="💬" />
            <StatsCard label="Messages This Month" value={stats.messages_this_month} icon="📈" />
            <StatsCard
              label="Server Status"
              value={serverOnline ? 'Online' : 'Offline'}
              status={serverOnline ? 'online' : 'offline'}
              icon="🖥️"
            />
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-base font-semibold text-gray-900">
              Messages per day (last 7 days)
            </h2>
            <MessageChart data={stats.chart_data} clients={stats.clients} />
          </div>
        </div>
      )}
    </Layout>
  );
}
