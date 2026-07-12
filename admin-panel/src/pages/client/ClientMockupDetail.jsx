import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import ClientLayout from '../../components/ClientLayout';
import LoadingSpinner from '../../components/LoadingSpinner';
import ErrorMessage from '../../components/ErrorMessage';
import ConfirmDialog from '../../components/ConfirmDialog';
import Toast, { useToast } from '../../components/Toast';
import {
  getClientMockup,
  getClientMockupPresets,
  getClientMockupVersionImageBlob,
  getClientAttachmentBlob,
  updateClientMockup,
  reviseClientMockup,
} from '../../api/clientPortalEndpoints';
import { clientPortalApi } from '../../api/clientPortalClient';
import { getErrorMessage } from '../../api/client';
import { maskPhoneNumber } from '../../utils/format';

function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-ZA', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function StatusBadge({ status }) {
  const cls =
    status === 'approved' ? 'bg-green-500/20 text-green-400' :
    status === 'declined' ? 'bg-red-500/20 text-red-400' :
    'bg-primary/20 text-primary';
  const label = status === 'approved' ? 'Sent to customer' : status === 'declined' ? 'Declined' : 'Awaiting review';
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}>{label}</span>;
}

// Big current-version image (or a specific version). Uses a cacheKey so a new
// revision re-fetches instead of showing the stale blob.
function MockupImage({ mockupId, imagePath, version = null, cacheKey = '', className = '' }) {
  const [src, setSrc] = useState(null);

  useEffect(() => {
    if (!imagePath) return undefined;
    let url;
    let cancelled = false;
    const fetcher = version !== null
      ? getClientMockupVersionImageBlob(mockupId, version)
      : clientPortalApi.get(`/client/mockups/${mockupId}/image`, { responseType: 'blob' }).then((r) => r.data);
    fetcher
      .then((blob) => { if (!cancelled) { url = URL.createObjectURL(blob); setSrc(url); } })
      .catch(() => {});
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url); };
  }, [mockupId, imagePath, version, cacheKey]);

  if (!imagePath) {
    return (
      <div className={`flex items-center justify-center bg-panel-2 text-sm text-cream-dim ${className}`}>
        No image generated yet
      </div>
    );
  }
  if (!src) {
    return (
      <div className={`flex items-center justify-center bg-panel-2 text-sm text-cream-dim ${className}`}>
        Loading image…
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={version ? `Version ${version}` : 'Mockup'}
      className={`cursor-pointer object-contain ${className}`}
      onClick={() => window.open(src, '_blank')}
      title="Click to view full size"
    />
  );
}

// A logo / artwork image the customer sent on WhatsApp.
function LogoThumb({ attachment }) {
  const [src, setSrc] = useState(null);
  useEffect(() => {
    let url;
    let cancelled = false;
    getClientAttachmentBlob(attachment.id)
      .then((blob) => { if (!cancelled) { url = URL.createObjectURL(blob); setSrc(url); } })
      .catch(() => {});
    return () => { cancelled = true; if (url) URL.revokeObjectURL(url); };
  }, [attachment.id]);
  if (!src) return <div className="h-24 w-24 animate-pulse rounded-lg bg-panel-2" />;
  return (
    <a href={src} target="_blank" rel="noreferrer">
      <img src={src} alt="Customer logo" className="h-24 w-24 rounded-lg border border-line object-cover hover:opacity-80" />
    </a>
  );
}

