import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import ClientLayout from '../../components/ClientLayout';
import LoadingSpinner from '../../components/LoadingSpinner';
import ErrorMessage from '../../components/ErrorMessage';
import MessageBubble from '../../components/MessageBubble';
import { getClientConversation, setClientConversationHandover } from '../../api/clientPortalEndpoints';
import { getErrorMessage } from '../../api/client';
import { maskPhoneNumber, formatDateTime } from '../../utils/format';

function conversationStatus(conv) {
  if (conv.handover_active) return 'handover';
  if (conv.awaiting_human) return 'awaiting_human';
  return 'active';
}

const STATUS_LABELS = {
  active: 'Active',
  awaiting_human: 'Awaiting Human',
  handover: 'Handover',
};

const STATUS_CLASSES = {
  active: 'bg-green-100 text-green-700',
  awaiting_human: 'bg-yellow-100 text-yellow-700',
  handover: 'bg-blue-100 text-blue-700',
};

const LEAD_CLASSES = {
  hot: 'bg-red-100 text-red-700',
  warm: 'bg-orange-100 text-orange-700',
  cold: 'bg-panel-2 text-cream-dim',
};

const PRIORITY_CLASSES = {
  high: 'bg-red-100 text-red-700',
  medium: 'bg-orange-100 text-orange-700',
  low: 'bg-panel-2 text-cream-dim',
};

export default function ClientConversationDetail() {
  const { customerNumber } = useParams();

  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [pending, setPending] = useState(false);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const data = await getClientConversation(customerNumber);
      setConversation(data.conversation);
      setMessages(data.messages);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load conversation'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [customerNumber]);

  async function handleToggleHandover() {
    if (!conversation) return;
    setActionError('');
    setPending(true);
    try {
      const updated = await setClientConversationHandover(
        conversation.customer_number,
        !conversation.handover_active
      );
      setConversation(updated);
    } catch (err) {
      setActionError(getErrorMessage(err, 'Failed to update handover status'));
    } finally {
      setPending(false);
    }
  }

  const status = conversation ? conversationStatus(conversation) : null;
  const failedCount = messages.filter((m) => m.status === 'failed').length;

  return (
    <ClientLayout title="Conversation">
      <div className="mb-4">
        <Link to="/client/conversations" className="text-sm font-medium text-primary hover:underline">
          ← Back to Conversations
        </Link>
      </div>

      {loading && <LoadingSpinner label="Loading conversation…" />}
      {!loading && error && <ErrorMessage message={error} />}

      {!loading && !error && conversation && (
        <>
          <div className="mb-4 flex flex-col gap-3 rounded-xl border border-line bg-panel p-4 shadow-sm sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-base font-semibold text-cream">
                {conversation.customer_name || 'Unknown customer'}
              </p>
              <p className="font-mono text-xs text-cream-dim">{maskPhoneNumber(conversation.customer_number)}</p>
              <p className="mt-1 text-xs text-cream-dim">Last active: {formatDateTime(conversation.last_message_at)}</p>

              <div className="mt-2 flex flex-wrap items-center gap-2">
                {conversation.lead_temperature && (
                  <span
                    className={`rounded-full px-2 py-1 text-xs font-medium capitalize ${LEAD_CLASSES[conversation.lead_temperature]}`}
                    title={conversation.lead_reason || ''}
                  >
                    {conversation.lead_temperature} lead
                  </span>
                )}
                {conversation.priority && (
                  <span className={`rounded-full px-2 py-1 text-xs font-medium capitalize ${PRIORITY_CLASSES[conversation.priority]}`}>
                    {conversation.priority} priority
                  </span>
                )}
                {failedCount > 0 && (
                  <span className="rounded-full bg-red-100 px-2 py-1 text-xs font-medium text-red-700">
                    {failedCount} failed repl{failedCount === 1 ? 'y' : 'ies'}
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3">
              <span className={`rounded-full px-2 py-1 text-xs font-medium ${STATUS_CLASSES[status]}`}>
                {STATUS_LABELS[status]}
              </span>
              <button
                type="button"
                onClick={handleToggleHandover}
                disabled={pending}
                className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-cream-dim hover:bg-panel-2 disabled:opacity-60"
              >
                {conversation.handover_active ? 'Release to Zara' : 'Take Over'}
              </button>
            </div>
          </div>

          {actionError && (
            <div className="mb-4">
              <ErrorMessage message={actionError} />
            </div>
          )}

          <div className="rounded-xl border border-line bg-panel p-4 shadow-sm">
            {messages.length === 0 ? (
              <p className="py-10 text-center text-cream-dim">No messages yet.</p>
            ) : (
              <div className="space-y-4">
                {messages.map((msg) => <MessageBubble key={msg.id} msg={msg} />)}
              </div>
            )}
          </div>
        </>
      )}
    </ClientLayout>
  );
}
