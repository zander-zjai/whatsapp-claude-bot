import { useEffect, useState } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import ClientLayout from '../../components/ClientLayout';
import LoadingSpinner from '../../components/LoadingSpinner';
import ErrorMessage from '../../components/ErrorMessage';
import MessageBubble from '../../components/MessageBubble';
import {
  getClientQuote,
  getClientConversation,
  getClientQuoteAttachments,
  getClientAttachmentBlob,
  getClientQuotePdfBlob,
  updateClientQuote,
} from '../../api/clientPortalEndpoints';
import { getErrorMessage } from '../../api/client';
import { formatDateTime } from '../../utils/format';

const STATUS_STYLES = {
  pending: 'bg-yellow-100 text-yellow-700',
  approved: 'bg-blue-100 text-blue-700',
  sent: 'bg-green-100 text-green-700',
  revised: 'bg-purple-100 text-purple-700',
  rejected: 'bg-red-100 text-red-700',
  declined: 'bg-red-100 text-red-700',
  accepted: 'bg-green-100 text-green-700',
  quoted: 'bg-blue-100 text-blue-700',
  won: 'bg-green-100 text-green-700',
  lost: 'bg-panel-2 text-cream-dim',
  needs_pricing: 'bg-orange-100 text-orange-700',
  expired: 'bg-panel-2 text-grey',
};

const OUTCOME_OPTIONS = ['pending', 'quoted', 'accepted', 'won', 'declined', 'lost'];

function AttachmentThumbnail({ attachment }) {
  const [url, setUrl] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let objectUrl;
    getClientAttachmentBlob(attachment.id)
      .then((blob) => {
        objectUrl = window.URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => setError(true));
    return () => { if (objectUrl) window.URL.revokeObjectURL(objectUrl); };
  }, [attachment.id]);

  const isImage = (attachment.mime_type || '').startsWith('image/');
  if (error) return <p className="text-xs text-red-400">Failed to load attachment.</p>;
  if (!url) return <div className="h-32 w-32 animate-pulse rounded-lg bg-panel-2" />;
  if (isImage) return (
    <a href={url} target="_blank" rel="noreferrer">
      <img src={url} alt="Attachment" className="h-32 w-32 rounded-lg border border-line object-cover hover:opacity-80" />
    </a>
  );
  return (
    <a href={url} download className="flex h-32 w-32 flex-col items-center justify-center rounded-lg border border-line bg-panel-2 text-center text-xs text-cream-dim hover:bg-panel">
      <span className="mb-1 text-2xl">📄</span>Download file
    </a>
  );
}

