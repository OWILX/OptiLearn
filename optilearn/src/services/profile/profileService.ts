import type { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { wrapError } from '@/utils/errors';

/**
 * All reads/writes to public.profiles go through this module.
 */

export type Department = 'science' | 'arts' | 'commercial';

export interface Profile {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  department: Department | null;
  premium: boolean;
  premium_since: string | null;
  premium_expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProfilePatch {
  full_name?: string | null;
  avatar_url?: string | null;
  department?: Department | null;
}

const SELECT_COLUMNS =
  'id, full_name, avatar_url, department, premium, premium_since, premium_expires_at, created_at, updated_at';

function seedFromMetadata(user: User): {
  full_name: string | null;
  avatar_url: string | null;
} {
  const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
  const fullName =
    (typeof meta.full_name === 'string' && meta.full_name) ||
    (typeof meta.name === 'string' && meta.name) ||
    null;
  const avatarUrl =
    (typeof meta.avatar_url === 'string' && meta.avatar_url) ||
    (typeof meta.picture === 'string' && meta.picture) ||
    null;
  return { full_name: fullName, avatar_url: avatarUrl };
}

export const profileService = {
  async getMyProfile(user: User): Promise<Profile> {
    const { data, error } = await supabase
      .from('profiles')
      .select(SELECT_COLUMNS)
      .eq('id', user.id)
      .maybeSingle();

    if (error) throw wrapError(error, 'Could not load profile.');
    if (data) return data as Profile;

    const seed = seedFromMetadata(user);
    const { data: inserted, error: insertError } = await supabase
      .from('profiles')
      .insert({
        id: user.id,
        full_name: seed.full_name,
        avatar_url: seed.avatar_url,
      })
      .select(SELECT_COLUMNS)
      .single();

    if (insertError) throw wrapError(insertError, 'Could not create profile.');
    if (!inserted) throw new Error('Profile insert returned no row.');
    return inserted as Profile;
  },

  /**
   * Update the authenticated user's profile.
   *
   * Only the fields present in `patch` are written. Fields not mentioned
   * keep their existing values. This prevents an update that only sets
   * `department` from accidentally nulling `full_name`.
   */
  async updateMyProfile(
    userId: string,
    patch: ProfilePatch,
  ): Promise<Profile> {
    const update: Record<string, unknown> = {
      id: userId,
      updated_at: new Date().toISOString(),
    };
    if ('full_name' in patch) update.full_name = patch.full_name ?? null;
    if ('avatar_url' in patch) update.avatar_url = patch.avatar_url ?? null;
    if ('department' in patch) update.department = patch.department ?? null;

    const { data, error } = await supabase
      .from('profiles')
      .upsert(update, { onConflict: 'id' })
      .select(SELECT_COLUMNS)
      .single();

    if (error) throw wrapError(error, 'Could not save profile.');
    if (!data) throw new Error('Profile update returned no row.');
    return data as Profile;
  },
};
