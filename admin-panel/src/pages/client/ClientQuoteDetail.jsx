import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
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
  rejected: 'bg-red-100 text-red-700',
  quoted: 'bg-blue-100 text-blue-700',
  won: 'bg-green-100 text-green-700',
  lost: 'bg-line text-cream-dim',
  needs_pricing: 'bg-orange-100 text-orange-700',
};

const OUTCOME_OPTIONS = ['pending', 'quoted', 'won', 'lost'];

const TABS = [
  { key: 'details', label: 'Details' },
  { key: 'chat', label: 'Chat' },
  { key: 'attachments', label: 'Attachments' },
];

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
    return () => {
      if (objectUrl) window.URL.revokeObjectURL(objectUrl);
    };
  }, [attachment.id]);

  const isImage = (attachment.mime_type || '').startsWith('image/');

  if (error) {
    return <p className="text-xs text-red-400">Failed to load attachment.</p>;
  }

  if (!url) {
    return <div className="h-32 w-32 animate-pulse rounded-lg bg-panel-2" />;
  }

  if (isImage) {
    return (
      <a href={url} target="_blank" rel="noreferrer" className="block">
        <img src={url} alt="Attachment" className="h-32 w-32 rounded-lg border border-line object-cover hover:opacity-80" />
      </a>
    );
  }

  return (
    <a
      href={url}
      download
      className="flex h-32 w-32 flex-col items-center justify-center rounded-lg border border-line bg-panel-2 text-center text-xs text-cream-dim hover:bg-panel"
    >
      <span className="mb-1 text-2xl">📄</span>
      Download file
    </a>
  );
}

