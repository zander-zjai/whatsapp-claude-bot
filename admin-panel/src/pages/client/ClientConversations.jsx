import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import ClientLayout from '../../components/ClientLayout';
import LoadingSpinner from '../../components/LoadingSpinner';
import ErrorMessage from '../../components/ErrorMessage';
import {
  getClientConversations,
  setClientConversationHandover,
  setClientConversationPriority,
} from '../../api/clientPortalEndpoints';
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

const LEAD_CLASSES = {
  hot: 'bg-red-100 text-red-700',
  warm: 'bg-orange-100 text-orange-700',
  cold: 'bg-panel-2 text-cream-dim',
};

function LeadBadge({ temperature, reason }) {
  if (!temperature) return <span className="text-xs text-grey">—</span>;
  return (
    <span
      className={`rounded-full px-2 py-1 text-xs font-medium capitalize ${LEAD_CLASSES[temperature]}`}
      title={reason || ''}
    >
      {temperature}
    </span>
  );
}

const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };
const PRIORITY_SELECT_CLASSES = {
  high: 'border-red-500/30 bg-red-500/10 text-red-400',
  medium: 'border-orange-500/30 bg-orange-500/10 text-orange-400',
  low: 'border-line bg-panel-2 text-cream-dim',
};

function sortByPriority(conversations) {
  return [...conversations].sort((a, b) => {
    const pa = PRIORITY_ORDER[a.priority] ?? 3;
    const pb = PRIORITY_ORDER[b.priority] ?? 3;
    if (pa !== pb) return pa - pb;
    return new Date(b.updated_at) - new Date(a.updated_at);
  });
}

export default function ClientConversations() {
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [pendingNumber, setPendingNumber] = useState(null);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const data = await getClientConversations();
      setConversations(data);
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
    setActionError('');
    setPendingNumber(conv.customer_number);
    try {
      const updated = await setClientConversationHandover(conv.customer_number, !conv.handover_active);
      setConversations((prev) =>
        prev.map((c) => (c.customer_number === conv.customer_number ? updated : c))
      );
    } catch (err) {
      setActionError(getErrorMessage(err, 'Failed to update handover status'));
    } finally {
      setPendingNumber(null);
    }
  }

  async function handlePriorityChange(conv, priority) {
    setActionError('');
    try {
      const updated = await setClientConversationPriority(conv.customer_number, priority);
      setConversations((prev) =>
        prev.map((c) => (c.customer_number === conv.customer_number ? updated : c))
      );
    } catch (err) {
      setActionError(getErrorMessage(err, 'Failed to update priority'));
    }
  }

  return (
    <ClientLayout title="Conversations">
      <p className="mb-4 text-sm text-cream-dim">{conversations.length} conversation(s)</p>

      {actionError && (
        <div className="mb-4">
          <ErrorMessage message={actionError} />
        </div>
      )}

      {loading && <LoadingSpinner label="Loading conversations…" />}
      {!loading && error && <ErrorMessage message={error} />}

      {!loading && !error && (
        <div className="overflow-x-auto rounded-xl border border-line bg-panel shadow-sm">
          <table className="min-w-full divide-y divide-line text-sm">
            <thead className="bg-panel-2">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-cream-dim">Customer</th>
                <th className="px-4 py-3 text-left font-semibold text-cream-dim">Last Message</th>
                <th className="px-4 py-3 text-left font-semibold text-cream-dim">Last Active</th>
                <th className="px-4 py-3 text-left font-semibold text-cream-dim">Priority</th>
                <th className="px-4 py-3 text-left font-semibold text-cream-dim">Lead</th>
                <th className="px-4 py-3 text-left font-semibold text-cream-dim">Status</th>
                <th className="px-4 py-3 text-left font-semibold text-cream-dim">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {conversations.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-cream-dim">
                    No conversations yet.
                  </td>
                </tr>
              )}
              {sortByPriority(conversations).map((conv) => {
                const status = conversationStatus(conv);
                return (
                  <tr key={conv.customer_number} className="hover:bg-panel-2">
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-cream-dim">
                      <Link
                        to={`/client/conversations/${encodeURIComponent(conv.customer_number)}`}
                        className="text-primary hover:underline"
                      >
                        {conv.customer_name
                          ? `${conv.customer_name} (${maskPhoneNumber(conv.customer_number)})`
                          : maskPhoneNumber(conv.customer_number)}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-cream" title={conv.last_message_preview}>
                      {truncate(conv.last_message_preview, 50)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-cream-dim">
                      {formatDateTime(conv.last_message_at)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <select
                        value={conv.priority || ''}
                        onChange={(e) => handlePriorityChange(conv, e.target.value || null)}
                        className={`rounded-lg border px-2 py-1 text-xs font-medium capitalize ${
                          conv.priority ? PRIORITY_SELECT_CLASSES[conv.priority] : 'border-line bg-panel-2 text-cream-dim'
                        }`}
                      >
                        <option value="">None</option>
                        <option value="high">High</option>
                        <option value="medium">Medium</option>
                        <option value="low">Low</option>
                      </select>
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
                        disabled={pendingNumber === conv.customer_number}
                        className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-cream-dim hover:bg-panel-2 disabled:opacity-60"
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
    </ClientLayout>
  );
}
