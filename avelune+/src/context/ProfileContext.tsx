import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useAuth } from '@/context/AuthContext';
import {
  profileService,
  type Department,
  type Profile,
  type ProfilePatch,
} from '@/services/profile/profileService';
import {
  planService,
  type PlanSummary,
} from '@/services/plans/planService';
import { userFacingErrorMessage, UserFacingError } from '@/utils/errors';

interface ProfileContextValue {
  profile: Profile | null;
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
  updateProfile: (patch: ProfilePatch) => Promise<void>;
  setDepartment: (dept: Department) => Promise<void>;
  plan: PlanSummary | null;
  planLoading: boolean;
  planError: Error | null;
  refreshPlan: () => Promise<void>;
}

const ProfileContext = createContext<ProfileContextValue | null>(null);

interface ProfileProviderProps {
  children: ReactNode;
}

export function ProfileProvider({ children }: ProfileProviderProps) {
  const { user, initializing: authInitializing } = useAuth();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [plan, setPlan] = useState<PlanSummary | null>(null);
  const [planLoading, setPlanLoading] = useState(true);
  const [planError, setPlanError] = useState<Error | null>(null);
  const requestId = useRef(0);
  const planRequestId = useRef(0);
  const load = useCallback(async (u: typeof user) => {
    const id = ++requestId.current;
    if (!u) {
      setProfile(null);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const p = await profileService.getMyProfile(u);
      if (id !== requestId.current) return;
      setProfile(p);
    } catch (err) {
      if (id !== requestId.current) return;
      setError(
        new UserFacingError(
          userFacingErrorMessage(
            err,
            "We couldn't load your profile. Please try again.",
          ),
        ),
      );
      setProfile(null);
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, []);

  const loadPlan = useCallback(async (hasUser: boolean) => {
    const id = ++planRequestId.current;
    if (!hasUser) {
      setPlan(null);
      setPlanError(null);
      setPlanLoading(false);
      return;
    }
    setPlanLoading(true);
    setPlanError(null);
    try {
      const currentPlan = await planService.getMyPlan();
      if (id !== planRequestId.current) return;
      setPlan(currentPlan);
    } catch (err) {
      if (id !== planRequestId.current) return;
      setPlanError(
        new UserFacingError(
          userFacingErrorMessage(
            err,
            "We couldn't load your plan details. Please try again.",
          ),
        ),
      );
      setPlan(null);
    } finally {
      if (id === planRequestId.current) setPlanLoading(false);
    }
  }, []);

  // Load / clear profile when the auth user changes.
  useEffect(() => {
    if (authInitializing) return;
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (cancelled) return;
      void load(user);
      void loadPlan(!!user);
    });
    return () => {
      cancelled = true;
    };
  }, [user, authInitializing, load, loadPlan]);

  // Auto-retry when the browser comes back online. Fixes the case where
  // the initial load fails during a network outage.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onOnline = () => {
      // Only refetch if we don't already have a valid profile.
      if (!profile) void load(user);
    };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [user, profile, load]);

  const refresh = useCallback(async () => {
    await load(user);
  }, [user, load]);

  const refreshPlan = useCallback(async () => {
    await loadPlan(!!user);
  }, [user, loadPlan]);

  const updateProfile = useCallback(
    async (patch: ProfilePatch) => {
      if (!user) throw new Error('Cannot update profile: not signed in.');
      const updated = await profileService.updateMyProfile(user.id, patch);
      setProfile(updated);
    },
    [user],
  );

  const setDepartment = useCallback(
    async (dept: Department) => {
      await updateProfile({ department: dept });
    },
    [updateProfile],
  );

  const value = useMemo<ProfileContextValue>(
    () => ({
      profile,
      loading,
      error,
      refresh,
      updateProfile,
      setDepartment,
      plan,
      planLoading,
      planError,
      refreshPlan,
    }),
    [
      profile,
      loading,
      error,
      refresh,
      updateProfile,
      setDepartment,
      plan,
      planLoading,
      planError,
      refreshPlan,
    ],
  );

  return (
    <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>
  );
}

export function useProfile(): ProfileContextValue {
  const ctx = useContext(ProfileContext);
  if (!ctx) {
    throw new Error('useProfile must be used within a <ProfileProvider>');
  }
  return ctx;
}
