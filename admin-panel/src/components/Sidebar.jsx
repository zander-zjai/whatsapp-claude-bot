import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', icon: '🏠' },
  { to: '/clients', label: 'Clients', icon: '👥' },
  { to: '/clients/new', label: 'Add New Client', icon: '➕' },
  { to: '/conversations', label: 'Conversations', icon: '💬' },
  { to: '/quotes', label: 'Quote Requests', icon: '📋' },
  { to: '/billing', label: 'Billing', icon: '💰' },
  { to: '/settings', label: 'Settings', icon: '⚙️' },
];

export default function Sidebar({ onNavigate }) {
  const { logout } = useAuth();

  const linkClass = ({ isActive }) =>
    `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
      isActive ? 'bg-primary text-ink' : 'text-cream-dim hover:bg-primary-50 hover:text-primary'
    }`;

  return (
    <div className="flex h-full flex-col justify-between p-4">
      <div>
        <div className="mb-6 flex items-center gap-2 px-2">
          <img src="/icon-192.png" alt="ZJAI" className="h-9 w-9 rounded-lg" />
          <div>
            <p className="text-sm font-bold leading-tight text-cream">ZJAI Technologies</p>
            <p className="text-xs leading-tight text-cream-dim">Admin Panel</p>
          </div>
        </div>

        <nav className="space-y-1">
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.to === '/clients'} className={linkClass} onClick={onNavigate}>
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
