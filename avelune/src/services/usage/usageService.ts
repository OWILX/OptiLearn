import { supabase } from '@/lib/supabase';
import { wrapError } from '@/utils/errors';
import type { Cap } from '@/services/tiers/tierService';

/**
 * Counts how much of each capped feature a user has consumed.
 *
 * The cap *shape* lives in tierService. This module only answers
 * "how many has this user used?" — screens compare that to the cap.
 *
 * Days and weeks are computed in the user's local timezone, so a
 * Nigerian student's day rolls over at midnight Lagos, not midnight UTC.
 */

export type UsageKind =
  | 'study_question'
  | 'sep'
  | 'quiz'
  | 'premium_explanation'
  | 'premium_explanation_ad'
  | 'ask_ai'
  | 'ai_quiz';

/**
 * Kinds where opening the same item twice should only count once.
 * Free "20 study questions ever" means 20 distinct questions, not 20 views.
 */
const UNIQUE_BY_REF: ReadonlySet<UsageKind> = new Set([
  'study_question',
  'premium_explanation',
]);

function startOfLocalDay(now = new Date()): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfLocalWeek(now = new Date()): Date {
  // Monday 00:00 local.
  const d = startOfLocalDay(now);
  const day = d.getDay(); // 0 = Sunday
  const diff = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - diff);
  return d;
}

export const usageService = {
  /**
   * Records one use. Fire-and-forget: never throws, never blocks the caller.
   * If the insert fails, the user just doesn't get charged for that use.
   */
  async record(
    userId: string,
    kind: UsageKind,
    refId?: string | number | null,
    context?: string | null,
  ): Promise<void> {
    try {
      const { error } = await supabase.from('usage_events').insert({
        user_id: userId,
        kind,
        ref_id: refId != null ? String(refId) : null,
        context: context ?? null,
      });
      if (error && import.meta.env.DEV) {
        console.warn('[USAGE] record failed:', error);
      }
    } catch (err) {
      if (import.meta.env.DEV) console.warn('[USAGE] record threw:', err);
    }
  },

  async countUniqueSince(
    userId: string,
    kind: UsageKind,
    since: Date | null,
    context?: string | null,
  ): Promise<number> {
    let q = supabase
      .from('usage_events')
      .select('ref_id')
      .eq('user_id', userId)
      .eq('kind', kind);
    if (since) q = q.gte('created_at', since.toISOString());
    if (context) q = q.eq('context', context);

    const { data, error } = await q;
    if (error) throw wrapError(error, 'Could not count usage.');
    const set = new Set<string>();
    for (const row of (data ?? []) as { ref_id: string | null }[]) {
      if (row.ref_id) set.add(row.ref_id);
    }
    return set.size;
  },

  async countEventsSince(
    userId: string,
    kind: UsageKind,
    since: Date | null,
    context?: string | null,
  ): Promise<number> {
    let q = supabase
      .from('usage_events')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('kind', kind);
    if (since) q = q.gte('created_at', since.toISOString());
    if (context) q = q.eq('context', context);

    const { count, error } = await q;
    if (error) throw wrapError(error, 'Could not count usage.');
    return count ?? 0;
  },

  /**
   * True if this user has ever recorded an event of `kind` for this `refId`.
   * Used to make one-time unlocks (a question's premium explanation)
   * persistent — once unlocked, re-reading never charges again.
   */
  async hasUnlocked(
    userId: string,
    kind: UsageKind,
    refId: string | number,
  ): Promise<boolean> {
    const { count, error } = await supabase
      .from('usage_events')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('kind', kind)
      .eq('ref_id', String(refId));
    if (error) throw wrapError(error, 'Could not check unlock.');
    return (count ?? 0) > 0;
  },

  async countToday(userId: string, kind: UsageKind): Promise<number> {
    return this.countSince(userId, kind, startOfLocalDay(), undefined);
  },

  async countThisWeek(userId: string, kind: UsageKind): Promise<number> {
    return this.countSince(userId, kind, startOfLocalWeek(), undefined);
  },

  async countTotal(userId: string, kind: UsageKind): Promise<number> {
    return this.countSince(userId, kind, null, undefined);
  },

  async countTodayInSection(
    userId: string,
    kind: UsageKind,
    section: string,
  ): Promise<number> {
    return this.countSince(userId, kind, startOfLocalDay(), section);
  },

  async countTodayInTopic(
    userId: string,
    kind: UsageKind,
    topicId: string,
  ): Promise<number> {
    return this.countSince(userId, kind, startOfLocalDay(), topicId);
  },

  async countSince(
    userId: string,
    kind: UsageKind,
    since: Date | null,
    context: string | undefined,
  ): Promise<number> {
    if (UNIQUE_BY_REF.has(kind)) {
      return this.countUniqueSince(userId, kind, since, context ?? null);
    }
    return this.countEventsSince(userId, kind, since, context ?? null);
  },

  /**
   * How many the user has used against this cap.
   * For 'unlimited' and 'none' this returns 0 — those are resolved by isAtCap.
   */
  async usedCount(
    userId: string,
    kind: UsageKind,
    cap: Cap,
    scope?: string,
  ): Promise<number> {
    switch (cap.kind) {
      case 'none':
      case 'unlimited':
        return 0;
      case 'total':
        return this.countTotal(userId, kind);
      case 'daily':
        return this.countToday(userId, kind);
      case 'weekly':
        return this.countThisWeek(userId, kind);
      case 'per-section-daily':
        return scope ? this.countTodayInSection(userId, kind, scope) : 0;
      case 'per-topic-daily':
        return scope ? this.countTodayInTopic(userId, kind, scope) : 0;
    }
  },

  /**
   * The one method every gate calls.
   * `scope` is the section name or topic id for per-* caps.
   */
  async isAtCap(
    userId: string,
    kind: UsageKind,
    cap: Cap,
    scope?: string,
  ): Promise<boolean> {
    if (cap.kind === 'unlimited') return false;
    if (cap.kind === 'none') return true;
    const used = await this.usedCount(userId, kind, cap, scope);
    return used >= cap.count;
  },

  /**
   * How many uses remain. 'unlimited' for unbounded tiers, 0 for none.
   * Use this to render "3 of 10 left" style copy.
   */
  async remaining(
    userId: string,
    kind: UsageKind,
    cap: Cap,
    scope?: string,
  ): Promise<number | 'unlimited'> {
    if (cap.kind === 'unlimited') return 'unlimited';
    if (cap.kind === 'none') return 0;
    const used = await this.usedCount(userId, kind, cap, scope);
    return Math.max(0, cap.count - used);
  },

  /** Exposed for tests and for the reset-timer UI. */
  startOfLocalDay,
  startOfLocalWeek,
};
