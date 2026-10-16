import { supabase } from '@/lib/supabase';
import { wrapError } from '@/utils/errors';

/**
 * Read + write of user_streaks.
 *
 * All date logic runs SERVER-SIDE in Postgres via RPCs:
 *   - bump_streak()   — record activity, apply streak rules, return state
 *   - get_my_streak() — read streak with effective (broken → 0) logic
 *
 * The client NEVER computes dates for streaks. Device time is
 * user-controllable; server time is not. This prevents a user from
 * faking a new day to inflate their streak.
 */

export interface StreakInfo {
  currentStreak: number;
  longestStreak: number;
  lastActivityDate: string | null;
}

interface StreakRpcRow {
  current_streak: number;
  longest_streak: number;
  last_activity_date: string | null;
}

function toInfo(row: StreakRpcRow | null): StreakInfo {
  if (!row) {
    return { currentStreak: 0, longestStreak: 0, lastActivityDate: null };
  }
  return {
    currentStreak: row.current_streak ?? 0,
    longestStreak: row.longest_streak ?? 0,
    lastActivityDate: row.last_activity_date ?? null,
  };
}

export const streakService = {
  /**
   * Read the user's streak. Safe to call on every Home mount — no writes.
   * Streaks broken by inactivity read as `currentStreak: 0` without
   * mutating the stored row.
   */
  async getMyStreak(): Promise<StreakInfo> {
    const { data, error } = await supabase.rpc('get_my_streak');

    if (error) throw wrapError(error, 'Could not load streak.');

    const row = Array.isArray(data) ? (data[0] as StreakRpcRow | undefined) : null;
    return toInfo(row ?? null);
  },

  /**
   * Record one activity for "today" (server-side WAT). Idempotent
   * within the same day — calling twice does nothing the second time.
   * Fire-and-forget from the app; no need to await for UI.
   */
  async bumpStreak(): Promise<StreakInfo> {
    const { data, error } = await supabase.rpc('bump_streak');

    if (error) throw wrapError(error, 'Could not update streak.');

    const row = Array.isArray(data) ? (data[0] as StreakRpcRow | undefined) : null;
    return toInfo(row ?? null);
  },
};
