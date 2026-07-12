import { useEffect, useState } from 'react';
import ClientLayout from '../../components/ClientLayout';
import LoadingSpinner from '../../components/LoadingSpinner';
import ErrorMessage from '../../components/ErrorMessage';
import ConfirmDialog from '../../components/ConfirmDialog';
import Toast, { useToast } from '../../components/Toast';
import {
  getClientMockups,
  getClientMockupPresets,
  getClientQuotes,
  updateClientMockup,
  reviseClientMockup,
  sendQuoteAndMockup,
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
  const label = status === 'approved' ? 'Sent to customer' : status === 'declined' ? 'Declined' : 'Awaiting review';
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      {label}
    </span>
  );
}

function RevisionBadge({ count }) {
  if (!count) return null;
  return (
    <span className="rounded-full border border-line bg-panel-2 px-2 py-0.5 text-xs text-cream-dim">
      {count} revision{count !== 1 ? 's' : ''}
    </span>
  );
}

function MockupImage({ mockupId, imagePath, version = null, cacheKey = '' }) {
  const [src, setSrc] = useState(null);

  useEffect(() => {
    if (!imagePath) return undefined;
    let url;
    let cancelled = false;
    const fetcher = version !== null
      ? getClientMockupVersionImageBlob(mockupId, version)
      : clientPortalApi.get(`/client/mockups/${mockupId}/image`, { responseType: 'blob' }).then((r) => r.data);

    fetcher
      .then((blob) => {
        if (cancelled) return;
        url = URL.createObjectURL(blob);
        setSrc(url);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [mockupId, imagePath, version, cacheKey]);

  if (!imagePath) {
    return (
      <div className="flex h-20 items-center justify-center bg-panel-2 text-sm text-cream-dim">
        No image was generated for this mockup
      </div>
    );
  }
  if (!src) {
    return (
      <div className="flex h-32 items-center justify-center bg-panel-2 text-sm text-cream-dim">
        Loading image…
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={version ? `Version ${version}` : 'Mockup'}
      className="max-h-64 w-full cursor-pointer object-cover"
      onClick={() => window.open(src, '_blank')}
      title="Click to view full size"
    />
  );
}

function RevisionHistory({ mockup }) {
  const [open, setOpen] = useState(false);
  const versions = mockup.versions || [];
  if (versions.length <= 1) return null;
  const history = versions.slice(0, -1).reverse();

  return (
    <div className="border-t border-line px-4 pb-4 pt-3">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between text-xs font-medium uppercase tracking-wide text-cream-dim hover:text-primary"
      >
        <span>Previous versions ({history.length})</span>
        <span>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="mt-3 space-y-3">
          {history.map((ver) => (
            <div key={ver.version} className="overflow-hidden rounded-lg border border-line">
              <MockupImage mockupId={mockup.id} imagePath={ver.image_path} version={ver.version} />
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
  );
}

function RevisionPanel({ presets, contexts, revising, onGenerate, onCancel }) {
  const [instructions, setInstructions] = useState('');
  const [selectedPreset, setSelectedPreset] = useState(null);
  const [selectedContext, setSelectedContext] = useState(null);

  const canGenerate = instructions.trim() || selectedPreset;

  function handleGenerate() {
    if (!canGenerate) return;
    const payload = {};
    if (instructions.trim()) payload.instructions = instructions.trim();
    if (selectedPreset) payload.preset = selectedPreset;
    if (selectedContext) payload.context = selectedContext;
    onGenerate(payload);
  }

  return (
    <div className="mt-4 space-y-3 rounded-lg border border-line bg-panel-2 p-3">
      <div>
        <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-cream-dim">
          What should change?
        </p>
        <textarea
          rows={2}
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          placeholder='e.g. "make the letters bigger", "change background to dark blue", "move the logo to the left"'
          autoFocus
          className="w-full resize-none rounded-lg border border-line bg-panel px-3 py-2 text-sm text-cream placeholder-cream-dim focus:border-primary focus:outline-none"
        />
      </div>

      <div>
        <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-cream-dim">
          Change sign type <span className="normal-case text-cream-dim/60">(optional)</span>
        </p>
        <div className="flex flex-wrap gap-1.5">
          {(presets || []).map((p) => (
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
      </div>

      <div>
        <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-cream-dim">
          Setting <span className="normal-case text-cream-dim/60">(optional)</span>
        </p>
        <div className="flex gap-1.5">
          {(contexts || []).map((c) => (
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
      </div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleGenerate}
          disabled={!canGenerate || revising}
          className="flex-1 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-ink hover:bg-primary/90 disabled:opacity-50"
        >
          {revising ? 'Generating new version…' : 'Generate New Version'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={revising}
          className="rounded-lg border border-line px-3 py-2 text-sm text-cream-dim hover:bg-panel disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
      {revising && (
        <p className="text-center text-xs text-cream-dim">
          This usually takes 10–20 seconds…
        </p>
      )}
    </div>
  );
}

function MockupCard({ mockup, presets, contexts, onApprove, onDecline, onRevise, busy }) {
  const [showRevise, setShowRevise] = useState(false);
  const isDone = mockup.status !== 'pending';
  const revising = busy === 'revise';

  return (
    <div className={`overflow-hidden rounded-xl border border-line bg-panel shadow-sm ${isDone ? 'opacity-70' : ''}`}>
      <MockupImage mockupId={mockup.id} imagePath={mockup.image_path} cacheKey={mockup.updated_at} />

      <div className="p-4">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-medium text-cream">
            {mockup.customer_name || maskPhoneNumber(mockup.customer_number)}
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            <RevisionBadge count={mockup.revision_count} />
            <StatusBadge status={mockup.status} />
          </div>
        </div>
        <p className="mb-1 text-xs text-cream-dim">
          {maskPhoneNumber(mockup.customer_number)} · {formatDate(mockup.created_at)}
        </p>
        <p className="mt-2 line-clamp-3 text-sm text-cream">{mockup.description}</p>

        {!isDone && (
          <>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => onApprove(mockup.id)}
                disabled={!!busy}
                className="flex-1 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-ink hover:bg-primary/90 disabled:opacity-50"
              >
                {busy === 'approve' ? 'Sending…' : 'Approve & Send'}
              </button>
              <button
                type="button"
                onClick={() => setShowRevise(!showRevise)}
                disabled={!!busy}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${
                  showRevise
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-primary/50 text-primary hover:bg-primary/10'
                }`}
              >
                Request Revision
              </button>
              <button
                type="button"
                onClick={() => onDecline(mockup.id)}
                disabled={!!busy}
                className="w-full rounded-lg border border-line px-3 py-2 text-sm font-medium text-cream-dim hover:bg-panel-2 disabled:opacity-50"
              >
                {busy === 'decline' ? 'Declining…' : 'Decline'}
              </button>
            </div>

            {showRevise && (
              <RevisionPanel
                presets={presets}
                contexts={contexts}
                revising={revising}
                onGenerate={(payload) => onRevise(mockup.id, payload, () => setShowRevise(false))}
                onCancel={() => setShowRevise(false)}
              />
            )}
          </>
        )}
      </div>

      <RevisionHistory mockup={mockup} />
    </div>
  );
}

function CombinedReadyCard({ pair, sending, onSendBoth }) {
  const { quote, mockup } = pair;
  const [eta, setEta] = useState('');

  return (
    <div className="overflow-hidden rounded-xl border border-primary/40 bg-panel shadow-sm">
      <div className="border-b border-primary/30 bg-primary/10 px-4 py-2">
        <p className="text-sm font-semibold text-primary">✨ Quote + Design Ready</p>
        <p className="text-xs text-cream-dim">
          {quote.name || maskPhoneNumber(quote.customer_number)} — send both in one go
        </p>
      </div>
      <div className="grid gap-0 sm:grid-cols-2">
        <div className="border-b border-line sm:border-b-0 sm:border-r">
          <MockupImage mockupId={mockup.id} imagePath={mockup.image_path} cacheKey={mockup.updated_at} />
        </div>
        <div className="p-4 text-sm">
          <p className="font-medium text-cream">{quote.item_description}</p>
          <p className="mt-1 text-xs text-cream-dim">
            {quote.size && <>Size: {quote.size} · </>}
            {quote.quantity && <>Qty: {quote.quantity}</>}
          </p>
          <p className="mt-2 text-lg font-semibold text-cream">
            R{Number(quote.total || 0).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}
          </p>
          <label className="mb-1 mt-3 block text-xs font-medium text-cream-dim">
            ETA for customer (optional)
          </label>
          <input
            type="text"
            value={eta}
            onChange={(e) => setEta(e.target.value)}
            placeholder="e.g. 7-10 working days"
            className="w-full rounded-lg border border-line bg-panel-2 px-3 py-2 text-sm text-cream placeholder-cream-dim focus:border-primary focus:outline-none"
          />
        </div>
      </div>
      <div className="border-t border-line p-4">
        <button
          type="button"
          onClick={() => onSendBoth(pair, eta)}
          disabled={sending}
          className="w-full rounded-lg bg-primary px-3 py-2.5 text-sm font-semibold text-ink hover:bg-primary/90 disabled:opacity-50"
        >
          {sending ? 'Sending mockup + quote…' : 'Approve and Send Both'}
        </button>
        <p className="mt-2 text-center text-xs text-cream-dim">
          Customer receives the design image first, then the quote PDF.
        </p>
      </div>
    </div>
  );
}

export default function ClientMockups() {
  const [mockups, setMockups] = useState([]);
  const [quotes, setQuotes] = useState([]);
  const [presets, setPresets] = useState([]);
  const [contexts, setContexts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [pending, setPending] = useState({});
  const [confirmDecline, setConfirmDecline] = useState(null);
  const [sendingBothId, setSendingBothId] = useState(null);
  const { toast, showToast } = useToast();

  useEffect(() => {
    Promise.all([
      getClientMockups(),
      getClientMockupPresets().catch(() => ({ presets: [], contexts: [] })),
      getClientQuotes().catch(() => []),
    ])
      .then(([mockupData, presetData, quoteData]) => {
        setMockups(mockupData);
        setPresets(presetData.presets || []);
        setContexts(presetData.contexts || []);
        setQuotes(quoteData || []);
      })
      .catch((err) => setError(getErrorMessage(err, 'Failed to load mockups')))
      .finally(() => setLoading(false));
  }, []);

  async function handleAction(id, action) {
    setPending((p) => ({ ...p, [id]: action }));
    try {
      const updated = await updateClientMockup(id, { action });
      setMockups((prev) => prev.map((m) => (m.id === id ? updated : m)));
      showToast(action === 'approve' ? 'Mockup sent to the customer ✓' : 'Mockup declined');
    } catch (err) {
      showToast(getErrorMessage(err, `Failed to ${action} mockup`), 'error');
    } finally {
      setPending((p) => { const n = { ...p }; delete n[id]; return n; });
    }
  }

  async function handleRevise(id, payload, onDone) {
    setPending((p) => ({ ...p, [id]: 'revise' }));
    try {
      const updated = await reviseClientMockup(id, payload);
      setMockups((prev) => prev.map((m) => (m.id === id ? updated : m)));
      showToast('New version generated — review it below');
      if (onDone) onDone();
    } catch (err) {
      showToast(getErrorMessage(err, 'Generation failed — please try again'), 'error');
    } finally {
      setPending((p) => { const n = { ...p }; delete n[id]; return n; });
    }
  }

  async function handleSendBoth(pair, eta) {
    setSendingBothId(pair.mockup.id);
    try {
      const result = await sendQuoteAndMockup(pair.quote.id, pair.mockup.id, eta);
      setMockups((prev) => prev.map((m) => (m.id === result.mockup.id ? result.mockup : m)));
      setQuotes((prev) => prev.map((q) => (q.id === result.quote.id ? result.quote : q)));
      showToast('Design and quote sent to the customer ✓');
    } catch (err) {
      showToast(getErrorMessage(err, 'Failed to send — please try again'), 'error');
    } finally {
      setSendingBothId(null);
    }
  }

  // Pair pending mockups with approvable quotes for the same customer
  const normalize = (n) => String(n || '').replace(/\D/g, '');
  const combinedPairs = mockups
    .filter((m) => m.status === 'pending' && m.image_path)
    .map((m) => {
      const quote = quotes.find(
        (q) =>
          q.tier === 2 &&
          ['pending', 'revised'].includes(q.status) &&
          normalize(q.customer_number) === normalize(m.customer_number)
      );
      return quote ? { quote, mockup: m } : null;
    })
    .filter(Boolean);

  const pairedMockupIds = new Set(combinedPairs.map((p) => p.mockup.id));
  const pendingMockups = mockups.filter((m) => m.status === 'pending' && !pairedMockupIds.has(m.id));
  const doneMockups = mockups.filter((m) => m.status !== 'pending');

  return (
    <ClientLayout title="Mockups">
      {loading && <LoadingSpinner label="Loading mockups…" />}
      {!loading && error && <ErrorMessage message={error} />}
      {!loading && !error && mockups.length === 0 && (
        <div className="rounded-xl border border-line bg-panel p-8 text-center">
          <p className="text-3xl">🖼️</p>
          <p className="mt-2 text-sm font-medium text-cream">No mockups yet</p>
          <p className="mt-1 text-sm text-cream-dim">
            A design mockup is created automatically every time a customer requests a quote.
            You'll review and approve it here before anything is sent.
          </p>
        </div>
      )}

      {!loading && !error && combinedPairs.length > 0 && (
        <div className="mb-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-cream-dim">
            Ready to Send Together ({combinedPairs.length})
          </h2>
          <div className="grid gap-4 lg:grid-cols-2">
            {combinedPairs.map((pair) => (
              <CombinedReadyCard
                key={pair.mockup.id}
                pair={pair}
                sending={sendingBothId === pair.mockup.id}
                onSendBoth={handleSendBoth}
              />
            ))}
          </div>
          <p className="mt-2 text-xs text-cream-dim">
            Want changes first? Use "Request Revision" on the matching card below — the linked quote stays in the Quote Requests tab.
          </p>
        </div>
      )}

      {!loading && !error && (combinedPairs.length > 0 || pendingMockups.length > 0) && (
        <div className="mb-8">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-cream-dim">
            Awaiting Review ({combinedPairs.length + pendingMockups.length})
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[...combinedPairs.map((p) => p.mockup), ...pendingMockups].map((m) => (
              <MockupCard
                key={m.id}
                mockup={m}
                presets={presets}
                contexts={contexts}
                onApprove={(id) => handleAction(id, 'approve')}
                onDecline={(id) => setConfirmDecline(id)}
                onRevise={handleRevise}
                busy={pending[m.id]}
              />
            ))}
          </div>
        </div>
      )}

      {!loading && !error && doneMockups.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-cream-dim">
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
                onDecline={(id) => setConfirmDecline(id)}
                onRevise={handleRevise}
                busy={pending[m.id]}
              />
            ))}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!confirmDecline}
        title="Decline this mockup?"
        message="The customer won't receive it, and it will move to Completed. This can't be undone."
        confirmLabel="Decline"
        danger
        onConfirm={() => {
          handleAction(confirmDecline, 'decline');
          setConfirmDecline(null);
        }}
        onCancel={() => setConfirmDecline(null)}
      />
      <Toast toast={toast} />
    </ClientLayout>
  );
}
