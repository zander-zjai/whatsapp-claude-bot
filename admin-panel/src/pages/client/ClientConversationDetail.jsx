import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import ClientLayout from '../../components/ClientLayout';
import LoadingSpinner from '../../components/LoadingSpinner';
import ErrorMessage from '../../components/ErrorMessage';
import { getClientConversation, setClientConversationHandover } from '../../api/clientPortalEndpoints';
import { getErrorMessage } from '../../api/client';
import { maskPhoneNumber, truncate, formatDateTime } from '../../utils/format';

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
          <div className="mb-4 flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-base font-semibold text-gray-900">
                {conversation.customer_name || 'Unknown customer'}
              </p>
              <p className="font-mono text-xs text-gray-500">{maskPhoneNumber(conversation.customer_number)}</p>
              <p className="mt-1 text-xs text-gray-500">Last active: {formatDateTime(conversation.last_message_at)}</p>
            </div>

            <div className="flex items-center gap-3">
              <span className={`rounded-full px-2 py-1 text-xs font-medium ${STATUS_CLASSES[status]}`}>
                {STATUS_LABELS[status]}
              </span>
              <button
                type="button"
                onClick={handleToggleHandover}
                disabled={pending}
                className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
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

          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">Timestamp</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">Customer Message</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">Reply</th>
                  <th className="px-4 py-3 text-left font-semibold text-gray-600">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {messages.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-10 text-center text-gray-500">
                      No messages yet.
                    </td>
                  </tr>
                )}
                {messages.map((msg) => (
                  <tr key={msg.id} className="hover:bg-gray-50">
                    <td className="whitespace-nowrap px-4 py-3 text-gray-600">{formatDateTime(msg.timestamp)}</td>
                    <td className="px-4 py-3 text-gray-800" title={msg.customer_message}>
                      {truncate(msg.customer_message, 80)}
                    </td>
                    <td className="px-4 py-3 text-gray-800" title={msg.bot_reply}>
                      {truncate(msg.bot_reply, 80)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span
                        className={`rounded-full px-2 py-1 text-xs font-medium ${
                          msg.status === 'success'
                            ? 'bg-green-100 text-green-700'
                            : msg.status === 'handover'
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-red-100 text-red-700'
                        }`}
                      >
                        {msg.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </ClientLayout>
  );
}
