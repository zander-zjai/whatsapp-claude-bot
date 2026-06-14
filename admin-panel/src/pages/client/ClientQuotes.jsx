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
  lost: 'bg-gray-200 text-gray-700',
};

const OUTCOME_OPTIONS = ['pending', 'quoted', 'won', 'lost'];

export default function ClientQuotes() {
  const [quotes, setQuotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [pendingId, setPendingId] = useState(null);

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

  async function handleAction(quote, action) {
    setActionError('');
    setPendingId(quote.id);
    try {
      const updated = await updateClientQuote(quote.id, { action });
      setQuotes((prev) => prev.map((q) => (q.id === quote.id ? updated : q)));
    } catch (err) {
      setActionError(getErrorMessage(err, `Failed to ${action} quote`));
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

  return (
    <ClientLayout title="Quote Requests">
      <p className="mb-4 text-sm text-gray-500">{quotes.length} quote request(s)</p>

      {loading && <LoadingSpinner label="Loading quote requests…" />}
      {!loading && error && <ErrorMessage message={error} />}
      {!loading && !error && actionError && <ErrorMessage message={actionError} />}

      {!loading && !error && (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Date</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Name</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Contact</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Item</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Size</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Quantity</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Tier</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Total</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Status</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {quotes.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-10 text-center text-gray-500">
                    No quote requests yet.
                  </td>
                </tr>
              )}
              {quotes.map((quote) => (
                <tr key={quote.id} className="hover:bg-gray-50">
                  <td className="whitespace-nowrap px-4 py-3 text-gray-600">{formatDateTime(quote.created_at)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-gray-800">{quote.name}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-gray-800">{quote.contact_number}</td>
                  <td className="px-4 py-3 text-gray-800">{quote.item_description}</td>
                  <td className="px-4 py-3 text-gray-800">{quote.size}</td>
                  <td className="px-4 py-3 text-gray-800">{quote.quantity}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-gray-600">Tier {quote.tier || 1}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-gray-800">
                    {quote.tier === 2 ? `R${Number(quote.total || 0).toFixed(2)}` : '—'}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-medium ${
                        STATUS_STYLES[quote.status] || 'bg-gray-100 text-gray-700'
                      }`}
                    >
                      {quote.status}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <div className="flex flex-col gap-2">
                      {quote.tier === 2 && quote.status === 'pending' && (
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => handleAction(quote, 'approve')}
                            disabled={pendingId === quote.id}
                            className="rounded-lg border border-green-300 px-3 py-1.5 text-xs font-medium text-green-700 hover:bg-green-50 disabled:opacity-60"
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            onClick={() => handleAction(quote, 'reject')}
                            disabled={pendingId === quote.id}
                            className="rounded-lg border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-60"
                          >
                            Reject
                          </button>
                        </div>
                      )}

                      {quote.tier === 2 && (
                        <button
                          type="button"
                          onClick={() => handleDownloadPdf(quote)}
                          disabled={pendingId === quote.id}
                          className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                        >
                          Download PDF
                        </button>
                      )}

                      <select
                        value={OUTCOME_OPTIONS.includes(quote.status) ? quote.status : ''}
                        onChange={(e) => handleStatusChange(quote, e.target.value)}
                        disabled={pendingId === quote.id}
                        className="rounded-lg border border-gray-300 px-2 py-1.5 text-xs text-gray-700 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60"
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
