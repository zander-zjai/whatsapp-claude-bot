import { NavLink } from 'react-router-dom';
import { useClientAuth } from '../context/ClientAuthContext';

const BASE_NAV_ITEMS = [
  { to: '/client/dashboard', label: 'Dashboard', icon: '🏠' },
  { to: '/client/calls', label: 'Call Logs', icon: '📞' },
  { to: '/client/conversations', label: 'Conversations', icon: '💬' },
  { to: '/client/quotes', label: 'Quote Requests', icon: '📋' },
];

const PRICE_LIST_ITEM = { to: '/client/pricelist', label: 'Price List', icon: '💲' };
const SETTINGS_ITEM = { to: '/client/settings', label: 'Settings', icon: '⚙️' };

export default function ClientSidebar({ onNavigate }) {
  const { client, logout } = useClientAuth();

  const navItems = [...BASE_NAV_ITEMS, PRICE_LIST_ITEM, SETTINGS_ITEM];

  const linkClass = ({ isActive }) =>
    `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
      isActive ? 'bg-primary text-ink' : 'text-cream-dim hover:bg-primary-50 hover:text-primary'
    }`;

  return (
    <div className="flex h-full flex-col justify-between p-4">
      <div>
        <div className="mb-6 flex items-center gap-2 px-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-lg font-bold text-ink">
            Z
          </div>
          <div>
            <p className="truncate text-sm font-bold leading-tight text-cream">
              {client?.name || 'Client Portal'}
            </p>
            <p className="text-xs leading-tight text-cream-dim">Client Portal</p>
          </div>
        </div>

        <nav className="space-y-1">
          {navItems.map((item) => (
            <NavLink key={item.to} to={item.to} className={linkClass} onClick={onNavigate}>
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
      </div>

      <button
        type="button"
        onClick={logout}
        className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-cream-dim hover:bg-panel-2 hover:text-red-400"
      >
        <span>🚪</span>
        <span>Logout</span>
      </button>
    </div>
  );
}
