import { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorMessage from '../components/ErrorMessage';
import { getQuotes, getClients, getQuotePdfBlob } from '../api/endpoints';
import { getErrorMessage } from '../api/client';
import { maskPhoneNumber, formatDateTime } from '../utils/format';

const STATUS_STYLES = {
  pending: 'bg-yellow-100 text-yellow-700',
  approved: 'bg-blue-100 text-blue-700',
  sent: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
  needs_pricing: 'bg-orange-100 text-orange-700',
};

export default function QuoteRequests() {
  const [quotes, setQuotes] = useState([]);
  const [clientNames, setClientNames] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [downloadError, setDownloadError] = useState('');
  const [downloadingId, setDownloadingId] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError('');
      try {
        const [quotesData, clients] = await Promise.all([getQuotes(), getClients()]);
        if (cancelled) return;
        setQuotes(quotesData);
        setClientNames(Object.fromEntries(clients.map((c) => [c.id, c.name])));
      } catch (err) {
        if (!cancelled) setError(getErrorMessage(err, 'Failed to load quote requests'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleDownloadPdf(quote) {
    setDownloadError('');
    setDownloadingId(quote.id);
    try {
      const blob = await getQuotePdfBlob(quote.id);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `quote-${quote.id.slice(0, 8)}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setDownloadError(getErrorMessage(err, 'Failed to download PDF'));
    } finally {
      setDownloadingId(null);
    }
  }

  return (
    <Layout title="Quote Requests">
      <p className="mb-4 text-sm text-cream-dim">{quotes.length} quote request(s)</p>

      {loading && <LoadingSpinner label="Loading quote requests…" />}
      {!loading && error && <ErrorMessage message={error} />}
      {!loading && !error && downloadError && <ErrorMessage message={downloadError} />}

      {!loading && !error && (
        <div className="overflow-x-auto rounded-xl border border-line bg-panel shadow-sm">
          <table className="min-w-full divide-y divide-line text-sm">
            <thead className="bg-panel-2">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-cream-dim">Date</th>
                <th className="px-4 py-3 text-left font-semibold text-cream-dim">Client</th>
                <th className="px-4 py-3 text-left font-semibold text-cream-dim">Name</th>
                <th className="px-4 py-3 text-left font-semibold text-cream-dim">Contact</th>
                <th className="px-4 py-3 text-left font-semibold text-cream-dim">Item</th>
                <th className="px-4 py-3 text-left font-semibold text-cream-dim">Size</th>
                <th className="px-4 py-3 text-left font-semibold text-cream-dim">Quantity</th>
                <th className="px-4 py-3 text-left font-semibold text-cream-dim">Tier</th>
                <th className="px-4 py-3 text-left font-semibold text-cream-dim">Total</th>
                <th className="px-4 py-3 text-left font-semibold text-cream-dim">Status</th>
                <th className="px-4 py-3 text-left font-semibold text-cream-dim">WhatsApp</th>
                <th className="px-4 py-3 text-left font-semibold text-cream-dim">PDF</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {quotes.length === 0 && (
                <tr>
                  <td colSpan={12} className="px-4 py-10 text-center text-cream-dim">
                    No quote requests yet.
                  </td>
                </tr>
              )}
              {quotes.map((quote) => (
                <tr key={quote.id} className="hover:bg-panel-2">
                  <td className="whitespace-nowrap px-4 py-3 text-cream-dim">{formatDateTime(quote.created_at)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-cream">
                    {clientNames[quote.client_id] || quote.client_id}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-cream">{quote.name}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-cream">{quote.contact_number}</td>
                  <td className="px-4 py-3 text-cream">{quote.item_description}</td>
                  <td className="px-4 py-3 text-cream">{quote.size}</td>
                  <td className="px-4 py-3 text-cream">{quote.quantity}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-cream-dim">Tier {quote.tier || 1}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-cream">
                    {quote.tier === 2 ? `R${Number(quote.total || 0).toFixed(2)}` : '—'}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    {quote.tier === 2 ? (
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-medium ${
                          STATUS_STYLES[quote.status] || 'bg-panel-2 text-cream-dim'
                        }`}
                      >
                        {quote.status}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-cream-dim">
                    {maskPhoneNumber(quote.customer_number)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    {quote.tier === 2 && quote.status !== 'needs_pricing' ? (
                      <button
                        type="button"
                        onClick={() => handleDownloadPdf(quote)}
                        disabled={downloadingId === quote.id}
                        className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-cream-dim hover:bg-panel-2 disabled:opacity-60"
                      >
                        {downloadingId === quote.id ? 'Downloading…' : 'Download'}
                      </button>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Layout>
  );
}
