import { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorMessage from '../components/ErrorMessage';
import { getClients, updateClient } from '../api/endpoints';
import { getErrorMessage } from '../api/client';
import { formatDate } from '../utils/format';

export default function Billing() {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const data = await getClients();
      setClients(data);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load clients'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleTogglePaymentStatus(client) {
    setActionError('');
    const newStatus = client.payment_status === 'paid' ? 'unpaid' : 'paid';
    setClients((prev) => prev.map((c) => (c.id === client.id ? { ...c, payment_status: newStatus } : c)));
    try {
      await updateClient(client.id, { payment_status: newStatus });
    } catch (err) {
      setActionError(getErrorMessage(err, 'Failed to update payment status'));
      setClients((prev) => prev.map((c) => (c.id === client.id ? { ...c, payment_status: client.payment_status } : c)));
    }
  }

  const totalMonthly = clients.reduce((sum, c) => sum + (Number(c.monthly_fee) || 0), 0);

  return (
    <Layout title="Billing">
      <div className="mb-4">
        <p className="text-sm text-gray-500">
          {clients.length} client(s) · Total monthly revenue: R{totalMonthly.toFixed(2)}
        </p>
      </div>

      {actionError && (
        <div className="mb-4">
          <ErrorMessage message={actionError} />
        </div>
      )}

      {loading && <LoadingSpinner label="Loading billing info…" />}
      {!loading && error && <ErrorMessage message={error} />}

      {!loading && !error && (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Client</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Monthly Fee</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Payment Status</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Invoice Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {clients.map((client) => (
                <tr key={client.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{client.name}</td>
                  <td className="px-4 py-3 text-gray-600">R{(Number(client.monthly_fee) || 0).toFixed(2)}</td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => handleTogglePaymentStatus(client)}
                      className="switch"
                      data-on={client.payment_status === 'paid'}
                      title={client.payment_status === 'paid' ? 'Paid — click to mark unpaid' : 'Unpaid — click to mark paid'}
                    >
                      <span />
                    </button>
                    <span className="ml-2 align-middle text-xs text-gray-600">
                      {client.payment_status === 'paid' ? 'Paid' : 'Unpaid'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{client.invoice_date ? formatDate(client.invoice_date) : '—'}</td>
                </tr>
              ))}
              {clients.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                    No clients yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </Layout>
  );
}
