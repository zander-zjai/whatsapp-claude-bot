import { useEffect, useState } from 'react';
import ClientLayout from '../../components/ClientLayout';
import LoadingSpinner from '../../components/LoadingSpinner';
import ErrorMessage from '../../components/ErrorMessage';
import { getClientQuotes, updateClientQuote, getClientQuotePdfBlob } from '../../api/clientPortalEndpoints';
import { getErrorMessage } from '../../api/client';
import { formatDateTime } from '../../utils/format';

const STATUS_STYLES = {
  pending: 'bg-yellow-100 text-yellow-700',
  approved: 'bg-blue-100 text-blue-700',
  sent: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
  quoted: 'bg-blue-100 text-blue-700',
  won: 'bg-green-100 text-green-700',
  lost: 'bg-line text-cream-dim',
  needs_pricing: 'bg-orange-100 text-orange-700',
};

const OUTCOME_OPTIONS = ['pending', 'quoted', 'won', 'lost'];

const TABS = [
  { key: 'open', label: 'Open' },
  { key: 'won', label: 'Won' },
  { key: 'lost', label: 'Lost' },
];

function tabForStatus(status) {
  if (status === 'won') return 'won';
  if (status === 'lost' || status === 'rejected') return 'lost';
  return 'open';
}

export default function ClientQuotes() {
  const [quotes, setQuotes] = useState([]);
  const [tab, setTab] = useState('open');
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
      const data = await getClientQuotes();
      setQuotes(data);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load quote requests'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function startApproving(quote) {
    setActionError('');
    setApprovingId(quote.id);
    setEtaDraft('');
  }

  function cancelApproving() {
    setApprovingId(null);
    setEtaDraft('');
  }

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
      <div className="mb-4 flex gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
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
                <th className="px-4 py-3 text-left font-semibold text-cream-dim">Name</th>
                <th className="px-4 py-3 text-left font-semibold text-cream-dim">Contact</th>
                <th className="px-4 py-3 text-left font-semibold text-cream-dim">Item</th>
                <th className="px-4 py-3 text-left font-semibold text-cream-dim">Size</th>
                <th className="px-4 py-3 text-left font-semibold text-cream-dim">Quantity</th>
                <th className="px-4 py-3 text-left font-semibold text-cream-dim">Tier</th>
                <th className="px-4 py-3 text-left font-semibold text-cream-dim">Total</th>
                <th className="px-4 py-3 text-left font-semibold text-cream-dim">ETA</th>
                <th className="px-4 py-3 text-left font-semibold text-cream-dim">Status</th>
                <th className="px-4 py-3 text-left font-semibold text-cream-dim">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {visibleQuotes.length === 0 && (
                <tr>
                  <td colSpan={11} className="px-4 py-10 text-center text-cream-dim">
                    No {tab} quote requests.
                  </td>
                </tr>
              )}
              {visibleQuotes.map((quote) => (
                <tr key={quote.id} className="hover:bg-panel-2">
                  <td className="whitespace-nowrap px-4 py-3 text-cream-dim">{formatDateTime(quote.created_at)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-cream">{quote.name}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-cream">{quote.contact_number}</td>
                  <td className="px-4 py-3 text-cream">{quote.item_description}</td>
                  <td className="px-4 py-3 text-cream">{quote.size}</td>
                  <td className="px-4 py-3 text-cream">{quote.quantity}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-cream-dim">Tier {quote.tier || 1}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-cream">
                    {quote.tier === 2 ? `R${Number(quote.total || 0).toFixed(2)}` : '—'}
                  </td>
                  <td className="px-4 py-3 text-cream-dim">{quote.eta || '—'}</td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-medium ${
                        STATUS_STYLES[quote.status] || 'bg-panel-2 text-cream-dim'
                      }`}
                    >
                      {quote.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-2" style={{ minWidth: 180 }}>
                      {quote.tier === 2 && quote.status === 'pending' && approvingId !== quote.id && (
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => startApproving(quote)}
                            disabled={pendingId === quote.id}
                            className="flex-1 rounded-lg border border-green-500/30 px-3 py-1.5 text-xs font-medium text-green-400 hover:bg-green-500/10 disabled:opacity-60"
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            onClick={() => handleReject(quote)}
                            disabled={pendingId === quote.id}
                            className="flex-1 rounded-lg border border-red-500/30 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/10 disabled:opacity-60"
                          >
                            Reject
                          </button>
                        </div>
                      )}

                      {approvingId === quote.id && (
                        <div className="rounded-lg border border-line bg-panel-2 p-2">
                          <label className="mb-1 block text-[11px] font-medium text-cream-dim">
                            ETA (sent to customer with the quote)
                          </label>
                          <input
                            type="text"
                            value={etaDraft}
                            onChange={(e) => setEtaDraft(e.target.value)}
                            placeholder="e.g. 7-10 working days"
                            autoFocus
                            className="w-full rounded-md border border-line bg-panel px-2 py-1 text-xs text-cream placeholder:text-grey focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                          />
                          <div className="mt-2 flex gap-2">
                            <button
                              type="button"
                              onClick={() => confirmApprove(quote)}
                              disabled={pendingId === quote.id}
                              className="flex-1 rounded-md bg-primary px-2 py-1 text-xs font-medium text-ink disabled:opacity-60"
                            >
                              {pendingId === quote.id ? 'Sending…' : 'Confirm & Send'}
                            </button>
                            <button
                              type="button"
                              onClick={cancelApproving}
                              disabled={pendingId === quote.id}
                              className="rounded-md border border-line px-2 py-1 text-xs text-cream-dim hover:bg-panel disabled:opacity-60"
                            >
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
                          className="w-full rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-cream-dim hover:bg-panel-2 disabled:opacity-60"
                        >
                          Download PDF
                        </button>
                      )}

                      <select
                        value={OUTCOME_OPTIONS.includes(quote.status) ? quote.status : ''}
                        onChange={(e) => handleStatusChange(quote, e.target.value)}
                        disabled={pendingId === quote.id}
                        className="w-full rounded-lg border border-line bg-panel-2 px-2 py-1.5 text-xs text-cream-dim focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60"
                      >
                        <option value="" disabled hidden>
                          Mark as…
                        </option>
                        {OUTCOME_OPTIONS.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt.charAt(0).toUpperCase() + opt.slice(1)}
                          </option>
                        ))}
                      </select>
                    </div>
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