function ReviseTab({ quote, onRevised }) {
  const [lineItems, setLineItems] = useState(() =>
    (quote.line_items || []).map((li) => ({ ...li }))
  );
  const [notes, setNotes] = useState(quote.revision_notes || '');
  const [eta, setEta] = useState(quote.eta || '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const total = lineItems.reduce((s, li) => s + (Number(li.unit_price) || 0) * (Number(li.quantity) || 0), 0);

  function updateItem(index, field, value) {
    setLineItems((prev) => prev.map((li, i) => {
      if (i !== index) return li;
      const updated = { ...li, [field]: value };
      updated.line_total = (Number(updated.unit_price) || 0) * (Number(updated.quantity) || 0);
      return updated;
    }));
  }

  function addItem() {
    setLineItems((prev) => [...prev, { item: '', unit: '', quantity: 1, unit_price: 0, line_total: 0 }]);
  }

  function removeItem(index) {
    setLineItems((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit() {
    if (lineItems.length === 0) { setError('At least one line item is required'); return; }
    setError('');
    setSaving(true);
    try {
      const updated = await updateClientQuote(quote.id, {
        action: 'revise',
        line_items: lineItems,
        notes,
        eta,
      });
      onRevised(updated);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to send revised quote'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4 rounded-xl border border-line bg-panel p-4 shadow-sm">
      <p className="text-sm text-cream-dim">
        Edit the line items below. Once you click <strong className="text-cream">Approve & Send Revision</strong>, a new PDF is generated and sent to the customer automatically. The original quote is preserved in the audit trail.
      </p>

      {error && <ErrorMessage message={error} />}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line">
              <th className="pb-2 text-left text-xs font-medium text-cream-dim">Item</th>
              <th className="pb-2 text-left text-xs font-medium text-cream-dim">Unit</th>
              <th className="pb-2 text-left text-xs font-medium text-cream-dim w-20">Qty</th>
              <th className="pb-2 text-left text-xs font-medium text-cream-dim w-28">Unit Price (R)</th>
              <th className="pb-2 text-right text-xs font-medium text-cream-dim w-24">Line Total</th>
              <th className="pb-2 w-8" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {lineItems.map((li, i) => (
              <tr key={i}>
                <td className="py-2 pr-2">
                  <input
                    type="text"
                    value={li.item}
                    onChange={(e) => updateItem(i, 'item', e.target.value)}
                    className="w-full rounded border border-line bg-panel-2 px-2 py-1 text-xs text-cream focus:border-primary focus:outline-none"
                  />
                </td>
                <td className="py-2 pr-2">
                  <input
                    type="text"
                    value={li.unit}
                    onChange={(e) => updateItem(i, 'unit', e.target.value)}
                    className="w-full rounded border border-line bg-panel-2 px-2 py-1 text-xs text-cream focus:border-primary focus:outline-none"
                  />
                </td>
                <td className="py-2 pr-2">
                  <input
                    type="number"
                    min="0"
                    value={li.quantity}
                    onChange={(e) => updateItem(i, 'quantity', e.target.value)}
                    className="w-20 rounded border border-line bg-panel-2 px-2 py-1 text-xs text-cream focus:border-primary focus:outline-none"
                  />
                </td>
                <td className="py-2 pr-2">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={li.unit_price}
                    onChange={(e) => updateItem(i, 'unit_price', e.target.value)}
                    className="w-28 rounded border border-line bg-panel-2 px-2 py-1 text-xs text-cream focus:border-primary focus:outline-none"
                  />
                </td>
                <td className="py-2 text-right text-xs text-cream">
                  R{((Number(li.unit_price) || 0) * (Number(li.quantity) || 0)).toFixed(2)}
                </td>
                <td className="py-2 pl-2">
                  <button type="button" onClick={() => removeItem(i)} className="text-red-400 hover:text-red-300">✕</button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-line">
              <td colSpan={4} className="pt-2 text-right text-xs font-semibold text-cream-dim">Total</td>
              <td className="pt-2 text-right text-sm font-bold text-cream">R{total.toFixed(2)}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      <button type="button" onClick={addItem} className="text-xs font-medium text-primary hover:underline">
        + Add line item
      </button>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-cream-dim">ETA for customer</label>
          <input
            type="text"
            value={eta}
            onChange={(e) => setEta(e.target.value)}
            placeholder="e.g. 7-10 working days"
            className="w-full rounded-lg border border-line bg-panel-2 px-3 py-2 text-sm text-cream placeholder:text-grey focus:border-primary focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-cream-dim">Personal note to customer (optional)</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="This appears on the PDF and in the WhatsApp/email message"
            className="w-full rounded-lg border border-line bg-panel-2 px-3 py-2 text-sm text-cream placeholder:text-grey focus:border-primary focus:outline-none"
          />
        </div>
      </div>

      <button
        type="button"
        onClick={handleSubmit}
        disabled={saving}
        className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-ink hover:bg-primary-700 disabled:opacity-60"
      >
        {saving ? 'Generating & Sending…' : 'Approve & Send Revision'}
      </button>
    </div>
  );
}

export default function ClientQuoteDetail() {
  const { quoteId } = useParams();
  const [searchParams] = useSearchParams();

  const [quote, setQuote] = useState(null);
  const [tab, setTab] = useState(searchParams.get('action') === 'revise' ? 'revise' : 'details');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [pending, setPending] = useState(false);
  const [approving, setApproving] = useState(false);
  const [etaDraft, setEtaDraft] = useState('');

  const [messages, setMessages] = useState([]);
  const [chatLoaded, setChatLoaded] = useState(false);
  const [chatError, setChatError] = useState('');

  const [attachments, setAttachments] = useState([]);
  const [attachmentsLoaded, setAttachmentsLoaded] = useState(false);
  const [attachmentsError, setAttachmentsError] = useState('');

  async function loadQuote() {
    setLoading(true);
    setError('');
    try {
      const data = await getClientQuote(quoteId);
      setQuote(data);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load quote'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadQuote(); }, [quoteId]);

  useEffect(() => {
    if (tab === 'chat' && !chatLoaded && quote) {
      getClientConversation(quote.customer_number)
        .then((data) => { setMessages(data.messages); setChatLoaded(true); })
        .catch((err) => setChatError(getErrorMessage(err, 'Failed to load chat history')));
    }
    if (tab === 'attachments' && !attachmentsLoaded && quote) {
      getClientQuoteAttachments(quoteId)
        .then((data) => { setAttachments(data); setAttachmentsLoaded(true); })
        .catch((err) => setAttachmentsError(getErrorMessage(err, 'Failed to load attachments')));
    }
  }, [tab, quote, quoteId, chatLoaded, attachmentsLoaded]);

  async function confirmApprove() {
    setActionError('');
    setPending(true);
    try {
      const updated = await updateClientQuote(quote.id, { action: 'approve', eta: etaDraft });
      setQuote(updated);
      setApproving(false);
    } catch (err) {
      setActionError(getErrorMessage(err, 'Failed to approve quote'));
    } finally {
      setPending(false);
    }
  }

  async function handleReject() {
    setActionError('');
    setPending(true);
    try {
      const updated = await updateClientQuote(quote.id, { action: 'reject' });
      setQuote(updated);
    } catch (err) {
      setActionError(getErrorMessage(err, 'Failed to decline quote'));
    } finally {
      setPending(false);
    }
  }

  async function handleStatusChange(status) {
    if (!status || status === quote.status) return;
    setActionError('');
    setPending(true);
    try {
      const updated = await updateClientQuote(quote.id, { status });
      setQuote(updated);
    } catch (err) {
      setActionError(getErrorMessage(err, 'Failed to update quote status'));
    } finally {
      setPending(false);
    }
  }

  async function handleTogglePayment() {
    setActionError('');
    setPending(true);
    try {
      const updated = await updateClientQuote(quote.id, { payment_received: !quote.payment_received });
      setQuote(updated);
    } catch (err) {
      setActionError(getErrorMessage(err, 'Failed to update payment status'));
    } finally {
      setPending(false);
    }
  }

  async function handleDownloadPdf() {
    setActionError('');
    setPending(true);
    try {
      const blob = await getClientQuotePdfBlob(quote.id);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `quote-${quote.id.slice(0, 8)}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setActionError(getErrorMessage(err, 'Failed to download PDF'));
    } finally {
      setPending(false);
    }
  }

  const isApprovable = quote?.tier === 2 && ['pending', 'revised'].includes(quote?.status);
  const isRevisable = quote?.tier === 2;

  const TABS = [
    { key: 'details', label: 'Details' },
    ...(isRevisable ? [{ key: 'revise', label: '✏️ Revise' }] : []),
    { key: 'chat', label: 'Chat' },
    { key: 'attachments', label: 'Attachments' },
  ];

  return (
    <ClientLayout title="Quote Detail">
      <div className="mb-4">
        <Link to="/client/quotes" className="text-sm font-medium text-primary hover:underline">
          ← Back to Quote Requests
        </Link>
      </div>

      {loading && <LoadingSpinner label="Loading quote…" />}
      {!loading && error && <ErrorMessage message={error} />}

      {!loading && !error && quote && (
        <>
          {/* Header */}
          <div className="mb-4 flex flex-col gap-3 rounded-xl border border-line bg-panel p-4 shadow-sm sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-base font-semibold text-cream">{quote.name}</p>
              <p className="font-mono text-xs text-cream-dim">{quote.contact_number}</p>
              <p className="mt-1 text-xs text-cream-dim">Requested: {formatDateTime(quote.created_at)}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${quote.channel === 'email' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>
                  {quote.channel === 'email' ? '📧 Email Quote' : '📱 WhatsApp Quote'}
                </span>
                <span className={`rounded-full px-2 py-1 text-xs font-medium ${STATUS_STYLES[quote.status] || 'bg-panel-2 text-cream-dim'}`}>
                  {quote.status}
                </span>
                {!!quote.margin_percent && (
                  <span className="rounded-full bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-400">
                    {Math.abs(quote.margin_percent)}% discount
                  </span>
                )}
                <span className={`rounded-full px-2 py-1 text-xs font-medium ${quote.payment_received ? 'bg-green-100 text-green-700' : 'bg-panel-2 text-cream-dim'}`}>
                  {quote.payment_received ? 'Paid' : 'Unpaid'}
                </span>
              </div>
            </div>
            <button type="button" onClick={handleTogglePayment} disabled={pending}
              className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-cream-dim hover:bg-panel-2 disabled:opacity-60">
              {quote.payment_received ? 'Mark as Unpaid' : 'Mark as Paid'}
            </button>
          </div>

          {actionError && <div className="mb-4"><ErrorMessage message={actionError} /></div>}

          {/* Tabs */}
          <div className="mb-4 flex flex-wrap gap-2">
            {TABS.map((t) => (
              <button key={t.key} type="button" onClick={() => setTab(t.key)}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${tab === t.key ? 'bg-primary text-ink' : 'border border-line text-cream-dim hover:bg-panel-2'}`}>
                {t.label}
              </button>
            ))}
          </div>

          {/* Details tab */}
          {tab === 'details' && (
            <div className="rounded-xl border border-line bg-panel p-4 shadow-sm">
              <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div><dt className="text-xs font-medium text-cream-dim">Item</dt><dd className="text-sm text-cream">{quote.item_description}</dd></div>
                <div><dt className="text-xs font-medium text-cream-dim">Size</dt><dd className="text-sm text-cream">{quote.size}</dd></div>
                <div><dt className="text-xs font-medium text-cream-dim">Quantity</dt><dd className="text-sm text-cream">{quote.quantity}</dd></div>
                <div><dt className="text-xs font-medium text-cream-dim">Tier</dt><dd className="text-sm text-cream">Tier {quote.tier || 1}</dd></div>
                {quote.tier === 2 && (
                  <>
                    <div><dt className="text-xs font-medium text-cream-dim">Total</dt><dd className="text-sm text-cream">R{Number(quote.total || 0).toFixed(2)}</dd></div>
                    {!!quote.margin_percent && (
                      <div><dt className="text-xs font-medium text-cream-dim">Discount applied</dt><dd className="text-sm text-green-400">{Math.abs(quote.margin_percent)}% off list price</dd></div>
                    )}
                  </>
                )}
                <div><dt className="text-xs font-medium text-cream-dim">ETA</dt><dd className="text-sm text-cream">{quote.eta || '—'}</dd></div>
                {quote.valid_until && (
                  <div><dt className="text-xs font-medium text-cream-dim">Valid until</dt><dd className="text-sm text-cream">{formatDateTime(quote.valid_until)}</dd></div>
                )}
                {quote.revision_notes && (
                  <div className="sm:col-span-2"><dt className="text-xs font-medium text-cream-dim">Note to customer</dt><dd className="text-sm text-cream">{quote.revision_notes}</dd></div>
                )}
              </dl>

              {Array.isArray(quote.line_items) && quote.line_items.length > 0 && (
                <div className="mt-4 border-t border-line pt-4">
                  <p className="mb-2 text-xs font-medium text-cream-dim">Line items</p>
                  <table className="w-full text-sm">
                    <tbody className="divide-y divide-line">
                      {quote.line_items.map((li, i) => (
                        <tr key={i}>
                          <td className="py-1 text-cream">{li.item}</td>
                          <td className="py-1 text-cream-dim">{li.quantity} {li.unit}</td>
                          <td className="py-1 text-right text-cream-dim text-xs">R{Number(li.unit_price || 0).toFixed(2)} ea.</td>
                          <td className="py-1 text-right text-cream">R{Number(li.line_total || 0).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {Array.isArray(quote.revisions) && quote.revisions.length > 0 && (
                <div className="mt-4 border-t border-line pt-4">
                  <p className="mb-2 text-xs font-medium text-cream-dim">Revision history ({quote.revisions.length})</p>
                  <div className="space-y-3">
                    {quote.revisions.map((rev, i) => (
                      <div key={i} className="rounded-lg border border-line bg-panel-2 p-3">
                        <p className="mb-1 text-[11px] text-cream-dim">Version {i + 1} — {formatDateTime(rev.revised_at)}</p>
                        {Array.isArray(rev.line_items) && rev.line_items.map((li, j) => (
                          <p key={j} className="text-xs text-cream-dim">{li.item}: {li.quantity} {li.unit} × R{Number(li.unit_price || 0).toFixed(2)} = R{Number(li.line_total || 0).toFixed(2)}</p>
                        ))}
                        <p className="mt-1 text-xs font-medium text-cream">Total: R{Number(rev.total || 0).toFixed(2)}</p>
                        {rev.notes && <p className="mt-1 text-xs text-cream-dim italic">{rev.notes}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
                {isApprovable && !approving && (
                  <>
                    <button type="button" onClick={() => { setApproving(true); setEtaDraft(quote.eta || ''); }} disabled={pending}
                      className="rounded-lg border border-green-500/30 px-3 py-1.5 text-xs font-medium text-green-400 hover:bg-green-500/10 disabled:opacity-60">
                      Approve & Send
                    </button>
                    <button type="button" onClick={() => setTab('revise')} disabled={pending}
                      className="rounded-lg border border-purple-500/30 px-3 py-1.5 text-xs font-medium text-purple-400 hover:bg-purple-500/10 disabled:opacity-60">
                      Revise
                    </button>
                    <button type="button" onClick={handleReject} disabled={pending}
                      className="rounded-lg border border-red-500/30 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/10 disabled:opacity-60">
                      Decline
                    </button>
                  </>
                )}

                {approving && (
                  <div className="w-full rounded-lg border border-line bg-panel-2 p-3 sm:w-80">
                    <label className="mb-1 block text-[11px] font-medium text-cream-dim">ETA (sent to customer)</label>
                    <input type="text" value={etaDraft} onChange={(e) => setEtaDraft(e.target.value)} placeholder="e.g. 7-10 working days" autoFocus
                      className="w-full rounded-md border border-line bg-panel px-2 py-1 text-xs text-cream placeholder:text-grey focus:border-primary focus:outline-none" />
                    <div className="mt-2 flex gap-2">
                      <button type="button" onClick={confirmApprove} disabled={pending}
                        className="flex-1 rounded-md bg-primary px-2 py-1 text-xs font-medium text-ink disabled:opacity-60">
                        {pending ? 'Sending…' : 'Confirm & Send'}
                      </button>
                      <button type="button" onClick={() => setApproving(false)} disabled={pending}
                        className="rounded-md border border-line px-2 py-1 text-xs text-cream-dim hover:bg-panel disabled:opacity-60">
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {quote.tier === 2 && quote.status !== 'needs_pricing' && (
                  <button type="button" onClick={handleDownloadPdf} disabled={pending}
                    className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-cream-dim hover:bg-panel-2 disabled:opacity-60">
                    Download PDF
                  </button>
                )}

                <select value={OUTCOME_OPTIONS.includes(quote.status) ? quote.status : ''} onChange={(e) => handleStatusChange(e.target.value)} disabled={pending}
                  className="rounded-lg border border-line bg-panel-2 px-2 py-1.5 text-xs text-cream-dim focus:border-primary focus:outline-none disabled:opacity-60">
                  <option value="" disabled hidden>Mark as…</option>
                  {OUTCOME_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>{opt.charAt(0).toUpperCase() + opt.slice(1)}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Revise tab */}
          {tab === 'revise' && (
            <ReviseTab
              quote={quote}
              onRevised={(updated) => { setQuote(updated); setTab('details'); }}
            />
          )}

          {/* Chat tab */}
          {tab === 'chat' && (
            <div className="rounded-xl border border-line bg-panel p-4 shadow-sm">
              {chatError && <ErrorMessage message={chatError} />}
              {!chatError && !chatLoaded && <LoadingSpinner label="Loading chat…" />}
              {!chatError && chatLoaded && messages.length === 0 && <p className="py-10 text-center text-cream-dim">No messages yet.</p>}
              {!chatError && chatLoaded && messages.length > 0 && (
                <div className="space-y-4">{messages.map((msg) => <MessageBubble key={msg.id} msg={msg} />)}</div>
              )}
            </div>
          )}

          {/* Attachments tab */}
          {tab === 'attachments' && (
            <div className="rounded-xl border border-line bg-panel p-4 shadow-sm">
              {attachmentsError && <ErrorMessage message={attachmentsError} />}
              {!attachmentsError && !attachmentsLoaded && <LoadingSpinner label="Loading attachments…" />}
              {!attachmentsError && attachmentsLoaded && attachments.length === 0 && <p className="py-10 text-center text-cream-dim">No designs or files received around this quote.</p>}
              {!attachmentsError && attachmentsLoaded && attachments.length > 0 && (
                <div className="flex flex-wrap gap-4">
                  {attachments.map((a) => (
                    <div key={a.id}>
                      <AttachmentThumbnail attachment={a} />
                      <p className="mt-1 text-center text-[11px] text-grey">{formatDateTime(a.created_at)}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </ClientLayout>
  );
}
