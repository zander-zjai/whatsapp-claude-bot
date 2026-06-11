import { Link } from 'react-router-dom';
import { formatDate } from '../utils/format';

export default function ClientTable({ clients, onToggleActive, onDelete }) {
  if (clients.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 bg-white py-16 text-center text-gray-500">
        No clients yet.{' '}
        <Link to="/clients/new" className="font-medium text-primary hover:underline">
          Add your first client
        </Link>
        .
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
      <table className="min-w-full divide-y divide-gray-200 text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left font-semibold text-gray-600">Client</th>
            <th className="px-4 py-3 text-left font-semibold text-gray-600">Business Type</th>
            <th className="px-4 py-3 text-left font-semibold text-gray-600">WhatsApp Number ID</th>
            <th className="px-4 py-3 text-left font-semibold text-gray-600">Status</th>
            <th className="px-4 py-3 text-left font-semibold text-gray-600">Messages Today</th>
            <th className="px-4 py-3 text-left font-semibold text-gray-600">Date Added</th>
            <th className="px-4 py-3 text-right font-semibold text-gray-600">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {clients.map((client) => (
            <tr key={client.id} className="hover:bg-gray-50">
              <td className="px-4 py-3 font-medium text-gray-900">{client.name}</td>
              <td className="px-4 py-3 text-gray-600">{client.business_type || '—'}</td>
              <td className="px-4 py-3 font-mono text-xs text-gray-600">{client.phone_number_id}</td>
              <td className="px-4 py-3">
                <button
                  type="button"
                  onClick={() => onToggleActive(client)}
                  className="switch"
                  data-on={client.active}
                  title={client.active ? 'Active — click to deactivate' : 'Inactive — click to activate'}
                >
                  <span />
                </button>
              </td>
              <td className="px-4 py-3 text-gray-600">{client.messages_today ?? 0}</td>
              <td className="px-4 py-3 text-gray-600">{formatDate(client.created_at)}</td>
              <td className="px-4 py-3">
                <div className="flex justify-end gap-3 whitespace-nowrap">
                  <Link to={`/clients/edit/${client.id}`} className="font-medium text-primary hover:underline">
                    Edit
                  </Link>
                  <Link to={`/clients/${client.id}/logs`} className="font-medium text-primary hover:underline">
                    View Logs
                  </Link>
                  <button
                    type="button"
                    onClick={() => onDelete(client)}
                    className="font-medium text-red-600 hover:underline"
                  >
                    Delete
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
