import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
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

interface ProfileContextValue {
  profile: Profile | null;
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
  updateProfile: (patch: ProfilePatch) => Promise<void>;
  setDepartment: (dept: Department) => Promise<void>;
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

  const load = useCallback(async (u: typeof user) => {
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
      setProfile(p);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Could not load profile.'));
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load / clear profile when the auth user changes.
  useEffect(() => {
    if (authInitializing) return;
    void load(user);
  }, [user, authInitializing, load]);

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
    }),
    [profile, loading, error, refresh, updateProfile, setDepartment],
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
