import { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import ClientLayout from '../../components/ClientLayout';
import LoadingSpinner from '../../components/LoadingSpinner';
import ErrorMessage from '../../components/ErrorMessage';
import {
  getClientQuotes,
  updateClientQuote,
  getClientQuotePdfBlob,
  getClientQuoteAnalytics,
} from '../../api/clientPortalEndpoints';
import { getErrorMessage } from '../../api/client';
import { formatDateTime } from '../../utils/format';

const STATUS_STYLES = {
  pending: 'bg-yellow-100 text-yellow-700',
  approved: 'bg-blue-100 text-blue-700',
  sent: 'bg-green-100 text-green-700',
  revised: 'bg-purple-100 text-purple-700',
  rejected: 'bg-red-100 text-red-700',
  declined: 'bg-red-100 text-red-700',
  accepted: 'bg-green-100 text-green-700',
  quoted: 'bg-blue-100 text-blue-700',
  won: 'bg-green-100 text-green-700',
  lost: 'bg-panel-2 text-cream-dim',
  needs_pricing: 'bg-orange-100 text-orange-700',
  expired: 'bg-panel-2 text-grey',
};

const OUTCOME_OPTIONS = ['pending', 'quoted', 'accepted', 'won', 'declined', 'lost'];

const TABS = [
  { key: 'open', label: 'Open' },
  { key: 'won', label: 'Won / Accepted' },
  { key: 'lost', label: 'Lost / Declined' },
  { key: 'expired', label: 'Expired' },
];

function tabForStatus(status) {
  if (['won', 'accepted'].includes(status)) return 'won';
  if (['lost', 'rejected', 'declined'].includes(status)) return 'lost';
  if (status === 'expired') return 'expired';
  return 'open';
}

function daysRemaining(validUntil) {
  if (!validUntil) return null;
  const ms = new Date(validUntil).getTime() - Date.now();
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}

function Daysbadge({ validUntil, status }) {
  if (!validUntil || !['pending', 'sent', 'revised'].includes(status)) return null;
  const days = daysRemaining(validUntil);
  if (days === null) return null;
  if (days <= 0) return <span className="ml-1 rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-600">Expired</span>;
  if (days <= 2) return <span className="ml-1 rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-medium text-red-600">{days}d left</span>;
  if (days <= 4) return <span className="ml-1 rounded-full bg-orange-100 px-1.5 py-0.5 text-[10px] font-medium text-orange-600">{days}d left</span>;
  return <span className="ml-1 rounded-full bg-panel-2 px-1.5 py-0.5 text-[10px] font-medium text-cream-dim">{days}d left</span>;
}

function AnalyticsBanner({ analytics }) {
  if (!analytics) return null;
  const fmt = (v) => `R${Number(v || 0).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return (
    <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {[
        { label: 'Quotes this month', value: analytics.total_quotes },
        { label: 'Total value', value: fmt(analytics.total_value) },
        { label: 'Accepted / Won', value: analytics.accepted },
        { label: 'Pending', value: analytics.pending },
        { label: 'Declined', value: analytics.declined },
        { label: 'Conversion rate', value: `${analytics.conversion_rate}%` },
      ].map(({ label, value }) => (
        <div key={label} className="rounded-xl border border-line bg-panel p-4 shadow-sm">
          <p className="text-xs text-cream-dim">{label}</p>
          <p className="mt-1 text-lg font-semibold text-cream">{value}</p>
        </div>
      ))}
    </div>
  );
}

export default function ClientQuotes() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = searchParams.get('tab') || 'open';
  const [quotes, setQuotes] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [tab, setTab] = useState(TABS.some((t) => t.key === initialTab) ? initialTab : 'open');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [pendingId, setPendingId] = useState(null);
  const [approvingId, setApprovingId] = useState(null);
  const [etaDraft, setEtaDraft] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [data, analyticsData] = await Promise.all([
        getClientQuotes(),
        getClientQuoteAnalytics().catch(() => null),
      ]);
      setQuotes(data);
      setAnalytics(analyticsData);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load quote requests'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function startApproving(quote) {
    setActionError('');
    setApprovingId(quote.id);
    setEtaDraft('');
  }
  function cancelApproving() { setApprovingId(null); setEtaDraft(''); }

  async function confirmApprove(quote) {
    setActionError('');
    setPendingId(quote.id);
    try {
      const updated = await updateClientQuote(quote.id, { action: 'approve', eta: etaDraft });
      setQuotes((prev) => prev.map((q) => (q.id === quote.id ? updated : q)));
      setApprovingId(null);
      setEtaDraft('');
    } catch (err) {
      setActionError(getErrorMessage(err, 'Failed to approve quote'));
    } finally {
      setPendingId(null);
    }
  }

  async function handleReject(quote) {
    setActionError('');
    setPendingId(quote.id);
    try {
      const updated = await updateClientQuote(quote.id, { action: 'reject' });
      setQuotes((prev) => prev.map((q) => (q.id === quote.id ? updated : q)));
    } catch (err) {
      setActionError(getErrorMessage(err, 'Failed to reject quote'));
    } finally {
      setPendingId(null);
    }
  }

  async function handleStatusChange(quote, status) {
    if (!status || status === quote.status) return;
    setActionError('');
    setPendingId(quote.id);
    try {
      const updated = await updateClientQuote(quote.id, { status });
      setQuotes((prev) => prev.map((q) => (q.id === quote.id ? updated : q)));
    } catch (err) {
      setActionError(getErrorMessage(err, 'Failed to update quote status'));
    } finally {
      setPendingId(null);
    }
  }

  async function handleDownloadPdf(quote) {
    setActionError('');
    setPendingId(quote.id);
    try {
      const blob = await getClientQuotePdfBlob(quote.id);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `quote-${quote.id.slice(0, 8)}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setActionError(getErrorMessage(err, 'Failed to download PDF'));
    } finally {
      setPendingId(null);
    }
  }

  const visibleQuotes = quotes.filter((q) => tabForStatus(q.status) === tab);
  const counts = quotes.reduce((acc, q) => {
    const t = tabForStatus(q.status);
    acc[t] = (acc[t] || 0) + 1;
    return acc;
  }, {});

  return (
    <ClientLayout title="Quote Requests">
      <AnalyticsBanner analytics={analytics} />

      <div className="mb-4 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => {
              setTab(t.key);
              setSearchParams(t.key === 'open' ? {} : { tab: t.key });
            }}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              tab === t.key ? 'bg-primary text-ink' : 'border border-line text-cream-dim hover:bg-panel-2'
            }`}
          >
            {t.label} ({counts[t.key] || 0})
          </button>
        ))}
      </div>

      {loading && <LoadingSpinner label="Loading quote requests…" />}
      {!loading && error && <ErrorMessage message={error} />}
      {!loading && !error && actionError && <ErrorMessage message={actionError} />}

      {!loading && !error && (
        <div className="overflow-x-auto rounded-xl border border-line bg-panel shadow-sm">
          <table className="min-w-full divide-y divide-line text-sm">
            <thead className="bg-panel-2">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-cream-dim">Date</th>
                <th className="px-4 py-3 text-left font-semibold text-cream-dim">Channel</th>
                <th className="px-4 py-3 text-left font-semibold text-cream-dim">Name</th>
                <th className="px-4 py-3 text-left font-semibold text-cream-dim">Item</th>
                <th className="px-4 py-3 text-left font-semibold text-cream-dim">Total</th>
                <th className="px-4 py-3 text-left font-semibold text-cream-dim">Margin</th>
                <th className="px-4 py-3 text-left font-semibold text-cream-dim">Status</th>
                <th className="px-4 py-3 text-left font-semibold text-cream-dim">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {visibleQuotes.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-cream-dim">
                    No {tab} quote requests.
                  </td>
                </tr>
              )}
              {visibleQuotes.map((quote) => {
                const isApprovable = quote.tier === 2 && ['pending', 'revised'].includes(quote.status);
                return (
                  <tr
                    key={quote.id}
                    onClick={() => navigate(`/client/quotes/${quote.id}`)}
                    className="cursor-pointer hover:bg-panel-2"
                  >
                    <td className="whitespace-nowrap px-4 py-3 text-cream-dim">{formatDateTime(quote.created_at)}</td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${quote.channel === 'email' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>
                        {quote.channel === 'email' ? '📧 Email' : '📱 WhatsApp'}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-cream">
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); navigate(`/client/customers/${encodeURIComponent(quote.customer_number)}/quotes`); }}
                        className="text-primary hover:underline"
                      >
                        {quote.name || quote.customer_number}
                      </button>
                    </td>
                    <td className="max-w-[200px] px-4 py-3 text-cream">{quote.item_description}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-cream">
                      {quote.tier === 2 ? `R${Number(quote.total || 0).toFixed(2)}` : '—'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-cream-dim text-xs">
                      {quote.margin_percent ? `+${quote.margin_percent}%` : '—'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span className={`rounded-full px-2 py-1 text-xs font-medium ${STATUS_STYLES[quote.status] || 'bg-panel-2 text-cream-dim'}`}>
                        {quote.status}
                      </span>
                      <Daysbadge validUntil={quote.valid_until} status={quote.status} />
                    </td>
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex flex-col gap-1.5" style={{ minWidth: 160 }}>
                        {isApprovable && approvingId !== quote.id && (
                          <div className="flex gap-1">
                            <button
                              type="button"
                              onClick={() => startApproving(quote)}
                              disabled={pendingId === quote.id}
                              className="flex-1 rounded-lg border border-green-500/30 px-2 py-1 text-xs font-medium text-green-400 hover:bg-green-500/10 disabled:opacity-60"
                            >
                              Approve & Send
                            </button>
                            <button
                              type="button"
                              onClick={() => navigate(`/client/quotes/${quote.id}?action=revise`)}
                              disabled={pendingId === quote.id}
                              className="flex-1 rounded-lg border border-purple-500/30 px-2 py-1 text-xs font-medium text-purple-400 hover:bg-purple-500/10 disabled:opacity-60"
                            >
                              Revise
                            </button>
                            <button
                              type="button"
                              onClick={() => handleReject(quote)}
                              disabled={pendingId === quote.id}
                              className="flex-1 rounded-lg border border-red-500/30 px-2 py-1 text-xs font-medium text-red-400 hover:bg-red-500/10 disabled:opacity-60"
                            >
                              Decline
                            </button>
                          </div>
                        )}

                        {approvingId === quote.id && (
                          <div className="rounded-lg border border-line bg-panel-2 p-2">
                            <label className="mb-1 block text-[11px] font-medium text-cream-dim">ETA for customer</label>
                            <input
                              type="text"
                              value={etaDraft}
                              onChange={(e) => setEtaDraft(e.target.value)}
                              placeholder="e.g. 7-10 working days"
                              autoFocus
                              className="w-full rounded-md border border-line bg-panel px-2 py-1 text-xs text-cream placeholder:text-grey focus:border-primary focus:outline-none"
                            />
                            <div className="mt-2 flex gap-1">
                              <button type="button" onClick={() => confirmApprove(quote)} disabled={pendingId === quote.id} className="flex-1 rounded-md bg-primary px-2 py-1 text-xs font-medium text-ink disabled:opacity-60">
                                {pendingId === quote.id ? 'Sending…' : 'Confirm & Send'}
                              </button>
                              <button type="button" onClick={cancelApproving} disabled={pendingId === quote.id} className="rounded-md border border-line px-2 py-1 text-xs text-cream-dim hover:bg-panel disabled:opacity-60">
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}

                        {quote.tier === 2 && quote.status !== 'needs_pricing' && (
                          <button
                            type="button"
                            onClick={() => handleDownloadPdf(quote)}
                            disabled={pendingId === quote.id}
                            className="w-full rounded-lg border border-line px-2 py-1 text-xs font-medium text-cream-dim hover:bg-panel-2 disabled:opacity-60"
                          >
                            Download PDF
                          </button>
                        )}

                        <select
                          value={OUTCOME_OPTIONS.includes(quote.status) ? quote.status : ''}
                          onChange={(e) => handleStatusChange(quote, e.target.value)}
                          disabled={pendingId === quote.id}
                          className="w-full rounded-lg border border-line bg-panel-2 px-2 py-1.5 text-xs text-cream-dim focus:border-primary focus:outline-none disabled:opacity-60"
                        >
                          <option value="" disabled hidden>Mark as…</option>
                          {OUTCOME_OPTIONS.map((opt) => (
                            <option key={opt} value={opt}>{opt.charAt(0).toUpperCase() + opt.slice(1)}</option>
                          ))}
                        </select>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </ClientLayout>
  );
}
