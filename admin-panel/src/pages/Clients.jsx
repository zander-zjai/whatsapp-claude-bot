import { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import ClientTable from '../components/ClientTable';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorMessage from '../components/ErrorMessage';
import ConfirmDialog from '../components/ConfirmDialog';
import { getClients, updateClient, deleteClient } from '../api/endpoints';
import { getErrorMessage } from '../api/client';
import { Link } from 'react-router-dom';

export default function Clients() {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pendingDelete, setPendingDelete] = useState(null);
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

  async function handleToggleActive(client) {
    setActionError('');
    // Optimistic update
    setClients((prev) => prev.map((c) => (c.id === client.id ? { ...c, active: !c.active } : c)));
    try {
      await updateClient(client.id, { active: !client.active });
    } catch (err) {
      setActionError(getErrorMessage(err, 'Failed to update client status'));
      // Revert on failure
      setClients((prev) => prev.map((c) => (c.id === client.id ? { ...c, active: client.active } : c)));
    }
  }

  async function handleDelete() {
    if (!pendingDelete) return;
    setActionError('');
    try {
      await deleteClient(pendingDelete.id);
      setClients((prev) => prev.filter((c) => c.id !== pendingDelete.id));
    } catch (err) {
      setActionError(getErrorMessage(err, 'Failed to delete client'));
    } finally {
      setPendingDelete(null);
    }
  }

  return (
    <Layout title="Clients">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-cream-dim">{clients.length} client(s)</p>
        <Link
          to="/clients/new"
          className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-ink hover:bg-primary-700"
        >
          + Add New Client
        </Link>
      </div>

      {actionError && (
        <div className="mb-4">
          <ErrorMessage message={actionError} />
        </div>
      )}

      {loading && <LoadingSpinner label="Loading clients…" />}
      {!loading && error && <ErrorMessage message={error} />}

      {!loading && !error && (
        <ClientTable clients={clients} onToggleActive={handleToggleActive} onDelete={setPendingDelete} />
      )}

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Delete client?"
        message={
          pendingDelete
            ? `This will permanently remove "${pendingDelete.name}" and their conversation history. This cannot be undone.`
            : ''
        }
        confirmLabel="Delete"
        danger
        onConfirm={handleDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </Layout>
  );
}
