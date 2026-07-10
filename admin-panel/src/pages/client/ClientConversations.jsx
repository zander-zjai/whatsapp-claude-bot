import { useEffect, useRef, useState } from 'react';
import ClientLayout from '../../components/ClientLayout';
import {
  getClientConversations,
  getClientConversation,
  setClientConversationHandover,
  sendClientMessage,
  getClientAttachmentBlob,
} from '../../api/clientPortalEndpoints';
import { getErrorMessage } from '../../api/client';
import { maskPhoneNumber } from '../../utils/format';

// --- Helpers ---

function relativeTime(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d === 1) return 'Yesterday';
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' });
}

function formatMsgTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' });
}

function ConvRow({ conv, selected, onClick }) {
  const isSelected = selected && selected.customer_number === conv.customer_number;
  const displayName = conv.customer_name || maskPhoneNumber(conv.customer_number);
  const leadTemp = conv.lead_temperature;

  return (
    <button
      type="button"
      onClick={() => onClick(conv)}
      className={`relative w-full text-left px-4 py-3 border-b border-line transition-colors ${
        isSelected ? 'bg-primary/10 border-l-2 border-l-primary' : 'hover:bg-panel-2'
      }`}
    >
      {conv.unread_count > 0 && (
        <span className="absolute left-1 top-1/2 -translate-y-1/2 h-2 w-2 rounded-full bg-primary" />
      )}
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-medium text-cream">{displayName}</span>
        <span className="shrink-0 text-xs text-cream-dim">{relativeTime(conv.last_message_at)}</span>
      </div>
      <div className="flex items-center justify-between gap-2 mt-0.5">
        <span className="truncate text-xs text-cream-dim">{conv.last_message_preview || ''}</span>
        {leadTemp && (
          <span
            className={`shrink-0 text-xs font-medium capitalize px-1.5 py-0.5 rounded-full ${
              leadTemp === 'hot' ? 'bg-red-500/20 text-red-400' :
              leadTemp === 'warm' ? 'bg-orange-500/20 text-orange-400' :
              'bg-panel-2 text-cream-dim'
            }`}
          >
            {leadTemp}
          </span>
        )}
      </div>
    </button>
  );
}

function AttachmentImage({ attachmentId }) {
  const [src, setSrc] = useState(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    let url;
    getClientAttachmentBlob(attachmentId)
      .then((blob) => {
        url = URL.createObjectURL(blob);
        setSrc(url);
      })
      .catch(() => setErr(true));
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [attachmentId]);

  if (err) return <span className="text-xs text-cream-dim italic">📎 Attachment</span>;
  if (!src) return <span className="text-xs text-cream-dim italic">Loading image…</span>;
  return (
    <img
      src={src}
      alt="Customer attachment"
      className="max-w-[240px] max-h-[180px] rounded-lg object-contain cursor-pointer"
      onClick={() => window.open(src, '_blank')}
    />
  );
}

function ChatBubble({ msg }) {
  const isOwner = msg.sender === 'owner';
  const isUser = msg.role === 'user';
  const isSystem = msg.role === 'system';

  if (isSystem) {
    return (
      <div className="flex justify-center my-2">
        <span className="text-xs text-cream-dim bg-panel-2 rounded-full px-3 py-1">
          {msg.content || msg.bot_reply}
        </span>
      </div>
    );
  }

  if (isUser) {
    return (
      <div className="flex justify-start mb-3">
        <div className="max-w-[70%]">
          <div className="rounded-2xl rounded-tl-sm bg-panel-2 border border-line px-3 py-2 text-sm text-cream">
            {msg.attachment_id ? (
              <AttachmentImage attachmentId={msg.attachment_id} />
            ) : null}
            {msg.content || msg.customer_message}
          </div>
          <span className="mt-1 block text-xs text-cream-dim">{formatMsgTime(msg.timestamp)}</span>
        </div>
      </div>
    );
  }

  // assistant / owner reply
  const label = isOwner ? 'You' : (msg.bot_name || 'Zara');
  return (
    <div className="flex justify-end mb-3">
      <div className="max-w-[70%]">
        <div className="rounded-2xl rounded-tr-sm bg-primary px-3 py-2 text-sm text-ink">
          {msg.content || msg.bot_reply}
        </div>
        <span className="mt-1 block text-right text-xs text-cream-dim">
          {label} · {formatMsgTime(msg.timestamp)}
        </span>
      </div>
    </div>
  );
}

