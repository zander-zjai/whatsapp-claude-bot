import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Layout from '../components/Layout';
import ClientForm from '../components/ClientForm';
import UsageSection from '../components/UsageSection';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorMessage from '../components/ErrorMessage';
import { getClient, updateClient } from '../api/endpoints';
import { getErrorMessage } from '../api/client';

const CHECKLIST_ITEMS = [
  { key: 'whatsapp_configured', label: 'WhatsApp number configured' },
  { key: 'system_prompt_set', label: 'Zara system prompt set' },
  { key: 'business_hours_set', label: 'Business hours set' },
  { key: 'owner_notifications_on', label: 'Owner WhatsApp notifications on' },
  { key: 'first_payment_received', label: 'First payment received' },
];

function SetupChecklist({ client, onChange }) {
  const [error, setError] = useState('');
  const [savingKey, setSavingKey] = useState(null);
  const checklist = client.onboarding_checklist || {};

  async function toggle(key) {
    setError('');
    const previous = checklist;
    const updated = { ...checklist, [key]: !checklist[key] };
    setSavingKey(key);
    onChange(updated);
    try {
      await updateClient(client.id, { onboarding_checklist: updated });
    } catch (err) {
      onChange(previous);
      setError(getErrorMessage(err, 'Failed to save checklist'));
    } finally {
      setSavingKey(null);
    }
  }

  return (
    <section className="rounded-xl border border-line bg-panel p-5 shadow-sm">
      <h2 className="mb-4 text-base font-semibold text-cream">Setup Checklist</h2>
      <ErrorMessage message={error} />
      <ul className="space-y-2">
        {CHECKLIST_ITEMS.map((item) => {
          const done = Boolean(checklist[item.key]);
          return (
            <li key={item.key} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={done}
                disabled={savingKey === item.key}
                onChange={() => toggle(item.key)}
                className="h-4 w-4 rounded border-line"
              />
              <span className={done ? 'text-cream-dim' : 'text-cream-dim'}>{item.label}</span>
            </li>
          );
        })}
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
          <SetupChecklist
            client={client}
            onChange={(onboarding_checklist) =>
              setClient((prev) => ({ ...prev, onboarding_checklist }))
            }
          />
          <UsageSection clientId={client.id} />
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
