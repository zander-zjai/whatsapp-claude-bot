import { useState } from 'react';
import { Link } from 'react-router-dom';
import Layout from '../components/Layout';
import ClientForm from '../components/ClientForm';
import { addClient } from '../api/endpoints';
import { getErrorMessage } from '../api/client';

export default function AddClient() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null); // { client, webhook_url }

  async function handleSubmit(data) {
    setLoading(true);
    setError('');
    try {
      const res = await addClient(data);
      setResult(res);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to add client'));
    } finally {
      setLoading(false);
    }
  }

  if (result) {
    return (
      <Layout title="Add New Client">
        <div className="mx-auto max-w-xl rounded-xl border border-green-500/30 bg-green-500/10 p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-green-400">
            Client "{result.client.name}" added successfully!
          </h2>
          <p className="mt-2 text-sm text-green-400">
            Their webhook URL is:{' '}
            <code className="rounded bg-panel px-2 py-1 font-mono text-xs text-cream">
              {result.webhook_url}
            </code>
          </p>

          <div className="mt-5 space-y-2 text-sm">
            <p className="font-medium text-cream-dim">Setup checklist</p>
            <ul className="space-y-1 text-cream-dim">
              <li>✅ Client added to system</li>
              <li>✅ Webhook URL generated</li>
              <li>⬜ Connect webhook in Meta Developer Portal</li>
              <li>⬜ Test with a WhatsApp message</li>
            </ul>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              to="/clients"
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-ink hover:bg-primary-700"
            >
              Go to Clients
            </Link>
            <button
              type="button"
              onClick={() => setResult(null)}
              className="rounded-lg border border-line bg-panel px-4 py-2 text-sm font-semibold text-cream-dim hover:bg-panel-2"
            >
              Add another client
            </button>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Add New Client">
      <div className="mx-auto max-w-3xl">
        <ClientForm onSubmit={handleSubmit} submitLabel="Add Client" loading={loading} error={error} />
      </div>
    </Layout>
  );
}
