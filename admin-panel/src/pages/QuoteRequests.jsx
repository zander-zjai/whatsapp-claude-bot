import { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorMessage from '../components/ErrorMessage';
import { getQuotes, getClients } from '../api/endpoints';
import { getErrorMessage } from '../api/client';
import { maskPhoneNumber, formatDateTime } from '../utils/format';

export default function QuoteRequests() {
  const [quotes, setQuotes] = useState([]);
  const [clientNames, setClientNames] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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

  return (
    <Layout title="Quote Requests">
      <p className="mb-4 text-sm text-gray-500">{quotes.length} quote request(s)</p>

      {loading && <LoadingSpinner label="Loading quote requests…" />}
      {!loading && error && <ErrorMessage message={error} />}

      {!loading && !error && (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Date</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Client</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Name</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Contact</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Item</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Size</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Quantity</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">WhatsApp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {quotes.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-gray-500">
                    No quote requests yet.
                  </td>
                </tr>
              )}
              {quotes.map((quote) => (
                <tr key={quote.id} className="hover:bg-gray-50">
                  <td className="whitespace-nowrap px-4 py-3 text-gray-600">{formatDateTime(quote.created_at)}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-gray-800">
                    {clientNames[quote.client_id] || quote.client_id}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-gray-800">{quote.name}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-gray-800">{quote.contact_number}</td>
                  <td className="px-4 py-3 text-gray-800">{quote.item_description}</td>
                  <td className="px-4 py-3 text-gray-800">{quote.size}</td>
                  <td className="px-4 py-3 text-gray-800">{quote.quantity}</td>
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-gray-600">
                    {maskPhoneNumber(quote.customer_number)}
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
