import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { RouteLoading } from '@/components/layout/RouteLoading';
import { takeReturnTo } from '@/utils/returnTo';

export function PublicOnlyRoute() {
  const { session, initializing } = useAuth();

  if (initializing) return <RouteLoading />;
  if (session) return <Navigate to={takeReturnTo() ?? '/home'} replace />;
  return <Outlet />;
}