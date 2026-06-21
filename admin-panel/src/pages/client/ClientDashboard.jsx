import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import ClientLayout from '../../components/ClientLayout';
import StatsCard from '../../components/StatsCard';
import LoadingSpinner from '../../components/LoadingSpinner';
import ErrorMessage from '../../components/ErrorMessage';
import { getClientMe } from '../../api/clientPortalEndpoints';
import { getErrorMessage } from '../../api/client';

const SERVICE_INFO = {
  ai_receptionist: {
    label: 'AI Receptionist',
    description: 'Zara answers every missed call and sends you an instant WhatsApp summary.',
    icon: '📞',
    color: 'purple',
    link: '/client/calls',
    linkLabel: 'View Call Logs',
  },
  whatsapp_bot: {
    label: 'WhatsApp Bot',
    description: 'Zara handles customer WhatsApp enquiries 24/7 on your behalf.',
    icon: '💬',
    color: 'green',
    link: '/client/conversations',
    linkLabel: 'View Conversations',
  },
  full_bundle: {
    label: 'Full Bundle',
    description: 'AI Receptionist + WhatsApp Bot — complete coverage for your business.',
    icon: '🚀',
    color: 'blue',
  },
};

function ActiveServiceCard({ pkg }) {
  const info = SERVICE_INFO[pkg];
  if (!info) return null;
  const colorMap = {
    purple: 'bg-primary/10 border-primary/30 text-primary',
    green: 'bg-green-500/10 border-green-500/30 text-green-400',
    blue: 'bg-blue-500/10 border-blue-500/30 text-blue-400',
  };
  return (
    <div className={`flex items-start gap-4 rounded-lg border p-4 ${colorMap[info.color] || colorMap.purple}`}>
      <span className="text-2xl">{info.icon}</span>
      <div className="flex-1">
        <p className="font-semibold">{info.label}</p>
        <p className="mt-0.5 text-sm opacity-80">{info.description}</p>
        {info.link && (
          <Link to={info.link} className="mt-2 inline-block text-sm font-medium underline underline-offset-2">
            {info.linkLabel} →
          </Link>
        )}
      </div>
    </div>
  );
}

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
            <h2 className="text-lg font-semibold text-cream">Welcome back, {client?.contact_person || client?.name}</h2>
            <p className="text-sm text-cream-dim">Here's an overview of your Zara services.</p>
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

          {client?.service_package && SERVICE_INFO[client.service_package] && (
            <div className="rounded-xl border border-line bg-panel p-5 shadow-sm">
              <h3 className="mb-3 text-sm font-semibold text-cream-dim uppercase tracking-wide">Your Active Plan</h3>
              <ActiveServiceCard pkg={client.service_package} />
            </div>
          )}
        </div>
      )}
    </ClientLayout>
  );
}
