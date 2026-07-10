import { useEffect, useState } from 'react';
import ClientLayout from '../../components/ClientLayout';
import LoadingSpinner from '../../components/LoadingSpinner';
import ErrorMessage from '../../components/ErrorMessage';
import { getClientMockups, updateClientMockup, getClientMockupImageUrl } from '../../api/clientPortalEndpoints';
import { clientPortalApi } from '../../api/clientPortalClient';
import { getErrorMessage } from '../../api/client';
import { maskPhoneNumber } from '../../utils/format';

function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function StatusBadge({ status }) {
  const cls =
    status === 'approved' ? 'bg-green-500/20 text-green-400' :
    status === 'declined' ? 'bg-red-500/20 text-red-400' :
    'bg-primary/20 text-primary';
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${cls}`}>{status}</span>
  );
}

function MockupCard({ mockup, onApprove, onDecline, approving, declining }) {
  const [imgUrl, setImgUrl] = useState(null);
  const isDone = mockup.status !== 'pending';

  useEffect(() => {
    if (!mockup.image_path) return;
    // Fetch the image as a blob (requires auth header)
    clientPortalApi.get(`/client/mockups/${mockup.id}/image`, { responseType: 'blob' })
      .then((r) => {
        const url = URL.createObjectURL(r.data);
        setImgUrl(url);
      })
      .catch(() => {});
    return () => {
      if (imgUrl) URL.revokeObjectURL(imgUrl);
    };
  }, [mockup.id, mockup.image_path]);

  return (
    <div className={`rounded-xl border border-line bg-panel shadow-sm overflow-hidden ${isDone ? 'opacity-70' : ''}`}>
      {imgUrl && (
        <img src={imgUrl} alt="Mockup" className="w-full object-cover max-h-64" />
      )}
      {!imgUrl && mockup.image_path && (
        <div className="h-32 flex items-center justify-center bg-panel-2 text-cream-dim text-sm">
          Loading image…
        </div>
      )}
      {!mockup.image_path && (
        <div className="h-20 flex items-center justify-center bg-panel-2 text-cream-dim text-sm">
          No image generated
        </div>
      )}
      <div className="p-4">
        <div className="flex items-center justify-between mb-1">
          <span className="font-medium text-cream text-sm">{mockup.customer_name || maskPhoneNumber(mockup.customer_number)}</span>
          <StatusBadge status={mockup.status} />
        </div>
        <p className="text-xs text-cream-dim mb-1">{maskPhoneNumber(mockup.customer_number)} · {formatDate(mockup.created_at)}</p>
        <p className="text-sm text-cream mt-2 line-clamp-3">{mockup.description}</p>
        {!isDone && (
          <div className="flex gap-2 mt-4">
            <button
              type="button"
              onClick={() => onApprove(mockup.id)}
              disabled={approving}
              className="flex-1 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-ink hover:bg-primary/90 disabled:opacity-50"
            >
              {approving ? 'Sending…' : 'Approve & Send'}
            </button>
            <button
              type="button"
              onClick={() => onDecline(mockup.id)}
              disabled={declining}
              className="flex-1 rounded-lg border border-line px-3 py-2 text-sm font-medium text-cream-dim hover:bg-panel-2 disabled:opacity-50"
            >
              Decline
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ClientMockups() {
  const [mockups, setMockups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pendingId, setPendingId] = useState(null);
  const [pendingAction, setPendingAction] = useState(null);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const data = await getClientMockups();
      setMockups(data);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load mockups'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleAction(id, action) {
    setPendingId(id);
    setPendingAction(action);
    try {
      const updated = await updateClientMockup(id, { action });
      setMockups((prev) => prev.map((m) => (m.id === id ? updated : m)));
    } catch (err) {
      setError(getErrorMessage(err, `Failed to ${action} mockup`));
    } finally {
      setPendingId(null);
      setPendingAction(null);
    }
  }

  return (
    <ClientLayout title="Mockups">
      {loading && <LoadingSpinner label="Loading mockups…" />}
      {!loading && error && <ErrorMessage message={error} />}
      {!loading && !error && mockups.length === 0 && (
        <p className="text-cream-dim text-sm">No mockup requests yet.</p>
      )}
      {!loading && !error && mockups.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {mockups.map((m) => (
            <MockupCard
              key={m.id}
              mockup={m}
              onApprove={(id) => handleAction(id, 'approve')}
              onDecline={(id) => handleAction(id, 'decline')}
              approving={pendingId === m.id && pendingAction === 'approve'}
              declining={pendingId === m.id && pendingAction === 'decline'}
            />
          ))}
        </div>
      )}
    </ClientLayout>
  );
}