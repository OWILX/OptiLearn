import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { RouteLoading } from '@/components/layout/RouteLoading';
import { rememberReturnTo } from '@/utils/returnTo';

export function ProtectedRoute() {
  const { session, initializing } = useAuth();
  const location = useLocation();

  if (initializing) return <RouteLoading />;
  if (!session) {
    rememberReturnTo(location.pathname + location.search);
    return <Navigate to="/login" replace />;
  }
  return <Outlet />;
}
