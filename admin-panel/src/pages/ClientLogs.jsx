import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import Layout from '../components/Layout';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorMessage from '../components/ErrorMessage';
import { getClient, getClientLogs } from '../api/endpoints';
import { getErrorMessage } from '../api/client';
import { maskPhoneNumber, truncate, formatDateTime } from '../utils/format';

export default function ClientLogs() {
  const { id } = useParams();

  const [client, setClient] = useState(null);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Load client name once.
  useEffect(() => {
    getClient(id)
      .then(setClient)
      .catch((err) => setError(getErrorMessage(err, 'Failed to load client')));
  }, [id]);

  // Reload logs whenever filters change (debounced for the search box).
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      setLoading(true);
      setError('');
      getClientLogs(id, { search: search || undefined, date_from: dateFrom || undefined, date_to: dateTo || undefined })
        .then((data) => {
          if (!cancelled) setLogs(data);
        })
        .catch((err) => {
          if (!cancelled) setError(getErrorMessage(err, 'Failed to load logs'));
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [id, search, dateFrom, dateTo]);

  return (
    <Layout title={client ? `Logs — ${client.name}` : 'Client Logs'}>
      <div className="mb-4">
        <Link to="/clients" className="text-sm font-medium text-primary hover:underline">
          ← Back to Clients
        </Link>
      </div>

      <div className="mb-4 flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:flex-row sm:items-end">
        <div className="flex-1">
          <label className="mb-1 block text-sm font-medium text-gray-700">Search</label>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Phone number or keyword…"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">From</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">To</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        {(search || dateFrom || dateTo) && (
          <button
            type="button"
            onClick={() => {
              setSearch('');
              setDateFrom('');
              setDateTo('');
            }}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Clear filters
          </button>
        )}
      </div>

      {loading && <LoadingSpinner label="Loading logs…" />}
      {!loading && error && <ErrorMessage message={error} />}

      {!loading && !error && (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Timestamp</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Customer</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Message</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Reply</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Response Time</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {logs.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-gray-500">
                    No messages found.
                  </td>
                </tr>
              )}
              {logs.map((logEntry) => (
                <tr key={logEntry.id} className="hover:bg-gray-50">
                  <td className="whitespace-nowrap px-4 py-3 text-gray-600">{formatDateTime(logEntry.timestamp)}</td>
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-gray-600">
                    {maskPhoneNumber(logEntry.customer_number)}
                  </td>
                  <td className="px-4 py-3 text-gray-800" title={logEntry.customer_message}>
                    {truncate(logEntry.customer_message, 50)}
                  </td>
                  <td className="px-4 py-3 text-gray-800" title={logEntry.bot_reply}>
                    {truncate(logEntry.bot_reply, 50)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-gray-600">{logEntry.response_time_ms} ms</td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-medium ${
                        logEntry.status === 'success'
                          ? 'bg-green-100 text-green-700'
                          : logEntry.status === 'handover'
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-red-100 text-red-700'
                      }`}
                    >
                      {logEntry.status}
                    </span>
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
