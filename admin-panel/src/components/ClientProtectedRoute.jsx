import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useClientAuth } from '../context/ClientAuthContext';

export default function ClientProtectedRoute() {
  const { isAuthenticated } = useClientAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/client/login" replace state={{ from: location }} />;
  }

  return <Outlet />;
}
