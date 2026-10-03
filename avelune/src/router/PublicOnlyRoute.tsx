import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { RouteLoading } from '@/components/layout/RouteLoading';

export function PublicOnlyRoute() {
  const { session, initializing } = useAuth();

  if (initializing) return <RouteLoading />;
  if (session) return <Navigate to="/home" replace />;
  return <Outlet />;
}
