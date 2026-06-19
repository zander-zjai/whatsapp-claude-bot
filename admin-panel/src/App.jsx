import { Navigate, Route, Routes } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';
import ClientProtectedRoute from './components/ClientProtectedRoute';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Clients from './pages/Clients';
import AddClient from './pages/AddClient';
import EditClient from './pages/EditClient';
import ClientLogs from './pages/ClientLogs';
import Conversations from './pages/Conversations';
import QuoteRequests from './pages/QuoteRequests';
import Billing from './pages/Billing';
import Settings from './pages/Settings';
import ClientLogin from './pages/client/ClientLogin';
import ClientDashboard from './pages/client/ClientDashboard';
import ClientConversations from './pages/client/ClientConversations';
import ClientConversationDetail from './pages/client/ClientConversationDetail';
import ClientQuotes from './pages/client/ClientQuotes';
import ClientPriceList from './pages/client/ClientPriceList';
import ClientSettings from './pages/client/ClientSettings';
import ClientCallLogs from './pages/client/ClientCallLogs';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route element={<ProtectedRoute />}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/clients" element={<Clients />} />
        <Route path="/clients/new" element={<AddClient />} />
        <Route path="/clients/edit/:id" element={<EditClient />} />
        <Route path="/clients/:id/logs" element={<ClientLogs />} />
        <Route path="/conversations" element={<Conversations />} />
        <Route path="/quotes" element={<QuoteRequests />} />
        <Route path="/billing" element={<Billing />} />
        <Route path="/settings" element={<Settings />} />
      </Route>

      <Route path="/client/login" element={<ClientLogin />} />

      <Route element={<ClientProtectedRoute />}>
        <Route path="/client/dashboard" element={<ClientDashboard />} />
        <Route path="/client/calls" element={<ClientCallLogs />} />
        <Route path="/client/conversations" element={<ClientConversations />} />
        <Route path="/client/conversations/:customerNumber" element={<ClientConversationDetail />} />
        <Route path="/client/quotes" element={<ClientQuotes />} />
        <Route path="/client/pricelist" element={<ClientPriceList />} />
        <Route path="/client/settings" element={<ClientSettings />} />
      </Route>

      <Route path="/client" element={<Navigate to="/client/dashboard" replace />} />
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
