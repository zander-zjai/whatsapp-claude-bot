import { Link } from 'react-router-dom';
import { formatDate } from '../utils/format';
import { SERVICE_PACKAGES } from '../utils/constants';

function ServiceBadges({ servicePackage }) {
  const pkg = SERVICE_PACKAGES.find((p) => p.value === servicePackage);
  if (!pkg) return <span className="text-grey text-xs">—</span>;
  const features = pkg.features || [];
  return (
    <div className="flex flex-wrap gap-1">
      {features.includes('vapi') && (
        <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700">
          📞 AI Receptionist
        </span>
      )}
      {features.includes('whatsapp') && (
        <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
          💬 WhatsApp Bot
        </span>
      )}
    </div>
  );
}

export default function ClientTable({ clients, onToggleActive, onDelete }) {
  if (clients.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-line bg-panel py-16 text-center text-cream-dim">
        No clients yet.{' '}
        <Link to="/clients/new" className="font-medium text-primary hover:underline">
          Add your first client
        </Link>
        .
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-line bg-panel shadow-sm">
      <table className="min-w-full divide-y divide-line text-sm">
        <thead className="bg-panel-2">
          <tr>
            <th className="px-4 py-3 text-left font-semibold text-cream-dim">Client</th>
            <th className="px-4 py-3 text-left font-semibold text-cream-dim">Services</th>
            <th className="px-4 py-3 text-left font-semibold text-cream-dim">Status</th>
            <th className="px-4 py-3 text-left font-semibold text-cream-dim">Msgs Today</th>
            <th className="px-4 py-3 text-left font-semibold text-cream-dim">Date Added</th>
            <th className="px-4 py-3 text-right font-semibold text-cream-dim">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {clients.map((client) => (
            <tr key={client.id} className="hover:bg-panel-2">
              <td className="px-4 py-3">
                <p className="font-medium text-cream">{client.name}</p>
                <p className="text-xs text-grey">{client.contact_person}</p>
              </td>
              <td className="px-4 py-3">
                <ServiceBadges servicePackage={client.service_package} />
              </td>
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
              <td className="px-4 py-3 text-cream-dim">{client.messages_today ?? 0}</td>
              <td className="px-4 py-3 text-cream-dim">{formatDate(client.created_at)}</td>
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
