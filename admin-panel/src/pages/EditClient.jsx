import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Layout from '../components/Layout';
import ClientForm from '../components/ClientForm';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorMessage from '../components/ErrorMessage';
import { getClient, updateClient } from '../api/endpoints';
import { getErrorMessage } from '../api/client';

function SetupChecklist({ client }) {
  const items = [
    {
      label: 'WhatsApp number configured',
      done: Boolean(client.phone_number_id && client.whatsapp_token),
    },
    {
      label: 'Zara system prompt set',
      done: Boolean(client.system_prompt && client.system_prompt.trim()),
    },
    {
      label: 'Business hours set',
      done: Boolean(client.business_hours?.enabled),
    },
    {
      label: 'Owner WhatsApp notifications on',
      done: Boolean(client.owner_phone),
    },
    {
      label: 'First payment received',
      done: client.payment_status === 'paid',
    },
  ];

  return (
    <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="mb-4 text-base font-semibold text-gray-900">Setup Checklist</h2>
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item.label} className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={item.done} disabled className="h-4 w-4 rounded border-gray-300" />
            <span className={item.done ? 'text-gray-700' : 'text-gray-500'}>{item.label}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function EditClient() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [client, setClient] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setLoadError('');
      try {
        const data = await getClient(id);
        if (!cancelled) setClient(data);
      } catch (err) {
        if (!cancelled) setLoadError(getErrorMessage(err, 'Failed to load client'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function handleSubmit(data) {
    setSaving(true);
    setSaveError('');
    try {
      await updateClient(id, data);
      navigate('/clients');
    } catch (err) {
      setSaveError(getErrorMessage(err, 'Failed to save client'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Layout title="Edit Client">
      {loading && <LoadingSpinner label="Loading client…" />}
      {!loading && loadError && <ErrorMessage message={loadError} />}

      {!loading && !loadError && client && (
        <div className="mx-auto max-w-3xl space-y-6">
          <SetupChecklist client={client} />
          <ClientForm
            initialValues={client}
            onSubmit={handleSubmit}
            submitLabel="Save Changes"
            loading={saving}
            error={saveError}
            updatedAt={client.updated_at}
          />
        </div>
      )}
    </Layout>
  );
}