export default function ClientMockupDetail() {
  const { mockupId } = useParams();
  const navigate = useNavigate();
  const { toast, showToast } = useToast();

  const [mockup, setMockup] = useState(null);
  const [attachments, setAttachments] = useState([]);
  const [presets, setPresets] = useState([]);
  const [contexts, setContexts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Redesign form
  const [instructions, setInstructions] = useState('');
  const [selectedPreset, setSelectedPreset] = useState(null);
  const [selectedContext, setSelectedContext] = useState(null);

  const [busy, setBusy] = useState(null); // 'revise' | 'approve' | 'decline'
  const [confirmDecline, setConfirmDecline] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [data, presetData] = await Promise.all([
        getClientMockup(mockupId),
        getClientMockupPresets().catch(() => ({ presets: [], contexts: [] })),
      ]);
      setMockup(data.mockup);
      setAttachments(data.attachments || []);
      setPresets(presetData.presets || []);
      setContexts(presetData.contexts || []);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load mockup'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [mockupId]);

  const canGenerate = instructions.trim() || selectedPreset || selectedContext;

  async function handleRedesign() {
    if (!canGenerate) return;
    const payload = {};
    if (instructions.trim()) payload.instructions = instructions.trim();
    if (selectedPreset) payload.preset = selectedPreset;
    if (selectedContext) payload.context = selectedContext;

    setBusy('revise');
    try {
      const updated = await reviseClientMockup(mockupId, payload);
      setMockup(updated);
      setInstructions('');
      setSelectedPreset(null);
      setSelectedContext(null);
      showToast('New design generated — review it above');
    } catch (err) {
      showToast(getErrorMessage(err, 'Generation failed — please try again'), 'error');
    } finally {
      setBusy(null);
    }
  }

  async function handleAction(action) {
    setBusy(action);
    try {
      const updated = await updateClientMockup(mockupId, { action });
      setMockup(updated);
      showToast(action === 'approve' ? 'Design sent to the customer ✓' : 'Mockup declined');
    } catch (err) {
      showToast(getErrorMessage(err, `Failed to ${action} mockup`), 'error');
    } finally {
      setBusy(null);
    }
  }

  const versions = mockup?.versions || [];
  const history = versions.length > 1 ? versions.slice(0, -1).reverse() : [];

  return (
    <ClientLayout title="Mockup">
      <div className="mb-4">
        <Link to="/client/mockups" className="text-sm font-medium text-primary hover:underline">
          ← Back to Mockups
        </Link>
      </div>

      {loading && <LoadingSpinner label="Loading mockup…" />}
      {!loading && error && <ErrorMessage message={error} />}

      {!loading && !error && mockup && (
        <div className="grid gap-6 lg:grid-cols-5">
          {/* Left: current design + specs */}
          <div className="space-y-4 lg:col-span-3">
            <div className="overflow-hidden rounded-xl border border-line bg-panel shadow-sm">
              <MockupImage
                mockupId={mockup.id}
                imagePath={mockup.image_path}
                cacheKey={mockup.updated_at}
                className="max-h-[26rem] w-full bg-panel-2"
              />
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line p-4">
                <div>
                  <p className="text-sm font-semibold text-cream">
                    {mockup.customer_name || maskPhoneNumber(mockup.customer_number)}
                  </p>
                  <p className="text-xs text-cream-dim">
                    {maskPhoneNumber(mockup.customer_number)} · {formatDate(mockup.created_at)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {mockup.revision_count > 0 && (
                    <span className="rounded-full border border-line bg-panel-2 px-2 py-0.5 text-xs text-cream-dim">
                      {mockup.revision_count} revision{mockup.revision_count !== 1 ? 's' : ''}
                    </span>
                  )}
                  <StatusBadge status={mockup.status} />
                </div>
              </div>
            </div>

            {/* Design specifications pulled from the chat */}
            <div className="rounded-xl border border-line bg-panel p-4 shadow-sm">
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-cream-dim">
                Design brief from the chat
              </p>
              <p className="text-sm text-cream">{mockup.description}</p>
            </div>

            {/* Customer logo / artwork */}
            <div className="rounded-xl border border-line bg-panel p-4 shadow-sm">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-cream-dim">
                Logo / artwork the customer sent
              </p>
              {attachments.length === 0 ? (
                <p className="text-sm text-cream-dim">
                  No logo received on WhatsApp. If the customer sends one, it will be woven into the next redesign automatically.
                </p>
              ) : (
                <>
                  <div className="flex flex-wrap gap-3">
                    {attachments.map((a) => <LogoThumb key={a.id} attachment={a} />)}
                  </div>
                  <p className="mt-2 text-xs text-cream-dim">
                    This artwork is automatically incorporated each time you redesign.
                  </p>
                </>
              )}
            </div>

            {/* Version history */}
            {history.length > 0 && (
              <div className="rounded-xl border border-line bg-panel p-4 shadow-sm">
                <button
                  type="button"
                  onClick={() => setShowHistory(!showHistory)}
                  className="flex w-full items-center justify-between text-xs font-medium uppercase tracking-wide text-cream-dim hover:text-primary"
                >
                  <span>Previous versions ({history.length})</span>
                  <span>{showHistory ? '▲' : '▼'}</span>
                </button>
                {showHistory && (
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    {history.map((ver) => (
                      <div key={ver.version} className="overflow-hidden rounded-lg border border-line">
                        <MockupImage
                          mockupId={mockup.id}
                          imagePath={ver.image_path}
                          version={ver.version}
                          className="h-40 w-full bg-panel-2"
                        />
                        <div className="bg-panel-2 px-3 py-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-cream-dim">Version {ver.version}</span>
                            <span className="text-xs text-cream-dim">{formatDate(ver.created_at)}</span>
                          </div>
                          {ver.revision_instructions && (
                            <p className="mt-1 text-xs italic text-cream">"{ver.revision_instructions}"</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Right: redesign controls + send */}
          <div className="space-y-4 lg:col-span-2">
            <div className="rounded-xl border border-primary/30 bg-panel p-4 shadow-sm">
              <h2 className="mb-1 text-sm font-semibold text-cream">🎨 Redesign this mockup</h2>
              <p className="mb-3 text-xs text-cream-dim">
                Pick a sign type, a setting, and/or describe the changes. The chat brief and the customer's logo are always included.
              </p>

              <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-cream-dim">Sign type</p>
              <div className="mb-3 flex flex-wrap gap-1.5">
                {presets.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSelectedPreset(p.id === selectedPreset ? null : p.id)}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                      selectedPreset === p.id
                        ? 'border-primary bg-primary text-ink'
                        : 'border-line text-cream-dim hover:border-primary/50 hover:text-primary'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>

              <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-cream-dim">Setting</p>
              <div className="mb-3 flex gap-1.5">
                {contexts.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setSelectedContext(c.id === selectedContext ? null : c.id)}
                    className={`flex-1 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                      selectedContext === c.id
                        ? 'border-primary bg-primary text-ink'
                        : 'border-line text-cream-dim hover:border-primary/50 hover:text-primary'
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>

              <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-cream-dim">Extra instructions</p>
              <textarea
                rows={3}
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder='e.g. "make the letters bigger", "brushed gold finish", "add the phone number underneath"'
                className="w-full resize-none rounded-lg border border-line bg-panel-2 px-3 py-2 text-sm text-cream placeholder-cream-dim focus:border-primary focus:outline-none"
              />

              <button
                type="button"
                onClick={handleRedesign}
                disabled={!canGenerate || busy === 'revise'}
                className="mt-3 w-full rounded-lg bg-primary px-3 py-2.5 text-sm font-semibold text-ink hover:bg-primary/90 disabled:opacity-50"
              >
                {busy === 'revise' ? 'Generating new design…' : 'Generate New Design'}
              </button>
              {busy === 'revise' && (
                <p className="mt-2 text-center text-xs text-cream-dim">This usually takes 10–20 seconds…</p>
              )}
            </div>

            {/* Send / decline */}
            <div className="rounded-xl border border-line bg-panel p-4 shadow-sm">
              <h2 className="mb-3 text-sm font-semibold text-cream">Send to customer</h2>
              <button
                type="button"
                onClick={() => handleAction('approve')}
                disabled={!!busy || !mockup.image_path}
                className="w-full rounded-lg bg-primary px-3 py-2.5 text-sm font-semibold text-ink hover:bg-primary/90 disabled:opacity-50"
              >
                {busy === 'approve'
                  ? 'Sending…'
                  : mockup.status === 'approved'
                  ? 'Send Again'
                  : 'Approve & Send'}
              </button>
              <button
                type="button"
                onClick={() => setConfirmDecline(true)}
                disabled={!!busy}
                className="mt-2 w-full rounded-lg border border-line px-3 py-2 text-sm font-medium text-cream-dim hover:bg-panel-2 disabled:opacity-50"
              >
                {busy === 'decline' ? 'Declining…' : 'Decline'}
              </button>
              {mockup.status === 'approved' && (
                <p className="mt-2 text-center text-xs text-cream-dim">
                  Already sent. Redesign above, then send again to deliver the new version.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmDecline}
        title="Decline this mockup?"
        message="The customer won't receive it. You can still redesign it later."
        confirmLabel="Decline"
        danger
        onConfirm={() => { setConfirmDecline(false); handleAction('decline'); }}
        onCancel={() => setConfirmDecline(false)}
      />
      <Toast toast={toast} />
    </ClientLayout>
  );
}
