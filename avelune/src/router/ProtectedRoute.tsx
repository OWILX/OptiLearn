import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { RouteLoading } from '@/components/layout/RouteLoading';

export function ProtectedRoute() {
  const { session, initializing } = useAuth();

  if (initializing) return <RouteLoading />;
  if (!session) return <Navigate to="/login" replace />;
  return <Outlet />;
}
