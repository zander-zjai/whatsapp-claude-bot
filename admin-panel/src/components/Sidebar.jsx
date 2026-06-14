import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', icon: '🏠' },
  { to: '/clients', label: 'Clients', icon: '👥' },
  { to: '/clients/new', label: 'Add New Client', icon: '➕' },
  { to: '/conversations', label: 'Conversations', icon: '💬' },
  { to: '/quotes', label: 'Quote Requests', icon: '📋' },
  { to: '/settings', label: 'Settings', icon: '⚙️' },
];

export default function Sidebar({ onNavigate }) {
  const { logout } = useAuth();

  const linkClass = ({ isActive }) =>
    `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
      isActive ? 'bg-primary text-white' : 'text-gray-700 hover:bg-primary-50 hover:text-primary'
    }`;

  return (
    <div className="flex h-full flex-col justify-between p-4">
      <div>
        <div className="mb-6 flex items-center gap-2 px-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-lg font-bold text-white">
            Z
          </div>
          <div>
            <p className="text-sm font-bold leading-tight text-gray-900">ZJAI Technologies</p>
            <p className="text-xs leading-tight text-gray-500">Admin Panel</p>
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
        className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-red-50 hover:text-red-600"
      >
        <span>🚪</span>
        <span>Logout</span>
      </button>
    </div>
  );
}
