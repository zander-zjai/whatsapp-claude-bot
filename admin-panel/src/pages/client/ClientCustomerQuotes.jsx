import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import ClientLayout from '../../components/ClientLayout';
import LoadingSpinner from '../../components/LoadingSpinner';
import ErrorMessage from '../../components/ErrorMessage';
import { getCustomerQuoteHistory } from '../../api/clientPortalEndpoints';
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

export default function ClientCustomerQuotes() {
  const { identifier } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    getCustomerQuoteHistory(identifier)
      .then(setData)
      .catch((err) => setError(getErrorMessage(err, 'Failed to load customer history')))
      .finally(() => setLoading(false));
  }, [identifier]);

  const quotes = data?.quotes || [];
  const totalValue = quotes.reduce((s, q) => s + (Number(q.total) || 0), 0);
  const wonCount = quotes.filter((q) => ['won', 'accepted'].includes(q.status)).length;
  const pendingCount = quotes.filter((q) => ['pending', 'revised', 'sent'].includes(q.status)).length;

  return (
    <ClientLayout title="Customer Quote History">
      <div className="mb-4">
        <Link to="/client/quotes" className="text-sm font-medium text-primary hover:underline">
          ← Back to Quote Requests
        </Link>
      </div>

      {loading && <LoadingSpinner label="Loading customer history…" />}
      {!loading && error && <ErrorMessage message={error} />}

      {!loading && !error && data && (
        <>
          <div className="mb-4 rounded-xl border border-line bg-panel p-4 shadow-sm">
            <p className="text-base font-semibold text-cream">{data.customer_name || identifier}</p>
            <p className="font-mono text-xs text-cream-dim">{identifier}</p>
            <div className="mt-3 flex flex-wrap gap-4">
              <div>
                <p className="text-xs text-cream-dim">Total quotes</p>
                <p className="text-lg font-bold text-cream">{quotes.length}</p>
              </div>
              <div>
                <p className="text-xs text-cream-dim">Total value</p>
                <p className="text-lg font-bold text-cream">R{totalValue.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-xs text-cream-dim">Won / Accepted</p>
                <p className="text-lg font-bold text-green-400">{wonCount}</p>
              </div>
              <div>
                <p className="text-xs text-cream-dim">Pending</p>
                <p className="text-lg font-bold text-yellow-400">{pendingCount}</p>
              </div>
            </div>
          </div>

          {quotes.length === 0 ? (
            <p className="py-10 text-center text-cream-dim">No quotes found for this customer.</p>
          ) : (
            <div className="rounded-xl border border-line bg-panel shadow-sm">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line">
                    <th className="px-4 py-3 text-left text-xs font-medium text-cream-dim">Item</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-cream-dim">Date</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-cream-dim">Status</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-cream-dim">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {quotes.map((q) => (
                    <tr key={q.id} onClick={() => navigate(`/client/quotes/${q.id}`)}
                      className="cursor-pointer hover:bg-panel-2 transition-colors">
                      <td className="px-4 py-3 text-cream">{q.item_description}</td>
                      <td className="px-4 py-3 text-xs text-cream-dim">{formatDateTime(q.created_at)}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[q.status] || 'bg-panel-2 text-cream-dim'}`}>
                          {q.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-cream">
                        {q.total ? `R${Number(q.total).toFixed(2)}` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </ClientLayout>
  );
}
