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
        <div className="mx-auto max-w-xl rounded-xl border border-green-200 bg-green-50 p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-green-800">
            Client "{result.client.name}" added successfully!
          </h2>
          <p className="mt-2 text-sm text-green-700">
            Their webhook URL is:{' '}
            <code className="rounded bg-white px-2 py-1 font-mono text-xs text-gray-800">
              {result.webhook_url}
            </code>
          </p>

          <div className="mt-5 space-y-2 text-sm">
            <p className="font-medium text-gray-700">Setup checklist</p>
            <ul className="space-y-1 text-gray-700">
              <li>✅ Client added to system</li>
              <li>✅ Webhook URL generated</li>
              <li>⬜ Connect webhook in Meta Developer Portal</li>
              <li>⬜ Test with a WhatsApp message</li>
            </ul>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              to="/clients"
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700"
            >
              Go to Clients
            </Link>
            <button
              type="button"
              onClick={() => setResult(null)}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
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
