import { useEffect, useState } from 'react';
import { getClientUsage } from '../api/endpoints';
import { getErrorMessage } from '../api/client';
import ErrorMessage from './ErrorMessage';
import LoadingSpinner from './LoadingSpinner';

function formatZar(amount) {
  return `R${Number(amount || 0).toFixed(2)}`;
}

export default function UsageSection({ clientId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError('');
      try {
        const result = await getClientUsage(clientId);
        if (!cancelled) setData(result);
      } catch (err) {
        if (!cancelled) setError(getErrorMessage(err, 'Failed to load usage'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  return (
    <section className="rounded-xl border border-line bg-panel p-5 shadow-sm">
      <h2 className="mb-4 text-base font-semibold text-cream">Usage This Month</h2>

      {loading && <LoadingSpinner label="Loading usage…" />}
      {!loading && error && <ErrorMessage message={error} />}

      {!loading && !error && data && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <p className="text-xs font-medium text-cream-dim">Message Exchanges</p>
              <p className="text-xl font-semibold text-cream">{data.usage.message_count}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-cream-dim">Tokens (in / out)</p>
              <p className="text-xl font-semibold text-cream">
                {data.usage.input_tokens.toLocaleString()} / {data.usage.output_tokens.toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium text-cream-dim">Estimated Cost</p>
              <p className="text-xl font-semibold text-cream">
                {formatZar(data.usage.estimated_cost_zar)}{' '}
                <span className="text-xs text-cream-dim">(${data.usage.estimated_cost_usd.toFixed(2)})</span>
              </p>
            </div>
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between text-xs text-cream-dim">
              <span>
                {data.usage.message_count} / {data.monthly_interaction_cap || '∞'} interactions
              </span>
              <span>{data.usage_percentage.toFixed(0)}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-panel-2">
              <div
                className={`h-full rounded-full ${data.usage_warning ? 'bg-red-500' : 'bg-primary'}`}
                style={{ width: `${Math.min(data.usage_percentage, 100)}%` }}
              />
            </div>
            {data.usage_warning && (
              <p className="mt-2 text-xs font-medium text-red-400">
                ⚠ Over 80% of this client's monthly interaction cap — check margin before the bot keeps running.
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
