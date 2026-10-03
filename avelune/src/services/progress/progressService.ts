import { supabase } from '@/lib/supabase';
import { wrapError } from '@/utils/errors';
import {
  syllabusService,
  type SyllabusRow,
} from '@/services/syllabus/syllabusService';

/**
 * Read/write of study_progress.
 *
 * Convention: progress is a percentage of questions viewed within a topic.
 *   progressPct = (viewedCount / totalCount) * 100
 *   status = 'in_progress' when 0 < pct < 100, 'completed' when pct == 100
 */

export interface ProgressStats {
  topicsCompleted: number;
  topicsInProgress: number;
}

export type ProgressStatus = 'not_started' | 'in_progress' | 'completed';

export interface ContinueLearning {
  progress: {
    syllabusId: number;
    status: ProgressStatus;
    progress: number;
    lastAccessedAt: string | null;
  };
  syllabus: SyllabusRow;
}

export interface TopicProgress {
  syllabusId: number;
  status: ProgressStatus;
  progress: number;
  lastAccessedAt: string | null;
}

export const progressService = {
  async getMyStats(userId: string): Promise<ProgressStats> {
    const [completedRes, inProgressRes] = await Promise.all([
      supabase
        .from('study_progress')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('status', 'completed'),
      supabase
        .from('study_progress')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('status', 'in_progress'),
    ]);

    if (completedRes.error)
      throw wrapError(completedRes.error, 'Could not load progress.');
    if (inProgressRes.error)
      throw wrapError(inProgressRes.error, 'Could not load progress.');

    return {
      topicsCompleted: completedRes.count ?? 0,
      topicsInProgress: inProgressRes.count ?? 0,
    };
  },

  async getContinueLearning(userId: string): Promise<ContinueLearning | null> {
    const { data, error } = await supabase
      .from('study_progress')
      .select('syllabus_id, status, progress, last_accessed_at')
      .eq('user_id', userId)
      .neq('status', 'not_started')
      .order('last_accessed_at', { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();

    if (error) throw wrapError(error, 'Could not load learning progress.');
    if (!data) return null;

    const syllabus = await syllabusService.getById(data.syllabus_id);
    if (!syllabus) return null;

    return {
      progress: {
        syllabusId: data.syllabus_id,
        status: data.status as ProgressStatus,
        progress: Number(data.progress),
        lastAccessedAt: data.last_accessed_at,
      },
      syllabus,
    };
  },

  /**
   * Progress row for a single topic, or null if the user has never opened it.
   */
  async getTopicProgress(
    userId: string,
    syllabusId: number,
  ): Promise<TopicProgress | null> {
    const { data, error } = await supabase
      .from('study_progress')
      .select('syllabus_id, status, progress, last_accessed_at')
      .eq('user_id', userId)
      .eq('syllabus_id', syllabusId)
      .maybeSingle();

    if (error) throw wrapError(error, 'Could not load topic progress.');
    if (!data) return null;

    return {
      syllabusId: data.syllabus_id,
      status: data.status as ProgressStatus,
      progress: Number(data.progress),
      lastAccessedAt: data.last_accessed_at,
    };
  },

  /**
   * Upsert progress for a topic. `viewedCount` is 1-based (the number of
   * questions viewed including the current one). `totalCount` is the
   * number of questions in the topic.
   *
   * Safe to call repeatedly — upsert on (user_id, syllabus_id).
   */
  async recordTopicProgress(
    userId: string,
    syllabusId: number,
    viewedCount: number,
    totalCount: number,
  ): Promise<TopicProgress> {
    if (totalCount <= 0) {
      throw new Error('Cannot record progress for an empty topic.');
    }

    const safeViewed = Math.max(0, Math.min(viewedCount, totalCount));
    const pct = Math.round((safeViewed / totalCount) * 10000) / 100; // 2dp
    const status: ProgressStatus = pct >= 100 ? 'completed' : 'in_progress';
    const now = new Date().toISOString();

    // Preserve set-once fields: started_at (first open) and completed_at
    // (first 100%). Reading first means a re-visit can't clobber them.
    const { data: existing, error: readError } = await supabase
      .from('study_progress')
      .select('started_at, completed_at')
      .eq('user_id', userId)
      .eq('syllabus_id', syllabusId)
      .maybeSingle();

    if (readError) throw wrapError(readError, 'Could not read progress.');

    const startedAt = existing?.started_at ?? now;
    const completedAt =
      existing?.completed_at ?? (status === 'completed' ? now : null);

    const { data, error } = await supabase
      .from('study_progress')
      .upsert(
        {
          user_id: userId,
          syllabus_id: syllabusId,
          status,
          progress: pct,
          started_at: startedAt,
          last_accessed_at: now,
          completed_at: completedAt,
        },
        { onConflict: 'user_id,syllabus_id' },
      )
      .select('syllabus_id, status, progress, last_accessed_at')
      .single();

    if (error) throw wrapError(error, 'Could not save progress.');
    if (!data) throw new Error('Progress save returned no row.');

    return {
      syllabusId: data.syllabus_id,
      status: data.status as ProgressStatus,
      progress: Number(data.progress),
      lastAccessedAt: data.last_accessed_at,
    };
  },
};
