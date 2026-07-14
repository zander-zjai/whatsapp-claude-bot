import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import ClientLayout from '../../components/ClientLayout';
import LoadingSpinner from '../../components/LoadingSpinner';
import ErrorMessage from '../../components/ErrorMessage';
import ConfirmDialog from '../../components/ConfirmDialog';
import Toast, { useToast } from '../../components/Toast';
import {
  getClientMockup,
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
    return <div className={`flex items-center justify-center bg-panel-2 text-sm text-cream-dim ${className}`}>No image</div>;
  }
  if (!src) {
    return <div className={`flex items-center justify-center bg-panel-2 text-sm text-cream-dim ${className}`}>Loading image…</div>;
  }
  return (
    <img src={src} alt={version ? `Version ${version}` : 'Mockup'}
      className={`cursor-pointer object-contain ${className}`}
      onClick={() => window.open(src, '_blank')} title="Click to view full size" />
  );
}

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

function Slider({ label, value, min, max, step, onChange, format }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-medium text-cream-dim">{label}</span>
        <span className="text-xs text-cream">{format ? format(value) : value}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full accent-primary" />
    </div>
  );
}

export default function ClientMockupDetail() {
  const { mockupId } = useParams();
  const { toast, showToast } = useToast();

  const [mockup, setMockup] = useState(null);
  const [attachments, setAttachments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Position/size adjustment controls
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const [scale, setScale] = useState(1);

  const [busy, setBusy] = useState(null);
  const [confirmDecline, setConfirmDecline] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const data = await getClientMockup(mockupId);
      setMockup(data.mockup);
      setAttachments(data.attachments || []);
      setOffsetX(data.mockup?.logo_offset?.x || 0);
      setOffsetY(data.mockup?.logo_offset?.y || 0);
      setScale(data.mockup?.logo_scale || 1);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load mockup'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [mockupId]);

  async function handleRecomposite() {
    setBusy('revise');
    try {
      const updated = await reviseClientMockup(mockupId, {
        offset_x: offsetX, offset_y: offsetY, scale,
      });
      setMockup(updated);
      showToast('Mockup updated — review it above');
    } catch (err) {
      showToast(getErrorMessage(err, 'Could not update — please try again'), 'error');
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
  const adjustDirty = mockup && (
    offsetX !== (mockup.logo_offset?.x || 0) ||
    offsetY !== (mockup.logo_offset?.y || 0) ||
    scale !== (mockup.logo_scale || 1)
  );

  return (
    <ClientLayout title="Mockup">
      <div className="mb-4">
        <Link to="/client/mockups" className="text-sm font-medium text-primary hover:underline">
          ← Back to Mockups
        </Link>
      </div>

      {loading && <LoadingSpinner label="Loading mockup…" />}
      {!loading && error && <ErrorMessage message={error} />}

      {!loading && !error && mockup && mockup.deferred && (
        <div className="mx-auto max-w-2xl space-y-4">
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-5">
            <p className="text-sm font-semibold text-amber-400">🛠️ Manual design required</p>
            <p className="mt-2 text-sm text-cream">
              {mockup.deferred_note || 'A professional design mockup will be provided after quote approval.'}
            </p>
            {mockup.manual_design_needed && (
              <p className="mt-3 rounded-lg bg-panel-2 px-3 py-2 text-sm text-amber-300">
                ⏰ The quote for this customer has been approved — time to create and send the design mockup.
              </p>
            )}
          </div>
          <div className="rounded-xl border border-line bg-panel p-4">
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-cream-dim">Customer</p>
            <p className="text-sm text-cream">
              {mockup.customer_name || maskPhoneNumber(mockup.customer_number)} · {maskPhoneNumber(mockup.customer_number)}
            </p>
            <p className="mb-1 mt-3 text-xs font-medium uppercase tracking-wide text-cream-dim">Brief from the chat</p>
            <p className="text-sm text-cream">{mockup.description}</p>
            <div className="mt-4"><StatusBadge status={mockup.status} /></div>
          </div>
          {attachments.length > 0 && (
            <div className="rounded-xl border border-line bg-panel p-4">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-cream-dim">Customer's logo / artwork</p>
              <div className="flex flex-wrap gap-3">{attachments.map((a) => <LogoThumb key={a.id} attachment={a} />)}</div>
            </div>
          )}
        </div>
      )}

      {!loading && !error && mockup && !mockup.deferred && (
        <div className="grid gap-6 lg:grid-cols-5">
          {/* Left: current composite + specs */}
          <div className="space-y-4 lg:col-span-3">
            <div className="overflow-hidden rounded-xl border border-line bg-panel shadow-sm">
              <MockupImage mockupId={mockup.id} imagePath={mockup.image_path} cacheKey={mockup.updated_at}
                className="max-h-[26rem] w-full bg-panel-2" />
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

            <div className="rounded-xl border border-line bg-panel p-4 shadow-sm">
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-cream-dim">Design brief from the chat</p>
              <p className="text-sm text-cream">{mockup.description}</p>
              <p className="mt-2 text-xs text-cream-dim">
                {mockup.used_logo ? "Composited with the customer's logo." : "Composited with sign text (no logo image was sent)."}
              </p>
            </div>

            <div className="rounded-xl border border-line bg-panel p-4 shadow-sm">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-cream-dim">Logo / artwork the customer sent</p>
              {attachments.length === 0 ? (
                <p className="text-sm text-cream-dim">No logo received on WhatsApp.</p>
              ) : (
                <div className="flex flex-wrap gap-3">{attachments.map((a) => <LogoThumb key={a.id} attachment={a} />)}</div>
              )}
            </div>

            {history.length > 0 && (
              <div className="rounded-xl border border-line bg-panel p-4 shadow-sm">
                <button type="button" onClick={() => setShowHistory(!showHistory)}
                  className="flex w-full items-center justify-between text-xs font-medium uppercase tracking-wide text-cream-dim hover:text-primary">
                  <span>Previous versions ({history.length})</span>
                  <span>{showHistory ? '▲' : '▼'}</span>
                </button>
                {showHistory && (
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    {history.map((ver) => (
                      <div key={ver.version} className="overflow-hidden rounded-lg border border-line">
                        <MockupImage mockupId={mockup.id} imagePath={ver.image_path} version={ver.version}
                          className="h-40 w-full bg-panel-2" />
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

          {/* Right: adjust + send */}
          <div className="space-y-4 lg:col-span-2">
            <div className="rounded-xl border border-primary/30 bg-panel p-4 shadow-sm">
              <h2 className="mb-1 text-sm font-semibold text-cream">🎛️ Adjust the logo</h2>
              <p className="mb-3 text-xs text-cream-dim">
                Nudge the logo's position and size, then regenerate. The customer's logo and the reference photo stay the same.
              </p>
              <div className="space-y-3">
                <Slider label="Horizontal" value={offsetX} min={-0.3} max={0.3} step={0.02}
                  onChange={setOffsetX} format={(v) => (v === 0 ? 'centre' : v < 0 ? 'left' : 'right')} />
                <Slider label="Vertical" value={offsetY} min={-0.3} max={0.3} step={0.02}
                  onChange={setOffsetY} format={(v) => (v === 0 ? 'centre' : v < 0 ? 'up' : 'down')} />
                <Slider label="Size" value={scale} min={0.5} max={1.6} step={0.05}
                  onChange={setScale} format={(v) => `${Math.round(v * 100)}%`} />
              </div>
              <button type="button" onClick={handleRecomposite} disabled={busy === 'revise' || !adjustDirty}
                className="mt-3 w-full rounded-lg bg-primary px-3 py-2.5 text-sm font-semibold text-ink hover:bg-primary/90 disabled:opacity-50">
                {busy === 'revise' ? 'Regenerating…' : 'Regenerate Mockup'}
              </button>
              <button type="button"
                onClick={() => { setOffsetX(0); setOffsetY(0); setScale(1); }}
                disabled={busy === 'revise'}
                className="mt-2 w-full rounded-lg border border-line px-3 py-2 text-xs font-medium text-cream-dim hover:bg-panel-2 disabled:opacity-50">
                Reset to centre
              </button>
            </div>

            <div className="rounded-xl border border-line bg-panel p-4 shadow-sm">
              <h2 className="mb-3 text-sm font-semibold text-cream">Send to customer</h2>
              <button type="button" onClick={() => handleAction('approve')}
                disabled={!!busy || !mockup.image_path}
                className="w-full rounded-lg bg-primary px-3 py-2.5 text-sm font-semibold text-ink hover:bg-primary/90 disabled:opacity-50">
                {busy === 'approve' ? 'Sending…' : mockup.status === 'approved' ? 'Send Again' : 'Approve & Send'}
              </button>
              <button type="button" onClick={() => setConfirmDecline(true)} disabled={!!busy}
                className="mt-2 w-full rounded-lg border border-line px-3 py-2 text-sm font-medium text-cream-dim hover:bg-panel-2 disabled:opacity-50">
                {busy === 'decline' ? 'Declining…' : 'Decline'}
              </button>
              {mockup.status === 'approved' && (
                <p className="mt-2 text-center text-xs text-cream-dim">
                  Already sent. Adjust above, then send again to deliver the new version.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmDecline}
        title="Decline this mockup?"
        message="The customer won't receive it. You can still adjust it later."
        confirmLabel="Decline"
        danger
        onConfirm={() => { setConfirmDecline(false); handleAction('decline'); }}
        onCancel={() => setConfirmDecline(false)}
      />
      <Toast toast={toast} />
    </ClientLayout>
  );
}
