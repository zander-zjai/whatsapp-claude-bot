import { useEffect, useState } from 'react';
import Layout from '../components/Layout';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorMessage from '../components/ErrorMessage';
import { getConversations, getClients, setConversationHandover } from '../api/endpoints';
import { getErrorMessage } from '../api/client';
import { maskPhoneNumber, truncate, formatDateTime } from '../utils/format';

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
  cold: 'bg-gray-100 text-gray-500',
};

function LeadBadge({ temperature, reason }) {
  if (!temperature) return <span className="text-xs text-gray-400">—</span>;
  return (
    <span
      className={`rounded-full px-2 py-1 text-xs font-medium capitalize ${LEAD_CLASSES[temperature]}`}
      title={reason || ''}
    >
      {temperature}
    </span>
  );
}

const PRIORITY_CLASSES = {
  high: 'bg-red-100 text-red-700',
  medium: 'bg-orange-100 text-orange-700',
  low: 'bg-gray-100 text-gray-500',
};

function PriorityBadge({ priority }) {
  if (!priority) return <span className="text-xs text-gray-400">—</span>;
  return (
    <span className={`rounded-full px-2 py-1 text-xs font-medium capitalize ${PRIORITY_CLASSES[priority]}`}>
      {priority}
    </span>
  );
}

function conversationKey(conv) {
  return `${conv.client_id}:${conv.customer_number}`;
}

export default function Conversations() {
  const [conversations, setConversations] = useState([]);
  const [clientNames, setClientNames] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [pendingKey, setPendingKey] = useState(null);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [conversationsData, clients] = await Promise.all([getConversations(), getClients()]);
      setConversations(conversationsData);
      setClientNames(Object.fromEntries(clients.map((c) => [c.id, c.name])));
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load conversations'));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleToggleHandover(conv) {
    const key = conversationKey(conv);
    setActionError('');
    setPendingKey(key);
    try {
      const updated = await setConversationHandover(
        conv.client_id,
        conv.customer_number,
        !conv.handover_active
      );
      setConversations((prev) => prev.map((c) => (conversationKey(c) === key ? updated : c)));
    } catch (err) {
      setActionError(getErrorMessage(err, 'Failed to update handover status'));
    } finally {
      setPendingKey(null);
    }
  }

  return (
    <Layout title="Conversations">
      <p className="mb-4 text-sm text-gray-500">{conversations.length} conversation(s)</p>

      {actionError && (
        <div className="mb-4">
          <ErrorMessage message={actionError} />
        </div>
      )}

      {loading && <LoadingSpinner label="Loading conversations…" />}
      {!loading && error && <ErrorMessage message={error} />}

      {!loading && !error && (
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Client</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Customer</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Last Message</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Last Active</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Priority</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Lead</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Status</th>
                <th className="px-4 py-3 text-left font-semibold text-gray-600">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {conversations.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-gray-500">
                    No conversations yet.
                  </td>
                </tr>
              )}
              {conversations.map((conv) => {
                const status = conversationStatus(conv);
                const key = conversationKey(conv);
                return (
                  <tr key={key} className="hover:bg-gray-50">
                    <td className="whitespace-nowrap px-4 py-3 text-gray-800">
                      {clientNames[conv.client_id] || conv.client_id}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-gray-600">
                      {conv.customer_name
                        ? `${conv.customer_name} (${maskPhoneNumber(conv.customer_number)})`
                        : maskPhoneNumber(conv.customer_number)}
                    </td>
                    <td className="px-4 py-3 text-gray-800" title={conv.last_message_preview}>
                      {truncate(conv.last_message_preview, 50)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-gray-600">
                      {formatDateTime(conv.last_message_at)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <PriorityBadge priority={conv.priority} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <LeadBadge temperature={conv.lead_temperature} reason={conv.lead_reason} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span className={`rounded-full px-2 py-1 text-xs font-medium ${STATUS_CLASSES[status]}`}>
                        {STATUS_LABELS[status]}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <button
                        type="button"
                        onClick={() => handleToggleHandover(conv)}
                        disabled={pendingKey === key}
                        className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                      >
                        {conv.handover_active ? 'Release to Zara' : 'Take Over'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Layout>
  );
}