export default function ClientQuoteDetail() {
  const { quoteId } = useParams();

  const [quote, setQuote] = useState(null);
  const [tab, setTab] = useState('details');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [pending, setPending] = useState(false);
  const [approving, setApproving] = useState(false);
  const [etaDraft, setEtaDraft] = useState('');

  const [conversation, setConversation] = useState(null);
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

  useEffect(() => {
    loadQuote();
  }, [quoteId]);

  useEffect(() => {
    if (tab === 'chat' && !chatLoaded && quote) {
      getClientConversation(quote.customer_number)
        .then((data) => {
          setConversation(data.conversation);
          setMessages(data.messages);
          setChatLoaded(true);
        })
        .catch((err) => setChatError(getErrorMessage(err, 'Failed to load chat history')));
    }
    if (tab === 'attachments' && !attachmentsLoaded && quote) {
      getClientQuoteAttachments(quoteId)
        .then((data) => {
          setAttachments(data);
          setAttachmentsLoaded(true);
        })
        .catch((err) => setAttachmentsError(getErrorMessage(err, 'Failed to load attachments')));
    }
  }, [tab, quote, quoteId, chatLoaded, attachmentsLoaded]);

  function startApproving() {
    setActionError('');
    setApproving(true);
    setEtaDraft(quote?.eta || '');
  }

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
      setActionError(getErrorMessage(err, 'Failed to reject quote'));
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
          <div className="mb-4 flex flex-col gap-3 rounded-xl border border-line bg-panel p-4 shadow-sm sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-base font-semibold text-cream">{quote.name}</p>
              <p className="font-mono text-xs text-cream-dim">{quote.contact_number}</p>
              <p className="mt-1 text-xs text-cream-dim">Requested: {formatDateTime(quote.created_at)}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    quote.channel === 'email' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'
                  }`}
                >
                  {quote.channel === 'email' ? '📧 Email Quote Request' : '📱 WhatsApp Quote Request'}
                </span>
                <span className={`rounded-full px-2 py-1 text-xs font-medium ${STATUS_STYLES[quote.status] || 'bg-panel-2 text-cream-dim'}`}>
                  {quote.status}
                </span>
                <span
                  className={`rounded-full px-2 py-1 text-xs font-medium ${
                    quote.payment_received ? 'bg-green-100 text-green-700' : 'bg-panel-2 text-cream-dim'
                  }`}
                >
                  {quote.payment_received ? 'Paid' : 'Unpaid'}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleTogglePayment}
              disabled={pending}
              className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-cream-dim hover:bg-panel-2 disabled:opacity-60"
            >
              {quote.payment_received ? 'Mark as Unpaid' : 'Mark as Paid'}
            </button>
          </div>

          {actionError && (
            <div className="mb-4">
              <ErrorMessage message={actionError} />
            </div>
          )}

          <div className="mb-4 flex gap-2">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                  tab === t.key ? 'bg-primary text-ink' : 'border border-line text-cream-dim hover:bg-panel-2'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === 'details' && (
            <div className="rounded-xl border border-line bg-panel p-4 shadow-sm">
              <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <dt className="text-xs font-medium text-cream-dim">Item</dt>
                  <dd className="text-sm text-cream">{quote.item_description}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-cream-dim">Size</dt>
                  <dd className="text-sm text-cream">{quote.size}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-cream-dim">Quantity</dt>
                  <dd className="text-sm text-cream">{quote.quantity}</dd>
                </div>
                <div>
                  <dt className="text-xs font-medium text-cream-dim">Tier</dt>
                  <dd className="text-sm text-cream">Tier {quote.tier || 1}</dd>
                </div>
                {quote.tier === 2 && (
                  <div>
                    <dt className="text-xs font-medium text-cream-dim">Total</dt>
                    <dd className="text-sm text-cream">R{Number(quote.total || 0).toFixed(2)}</dd>
                  </div>
                )}
                <div>
                  <dt className="text-xs font-medium text-cream-dim">ETA</dt>
                  <dd className="text-sm text-cream">{quote.eta || '—'}</dd>
                </div>
                {quote.valid_until && (
                  <div>
                    <dt className="text-xs font-medium text-cream-dim">Valid until</dt>
                    <dd className="text-sm text-cream">{formatDateTime(quote.valid_until)}</dd>
                  </div>
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
                          <td className="py-1 text-right text-cream">R{Number(li.line_total || 0).toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
                {quote.tier === 2 && quote.status === 'pending' && !approving && (
                  <>
                    <button
                      type="button"
                      onClick={startApproving}
                      disabled={pending}
                      className="rounded-lg border border-green-500/30 px-3 py-1.5 text-xs font-medium text-green-400 hover:bg-green-500/10 disabled:opacity-60"
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      onClick={handleReject}
                      disabled={pending}
                      className="rounded-lg border border-red-500/30 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/10 disabled:opacity-60"
                    >
                      Reject
                    </button>
                  </>
                )}

                {approving && (
                  <div className="w-full rounded-lg border border-line bg-panel-2 p-3 sm:w-80">
                    <label className="mb-1 block text-[11px] font-medium text-cream-dim">
                      ETA (sent to customer with the quote)
                    </label>
                    <input
                      type="text"
                      value={etaDraft}
                      onChange={(e) => setEtaDraft(e.target.value)}
                      placeholder="e.g. 7-10 working days"
                      autoFocus
                      className="w-full rounded-md border border-line bg-panel px-2 py-1 text-xs text-cream placeholder:text-grey focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        onClick={confirmApprove}
                        disabled={pending}
                        className="flex-1 rounded-md bg-primary px-2 py-1 text-xs font-medium text-ink disabled:opacity-60"
                      >
                        {pending ? 'Sending…' : 'Confirm & Send'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setApproving(false)}
                        disabled={pending}
                        className="rounded-md border border-line px-2 py-1 text-xs text-cream-dim hover:bg-panel disabled:opacity-60"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {quote.tier === 2 && quote.status !== 'needs_pricing' && (
                  <button
                    type="button"
                    onClick={handleDownloadPdf}
                    disabled={pending}
                    className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-cream-dim hover:bg-panel-2 disabled:opacity-60"
                  >
                    Download PDF
                  </button>
                )}

                <select
                  value={OUTCOME_OPTIONS.includes(quote.status) ? quote.status : ''}
                  onChange={(e) => handleStatusChange(e.target.value)}
                  disabled={pending}
                  className="rounded-lg border border-line bg-panel-2 px-2 py-1.5 text-xs text-cream-dim focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60"
                >
                  <option value="" disabled hidden>
                    Mark as…
                  </option>
                  {OUTCOME_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt.charAt(0).toUpperCase() + opt.slice(1)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {tab === 'chat' && (
            <div className="rounded-xl border border-line bg-panel p-4 shadow-sm">
              {chatError && <ErrorMessage message={chatError} />}
              {!chatError && !chatLoaded && <LoadingSpinner label="Loading chat…" />}
              {!chatError && chatLoaded && messages.length === 0 && (
                <p className="py-10 text-center text-cream-dim">No messages yet.</p>
              )}
              {!chatError && chatLoaded && messages.length > 0 && (
                <div className="space-y-4">
                  {messages.map((msg) => (
                    <MessageBubble key={msg.id} msg={msg} />
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'attachments' && (
            <div className="rounded-xl border border-line bg-panel p-4 shadow-sm">
              {attachmentsError && <ErrorMessage message={attachmentsError} />}
              {!attachmentsError && !attachmentsLoaded && <LoadingSpinner label="Loading attachments…" />}
              {!attachmentsError && attachmentsLoaded && attachments.length === 0 && (
                <p className="py-10 text-center text-cream-dim">No designs or files received around this quote.</p>
              )}
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