export default function ClientConversations() {
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);
  const [messages, setMessages] = useState([]);
  const [msgLoading, setMsgLoading] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [handoverPending, setHandoverPending] = useState(false);
  const messagesEndRef = useRef(null);

  async function loadConversations() {
    setLoading(true);
    setError('');
    try {
      const data = await getClientConversations();
      const sorted = [...data].sort(
        (a, b) => new Date(b.last_message_at || 0) - new Date(a.last_message_at || 0)
      );
      setConversations(sorted);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load conversations'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadConversations();
  }, []);

  async function selectConversation(conv) {
    setSelected(conv);
    setMessages([]);
    setMsgLoading(true);
    try {
      const data = await getClientConversation(conv.customer_number);
      const msgs = [];
      for (const log of (data.messages || [])) {
        if (log.customer_message) {
          msgs.push({
            id: log.id + '-in',
            role: 'user',
            customer_message: log.customer_message,
            attachment_id: log.attachment_id || null,
            timestamp: log.timestamp,
          });
        }
        if (log.bot_reply && log.status !== 'handover') {
          msgs.push({
            id: log.id + '-out',
            role: 'assistant',
            bot_reply: log.bot_reply,
            sender: log.sender,
            timestamp: log.timestamp,
          });
        }
      }
      setMessages(msgs);
    } catch {
      // ignore
    } finally {
      setMsgLoading(false);
    }
  }

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  async function handleToggleHandover() {
    if (!selected || handoverPending) return;
    setHandoverPending(true);
    try {
      const updated = await setClientConversationHandover(selected.customer_number, !selected.handover_active);
      setSelected(updated);
      setConversations((prev) =>
        prev.map((c) => (c.customer_number === updated.customer_number ? updated : c))
      );
    } catch {
      // silent
    } finally {
      setHandoverPending(false);
    }
  }

  async function handleSend() {
    if (!replyText.trim() || !selected || sending) return;
    const text = replyText.trim();
    setReplyText('');
    setSending(true);
    const optimistic = {
      id: 'opt-' + Date.now(),
      role: 'assistant',
      bot_reply: text,
      sender: 'owner',
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    try {
      await sendClientMessage(selected.customer_number, text);
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
      setReplyText(text);
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e) {
    if (!e.shiftKey && e.key === 'Enter') {
      e.preventDefault();
      handleSend();
    }
  }

  const filtered = conversations.filter((c) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (c.customer_name || '').toLowerCase().includes(q) ||
      (c.customer_number || '').includes(q)
    );
  });

  const displayName = selected
    ? (selected.customer_name || maskPhoneNumber(selected.customer_number))
    : null;

  return (
    <ClientLayout title="Conversations">
      <div
        className="flex rounded-xl border border-line overflow-hidden bg-panel shadow-sm"
        style={{ height: 'calc(100vh - 130px)' }}
      >
        {/* Left panel */}
        <div className="w-72 shrink-0 border-r border-line flex flex-col">
          <div className="p-3 border-b border-line">
            <input
              type="text"
              placeholder="Search conversations…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-line bg-panel-2 px-3 py-1.5 text-sm text-cream placeholder-cream-dim focus:outline-none focus:border-primary"
            />
          </div>
          <div className="flex-1 overflow-y-auto">
            {loading && <div className="p-4 text-sm text-cream-dim">Loading…</div>}
            {!loading && error && <div className="p-4 text-sm text-red-400">{error}</div>}
            {!loading && !error && filtered.length === 0 && (
              <div className="p-4 text-sm text-cream-dim">No conversations yet.</div>
            )}
            {filtered.map((conv) => (
              <ConvRow
                key={conv.customer_number}
                conv={conv}
                selected={selected}
                onClick={selectConversation}
              />
            ))}
          </div>
        </div>

        {/* Right panel */}
        {!selected ? (
          <div className="flex-1 flex items-center justify-center text-cream-dim text-sm">
            Select a conversation to view messages.
          </div>
        ) : (
          <div className="flex-1 flex flex-col min-w-0">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-line bg-panel-2 shrink-0">
              <div>
                <p className="font-semibold text-cream text-sm">{displayName}</p>
                <p className="text-xs text-cream-dim">{maskPhoneNumber(selected.customer_number)}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-xs ${selected.handover_active ? 'text-primary' : 'text-green-400'}`}>
                  {selected.handover_active ? '● You are handling' : '● Zara is handling'}
                </span>
                <button
                  type="button"
                  disabled={handoverPending}
                  onClick={handleToggleHandover}
                  className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-cream-dim hover:bg-panel disabled:opacity-60"
                >
                  {selected.handover_active ? 'Hand back to Zara' : 'Take over'}
                </button>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-4 py-4">
              {msgLoading && <div className="text-sm text-cream-dim">Loading messages…</div>}
              {!msgLoading && messages.length === 0 && (
                <div className="text-sm text-cream-dim">No messages yet.</div>
              )}
              {messages.map((msg) => (
                <ChatBubble key={msg.id} msg={msg} />
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Reply box */}
            <div className="border-t border-line p-3 shrink-0 flex gap-2 items-end">
              <textarea
                rows={2}
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type a message… (Enter to send)"
                className="flex-1 rounded-lg border border-line bg-panel-2 px-3 py-2 text-sm text-cream placeholder-cream-dim resize-none focus:outline-none focus:border-primary"
              />
              <button
                type="button"
                onClick={handleSend}
                disabled={sending || !replyText.trim()}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-ink hover:bg-primary/90 disabled:opacity-50"
              >
                Send
              </button>
            </div>
          </div>
        )}
      </div>
    </ClientLayout>
  );
}
