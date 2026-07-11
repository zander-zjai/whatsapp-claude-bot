import { useEffect, useState } from 'react';
import ClientLayout from '../../components/ClientLayout';
import LoadingSpinner from '../../components/LoadingSpinner';
import ErrorMessage from '../../components/ErrorMessage';
import {
  getClientMockups,
  getClientMockupPresets,
  updateClientMockup,
  reviseClientMockup,
  getClientMockupVersionImageBlob,
} from '../../api/clientPortalEndpoints';
import { clientPortalApi } from '../../api/clientPortalClient';
import { getErrorMessage } from '../../api/client';
import { maskPhoneNumber } from '../../utils/format';

function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-ZA', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function StatusBadge({ status }) {
  const cls =
    status === 'approved' ? 'bg-green-500/20 text-green-400' :
    status === 'declined' ? 'bg-red-500/20 text-red-400' :
    'bg-primary/20 text-primary';
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${cls}`}>
      {status}
    </span>
  );
}

function RevisionBadge({ count }) {
  if (!count) return null;
  return (
    <span className="rounded-full bg-panel-2 border border-line px-2 py-0.5 text-xs text-cream-dim">
      {count} revision{count !== 1 ? 's' : ''}
    </span>
  );
}

function MockupImage({ mockupId, imagePath, version = null }) {
  const [src, setSrc] = useState(null);

  useEffect(() => {
    if (!imagePath) return;
    let url;
    const fetcher = version !== null
      ? getClientMockupVersionImageBlob(mockupId, version)
      : clientPortalApi.get(`/client/mockups/${mockupId}/image`, { responseType: 'blob' }).then((r) => r.data);

    fetcher
      .then((blob) => {
        url = URL.createObjectURL(blob);
        setSrc(url);
      })
      .catch(() => {});
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [mockupId, imagePath, version]);

  if (!imagePath) {
    return (
      <div className="h-20 flex items-center justify-center bg-panel-2 text-cream-dim text-sm">
        No image generated
      </div>
    );
  }
  if (!src) {
    return (
      <div className="h-32 flex items-center justify-center bg-panel-2 text-cream-dim text-sm">
        Loading…
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={version ? `Version ${version}` : 'Mockup'}
      className="w-full object-cover max-h-64 cursor-pointer"
      onClick={() => window.open(src, '_blank')}
    />
  );
}

function RevisionHistory({ mockup }) {
  const versions = mockup.versions || [];
  if (versions.length <= 1) return null;
  const history = versions.slice(0, -1).reverse();
  return (
    <div className="mt-4 border-t border-line pt-3 px-4 pb-4">
      <p className="text-xs font-medium text-cream-dim mb-2 uppercase tracking-wide">Version history</p>
      <div className="space-y-3">
        {history.map((ver) => (
          <div key={ver.version} className="rounded-lg border border-line overflow-hidden">
            <MockupImage mockupId={mockup.id} imagePath={ver.image_path} version={ver.version} />
            <div className="px-3 py-2 bg-panel-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-cream-dim">v{ver.version}</span>
                <span className="text-xs text-cream-dim">{formatDate(ver.created_at)}</span>
              </div>
              {ver.revision_instructions && (
                <p className="text-xs text-cream mt-1 italic">"{ver.revision_instructions}"</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MockupCard({ mockup, presets, contexts, onApprove, onDecline, onRevise, approving, declining, revising }) {
  const [mode, setMode] = useState(null); // null | 'preset' | 'freetext'
  const [selectedPreset, setSelectedPreset] = useState(null);
  const [selectedContext, setSelectedContext] = useState('isolated');
  const [freeText, setFreeText] = useState('');
  const isDone = mockup.status !== 'pending';

  function handlePresetGenerate() {
    if (!selectedPreset) return;
    onRevise(mockup.id, { preset: selectedPreset, context: selectedContext });
    setMode(null);
  }

  function handleFreeTextGenerate() {
    if (!freeText.trim()) return;
    onRevise(mockup.id, { instructions: freeText.trim() });
    setFreeText('');
    setMode(null);
  }

  return (
    <div className={`rounded-xl border border-line bg-panel shadow-sm overflow-hidden ${isDone ? 'opacity-70' : ''}`}>
      <MockupImage mockupId={mockup.id} imagePath={mockup.image_path} />

      <div className="p-4">
        <div className="flex items-center justify-between mb-1 gap-2 flex-wrap">
          <span className="font-medium text-cream text-sm">
            {mockup.customer_name || maskPhoneNumber(mockup.customer_number)}
          </span>
          <div className="flex items-center gap-1.5 flex-wrap">
            <RevisionBadge count={mockup.revision_count} />
            <StatusBadge status={mockup.status} />
          </div>
        </div>
        <p className="text-xs text-cream-dim mb-1">
          {maskPhoneNumber(mockup.customer_number)} · {formatDate(mockup.created_at)}
        </p>
        <p className="text-sm text-cream mt-2 line-clamp-3">{mockup.description}</p>

        {!isDone && (
          <>
            {/* Primary actions */}
            <div className="flex gap-2 mt-4 flex-wrap">
              <button
                type="button"
                onClick={() => onApprove(mockup.id)}
                disabled={approving || revising}
                className="flex-1 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-ink hover:bg-primary/90 disabled:opacity-50"
              >
                {approving ? 'Sending…' : 'Approve & Send'}
              </button>
              <button
                type="button"
                onClick={() => setMode(mode === 'preset' ? null : 'preset')}
                disabled={revising || approving}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium disabled:opacity-50 transition-colors ${
                  mode === 'preset'
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-primary/50 text-primary hover:bg-primary/10'
                }`}
              >
                Restyle
              </button>
              <button
                type="button"
                onClick={() => onDecline(mockup.id)}
                disabled={declining || revising}
                className="w-full rounded-lg border border-line px-3 py-2 text-sm font-medium text-cream-dim hover:bg-panel-2 disabled:opacity-50"
              >
                Decline
              </button>
            </div>

            {/* Restyle panel */}
            {mode === 'preset' && (
              <div className="mt-4 rounded-lg border border-line bg-panel-2 p-3 space-y-3">
                {/* Sign type */}
                <div>
                  <p className="text-xs font-medium text-cream-dim mb-1.5 uppercase tracking-wide">Sign type</p>
                  <div className="flex flex-wrap gap-1.5">
                    {(presets || []).map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setSelectedPreset(p.id === selectedPreset ? null : p.id)}
                        className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
                          selectedPreset === p.id
                            ? 'bg-primary text-ink border-primary'
                            : 'border-line text-cream-dim hover:border-primary/50 hover:text-primary'
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Context */}
                <div>
                  <p className="text-xs font-medium text-cream-dim mb-1.5 uppercase tracking-wide">Setting</p>
                  <div className="flex gap-1.5">
                    {(contexts || []).map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setSelectedContext(c.id)}
                        className={`flex-1 rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
                          selectedContext === c.id
                            ? 'bg-primary text-ink border-primary'
                            : 'border-line text-cream-dim hover:border-primary/50 hover:text-primary'
                        }`}
                      >
                        {c.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handlePresetGenerate}
                    disabled={!selectedPreset || revising}
                    className="flex-1 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-ink hover:bg-primary/90 disabled:opacity-50"
                  >
                    {revising ? 'Generating…' : 'Generate'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode(null)}
                    className="rounded-lg border border-line px-3 py-2 text-sm text-cream-dim hover:bg-panel"
                  >
                    Cancel
                  </button>
                </div>

                {/* Divider to free-text */}
                <div className="border-t border-line pt-3">
                  <button
                    type="button"
                    onClick={() => setMode(mode === 'freetext' ? 'preset' : 'freetext')}
                    className="text-xs text-cream-dim hover:text-primary"
                  >
                    {mode === 'freetext' ? '▲ Hide custom instructions' : '+ Add custom instructions'}
                  </button>
                  {mode === 'freetext' && (
                    <div className="mt-2 space-y-2">
                      <textarea
                        rows={2}
                        value={freeText}
                        onChange={(e) => setFreeText(e.target.value)}
                        placeholder="e.g. make the letters bigger, add our logo on the left…"
                        className="w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm text-cream placeholder-cream-dim resize-none focus:outline-none focus:border-primary"
                      />
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <RevisionHistory mockup={mockup} />
    </div>
  );
}

export default function ClientMockups() {
  const [mockups, setMockups] = useState([]);
  const [presets, setPresets] = useState([]);
  const [contexts, setContexts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pending, setPending] = useState({});

  useEffect(() => {
    Promise.all([getClientMockups(), getClientMockupPresets()])
      .then(([mockupData, presetData]) => {
        setMockups(mockupData);
        setPresets(presetData.presets || []);
        setContexts(presetData.contexts || []);
      })
      .catch((err) => setError(getErrorMessage(err, 'Failed to load')))
      .finally(() => setLoading(false));
  }, []);

  async function handleAction(id, action) {
    setPending((p) => ({ ...p, [id]: action }));
    try {
      const updated = await updateClientMockup(id, { action });
      setMockups((prev) => prev.map((m) => (m.id === id ? updated : m)));
    } catch (err) {
      setError(getErrorMessage(err, `Failed to ${action} mockup`));
    } finally {
      setPending((p) => { const n = { ...p }; delete n[id]; return n; });
    }
  }

  async function handleRevise(id, data) {
    setPending((p) => ({ ...p, [id]: 'revise' }));
    setError('');
    try {
      const updated = await reviseClientMockup(id, data);
      setMockups((prev) => prev.map((m) => (m.id === id ? updated : m)));
    } catch (err) {
      setError(getErrorMessage(err, 'Generation failed — please try again'));
    } finally {
      setPending((p) => { const n = { ...p }; delete n[id]; return n; });
    }
  }

  const pendingMockups = mockups.filter((m) => m.status === 'pending');
  const doneMockups = mockups.filter((m) => m.status !== 'pending');

  return (
    <ClientLayout title="Mockups">
      {loading && <LoadingSpinner label="Loading mockups…" />}
      {!loading && error && <ErrorMessage message={error} />}
      {!loading && !error && mockups.length === 0 && (
        <p className="text-cream-dim text-sm">
          No mockup requests yet. Mockups are auto-generated when a quote comes in.
        </p>
      )}

      {!loading && pendingMockups.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm font-semibold text-cream-dim uppercase tracking-wide mb-3">
            Awaiting Review ({pendingMockups.length})
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {pendingMockups.map((m) => (
              <MockupCard
                key={m.id}
                mockup={m}
                presets={presets}
                contexts={contexts}
                onApprove={(id) => handleAction(id, 'approve')}
                onDecline={(id) => handleAction(id, 'decline')}
                onRevise={handleRevise}
                approving={pending[m.id] === 'approve'}
                declining={pending[m.id] === 'decline'}
                revising={pending[m.id] === 'revise'}
              />
            ))}
          </div>
        </div>
      )}

      {!loading && doneMockups.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-cream-dim uppercase tracking-wide mb-3">
            Completed
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {doneMockups.map((m) => (
              <MockupCard
                key={m.id}
                mockup={m}
                presets={presets}
                contexts={contexts}
                onApprove={(id) => handleAction(id, 'approve')}
                onDecline={(id) => handleAction(id, 'decline')}
                onRevise={handleRevise}
                approving={pending[m.id] === 'approve'}
                declining={pending[m.id] === 'decline'}
                revising={pending[m.id] === 'revise'}
              />
            ))}
          </div>
        </div>
      )}
    </ClientLayout>
  );
}
