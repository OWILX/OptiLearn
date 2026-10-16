import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useProfile } from '@/context/ProfileContext';
import { RouteLoading } from '@/components/layout/RouteLoading';

/**
 * Redirects authenticated users with no department to the picker.
 *
 * Sits inside ProtectedRoute (auth already guaranteed) and wraps the
 * AppShell. The picker route itself is NOT under this guard.
 *
 * Preserves the requested URL so we can send the user back after they
 * choose. Currently unused, but the location object is here for later.
 */
export function RequireDepartment() {
  const { profile, loading, error } = useProfile();
  const location = useLocation();

  // While the profile is still loading, show a spinner.
  if (loading) return <RouteLoading />;

  // If the profile failed to load entirely, don't lock the user out —
  // let them into the app. Individual screens handle their own errors.
  if (error) return <Outlet />;

  // No profile row yet (shouldn't happen — getMyProfile self-heals).
  if (!profile) return <Outlet />;

  // Signed in but no department picked yet.
  if (!profile.department) {
    return (
      <Navigate
        to="/choose-department"
        replace
        state={{ from: location.pathname }}
      />
    );
  }

  return <Outlet />;
}
