import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import ClientLayout from '../../components/ClientLayout';
import StatsCard from '../../components/StatsCard';
import LoadingSpinner from '../../components/LoadingSpinner';
import ErrorMessage from '../../components/ErrorMessage';
import { getClientMe, setClientConversationHandover } from '../../api/clientPortalEndpoints';
import { getErrorMessage } from '../../api/client';
import { whatsappDeepLink } from '../../utils/format';

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

function LinkedStatsCard({ to, ...props }) {
  return (
    <Link to={to} className="block transition-transform hover:-translate-y-0.5">
      <StatsCard {...props} />
    </Link>
  );
}

function formatDateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' });
}

function ChannelSection({ icon, title, viewAllTo, children }) {
  return (
    <div className="rounded-xl border border-line bg-panel p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-cream-dim uppercase tracking-wide">
          <span>{icon}</span>
          {title}
        </h3>
        {viewAllTo && (
          <Link to={viewAllTo} className="text-xs font-medium text-primary hover:underline">
            View all →
          </Link>
        )}
      </div>
      {children}
    </div>
  );
}

export default function ClientDashboard() {
  const [client, setClient] = useState(null);
  const [summary, setSummary] = useState(null);
  const [pendingQuotes, setPendingQuotes] = useState([]);
  const [hotLeads, setHotLeads] = useState([]);
  const [awaitingHuman, setAwaitingHuman] = useState([]);
  const [recentConversations, setRecentConversations] = useState([]);
  const [recentEmails, setRecentEmails] = useState([]);
  const [recentCalls, setRecentCalls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [takingOverNumber, setTakingOverNumber] = useState(null);

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
        setPendingQuotes(data.pending_quotes || []);
        setHotLeads(data.hot_leads || []);
        setAwaitingHuman(data.awaiting_human || []);
        setRecentConversations(data.recent_conversations || []);
        setRecentEmails(data.recent_emails || []);
        setRecentCalls(data.recent_calls || []);
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

  async function handleTakeOver(customerNumber) {
    setTakingOverNumber(customerNumber);
    try {
      await setClientConversationHandover(customerNumber, true);
      setAwaitingHuman((prev) => prev.filter((c) => c.customer_number !== customerNumber));
      const link = whatsappDeepLink(customerNumber);
      if (link) window.open(link, '_blank', 'noopener,noreferrer');
    } catch (err) {
      // Best-effort from the dashboard -- the Conversations page has the full
      // error handling if this fails for some reason.
    } finally {
      setTakingOverNumber(null);
    }
  }

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
            <LinkedStatsCard to="/client/conversations" label="Messages Today" value={summary.messages_today} icon="💬" />
            <LinkedStatsCard
              to="/client/conversations"
              label="Messages This Month"
              value={`${summary.messages_this_month} / ${summary.monthly_message_limit}`}
              icon="📈"
            />
            <LinkedStatsCard
              to="/client/conversations"
              label="Active Conversations"
              value={summary.active_conversations}
              icon="🗒️"
            />
            <LinkedStatsCard to="/client/quotes" label="Pending Quotes" value={summary.pending_quotes} icon="📋" />
            <LinkedStatsCard
              to="/client/conversations?lead=hot"
              label="Hot Leads"
              value={summary.hot_leads}
              icon="🔥"
            />
            <LinkedStatsCard
              to="/client/conversations?awaiting=human"
              label="Needs You"
              value={summary.awaiting_human}
              status={summary.awaiting_human > 0 ? 'offline' : undefined}
              icon="🙋"
            />
            <LinkedStatsCard
              to="/client/quotes?tab=won"
              label="Won This Month"
              value={summary.won_quotes_this_month}
              icon="🏆"
            />
            <LinkedStatsCard to="/client/calls" label="Calls Today" value={summary.calls_today} icon="📞" />
          </div>

          {awaitingHuman.length > 0 && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-5 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-red-400 uppercase tracking-wide">
                  🙋 Customers Asking For You ({awaitingHuman.length})
                </h3>
                <Link to="/client/conversations?awaiting=human" className="text-xs font-medium text-red-400 hover:underline">
                  View all →
                </Link>
              </div>
              <ul className="space-y-2">
                {awaitingHuman.map((c) => (
                  <li
                    key={c.customer_number}
                    className="flex items-center justify-between gap-3 rounded-lg border border-line bg-panel-2 px-3 py-2 text-sm"
                  >
                    <Link
                      to={`/client/conversations/${encodeURIComponent(c.customer_number)}`}
                      className="min-w-0 flex-1 hover:underline"
                    >
                      <p className="text-cream">{c.customer_name || c.customer_number}</p>
                      <p className="truncate text-xs text-cream-dim">{c.last_message_preview}</p>
                    </Link>
                    <button
                      type="button"
                      onClick={() => handleTakeOver(c.customer_number)}
                      disabled={takingOverNumber === c.customer_number}
                      className="shrink-0 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/20 disabled:opacity-60"
                    >
                      Take Over
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <h3 className="mb-3 text-sm font-semibold text-cream uppercase tracking-wide">By Channel</h3>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <ChannelSection icon="💬" title="WhatsApp" viewAllTo="/client/conversations">
                {recentConversations.length === 0 ? (
                  <p className="text-sm text-cream-dim">No conversations yet.</p>
                ) : (
                  <ul className="space-y-2">
                    {recentConversations.map((c) => (
                      <li key={c.customer_number}>
                        <Link
                          to={`/client/conversations/${encodeURIComponent(c.customer_number)}`}
                          className="block rounded-lg border border-line bg-panel-2 px-3 py-2 text-sm hover:border-primary"
                        >
                          <div className="flex items-center justify-between">
                            <p className="text-cream">{c.customer_name || c.customer_number}</p>
                            <p className="text-xs text-cream-dim">{formatDateTime(c.last_message_at)}</p>
                          </div>
                          <p className="truncate text-xs text-cream-dim">{c.last_message_preview}</p>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </ChannelSection>

              <ChannelSection icon="📧" title="Email" viewAllTo="/client/emails">
                {recentEmails.length === 0 ? (
                  <p className="text-sm text-cream-dim">No emails yet.</p>
                ) : (
                  <ul className="space-y-2">
                    {recentEmails.map((e) => (
                      <li key={e.id} className="rounded-lg border border-line bg-panel-2 px-3 py-2 text-sm">
                        <div className="flex items-center justify-between">
                          <p className="text-cream">{e.from_name || e.from_address}</p>
                          <p className="text-xs text-cream-dim">{formatDateTime(e.timestamp)}</p>
                        </div>
                        <p className="truncate text-xs text-cream-dim">{e.subject || '(no subject)'}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </ChannelSection>

              <ChannelSection icon="📞" title="Missed Calls" viewAllTo="/client/calls">
                {recentCalls.length === 0 ? (
                  <p className="text-sm text-cream-dim">No calls yet.</p>
                ) : (
                  <ul className="space-y-2">
                    {recentCalls.map((c, i) => (
                      <li key={i} className="rounded-lg border border-line bg-panel-2 px-3 py-2 text-sm">
                        <div className="flex items-center justify-between">
                          <p className="text-cream">{c.caller_name || c.caller || 'Unknown'}</p>
                          <p className="text-xs text-cream-dim">{formatDateTime(c.timestamp)}</p>
                        </div>
                        <p className="truncate text-xs text-cream-dim">{c.summary}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </ChannelSection>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-line bg-panel p-5 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-cream-dim uppercase tracking-wide">Needs Approval</h3>
                <Link to="/client/quotes" className="text-xs font-medium text-primary hover:underline">
                  View all →
                </Link>
              </div>
              {pendingQuotes.length === 0 ? (
                <p className="text-sm text-cream-dim">Nothing pending — you're all caught up.</p>
              ) : (
                <ul className="space-y-2">
                  {pendingQuotes.map((q) => (
                    <li key={q.id}>
                      <Link
                        to="/client/quotes"
                        className="flex items-center justify-between rounded-lg border border-line bg-panel-2 px-3 py-2 text-sm hover:border-primary"
                      >
                        <span className="text-cream">
                          {q.channel === 'email' ? '📧' : '📱'} {q.name} — {q.item_description}
                        </span>
                        <span className="text-cream-dim">{q.tier === 2 ? `R${Number(q.total || 0).toFixed(2)}` : '—'}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="rounded-xl border border-line bg-panel p-5 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-cream-dim uppercase tracking-wide">Hot Leads</h3>
                <Link to="/client/conversations" className="text-xs font-medium text-primary hover:underline">
                  View all →
                </Link>
              </div>
              {hotLeads.length === 0 ? (
                <p className="text-sm text-cream-dim">No hot leads right now.</p>
              ) : (
                <ul className="space-y-2">
                  {hotLeads.map((c) => (
                    <li key={c.customer_number}>
                      <Link
                        to={`/client/conversations/${encodeURIComponent(c.customer_number)}`}
                        className="block rounded-lg border border-line bg-panel-2 px-3 py-2 text-sm hover:border-primary"
                      >
                        <p className="text-cream">{c.customer_name || c.customer_number}</p>
                        <p className="truncate text-xs text-cream-dim">{c.lead_reason || c.last_message_preview}</p>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
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
