import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Layout from '../components/Layout';
import ClientForm from '../components/ClientForm';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorMessage from '../components/ErrorMessage';
import { getClient, updateClient } from '../api/endpoints';
import { getErrorMessage } from '../api/client';

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
        <div className="mx-auto max-w-3xl">
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
