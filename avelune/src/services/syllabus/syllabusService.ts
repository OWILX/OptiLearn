import { supabase } from '@/lib/supabase';
import { wrapError } from '@/utils/errors';
import { filterSubjectsByDepartment } from '@/constants/departments';
import type { Department } from '@/services/profile/profileService';

/**
 * Read-side of public.syllabus — the single source of curriculum truth.
 */

export interface SyllabusRow {
  id: number;
  subject: string;
  section: string;
  topic: string;
  content: string;
  objectives: string | null;
  created_at: string;
}

export interface SubjectSummary {
  subject: string;
  sectionsCount: number;
  topicsCount: number;
  completedCount: number;
  progressPct: number;
}

export interface SectionSummary {
  section: string;
  topicsCount: number;
  completedCount: number;
  progressPct: number;
}

export type TopicStatus = 'not_started' | 'in_progress' | 'completed';

export interface TopicSummary {
  syllabusId: number;
  topic: string;
  status: TopicStatus;
  progressPct: number;
}

interface SyllabusSkeletonRow {
  id: number;
  subject: string;
  section: string;
  topic: string;
}

export const syllabusService = {
  async getById(id: number): Promise<SyllabusRow | null> {
    const { data, error } = await supabase
      .from('syllabus')
      .select('id, subject, section, topic, content, objectives, created_at')
      .eq('id', id)
      .maybeSingle();

    if (error) throw wrapError(error, 'Could not load topic.');
    return (data as SyllabusRow | null) ?? null;
  },

  /**
   * All subjects derived from distinct syllabus.subject values.
   * When `department` is provided, only subjects belonging to that
   * department are returned.
   */
  async getSubjectSummaries(
    userId: string,
    department?: Department | null,
  ): Promise<SubjectSummary[]> {
    const [rowsRes, progressRes] = await Promise.all([
      supabase
        .from('syllabus')
        .select('id, subject, section, topic')
        .order('id', { ascending: true }),
      supabase
        .from('study_progress')
        .select('syllabus_id, status')
        .eq('user_id', userId)
        .eq('status', 'completed'),
    ]);

    if (rowsRes.error)
      throw wrapError(rowsRes.error, 'Could not load subjects.');
    if (progressRes.error)
      throw wrapError(progressRes.error, 'Could not load progress.');

    const skeleton = (rowsRes.data ?? []) as SyllabusSkeletonRow[];
    if (skeleton.length === 0) return [];

    const completedIds = new Set<number>();
    for (const p of progressRes.data ?? []) {
      completedIds.add(p.syllabus_id as number);
    }

    const map = new Map<
      string,
      { minId: number; sections: Set<string>; topics: number; completed: number }
    >();

    for (const r of skeleton) {
      let entry = map.get(r.subject);
      if (!entry) {
        entry = { minId: r.id, sections: new Set(), topics: 0, completed: 0 };
        map.set(r.subject, entry);
      }
      entry.sections.add(r.section);
      entry.topics += 1;
      if (completedIds.has(r.id)) entry.completed += 1;
      if (r.id < entry.minId) entry.minId = r.id;
    }

    const out: SubjectSummary[] = [];
    for (const [subject, e] of map) {
      out.push({
        subject,
        sectionsCount: e.sections.size,
        topicsCount: e.topics,
        completedCount: e.completed,
        progressPct:
          e.topics > 0 ? Math.round((e.completed / e.topics) * 100) : 0,
      });
    }

    out.sort((a, b) => map.get(a.subject)!.minId - map.get(b.subject)!.minId);

    // Department filter — applied after aggregation so counts stay accurate.
    if (department) {
      const allowed = new Set(
        filterSubjectsByDepartment(
          out.map((s) => s.subject),
          department,
        ),
      );
      return out.filter((s) => allowed.has(s.subject));
    }

    return out;
  },

  async getSectionSummaries(
    userId: string,
    subject: string,
  ): Promise<SectionSummary[]> {
    const [rowsRes, progressRes] = await Promise.all([
      supabase
        .from('syllabus')
        .select('id, section')
        .eq('subject', subject)
        .order('id', { ascending: true }),
      supabase
        .from('study_progress')
        .select('syllabus_id, status')
        .eq('user_id', userId)
        .eq('status', 'completed'),
    ]);

    if (rowsRes.error)
      throw wrapError(rowsRes.error, 'Could not load sections.');
    if (progressRes.error)
      throw wrapError(progressRes.error, 'Could not load progress.');

    const rows = (rowsRes.data ?? []) as { id: number; section: string }[];
    if (rows.length === 0) return [];

    const completedIds = new Set<number>();
    for (const p of progressRes.data ?? []) {
      completedIds.add(p.syllabus_id as number);
    }

    const map = new Map<
      string,
      { minId: number; topics: number; completed: number }
    >();

    for (const r of rows) {
      let entry = map.get(r.section);
      if (!entry) {
        entry = { minId: r.id, topics: 0, completed: 0 };
        map.set(r.section, entry);
      }
      entry.topics += 1;
      if (completedIds.has(r.id)) entry.completed += 1;
      if (r.id < entry.minId) entry.minId = r.id;
    }

    const out: SectionSummary[] = [];
    for (const [section, e] of map) {
      out.push({
        section,
        topicsCount: e.topics,
        completedCount: e.completed,
        progressPct:
          e.topics > 0 ? Math.round((e.completed / e.topics) * 100) : 0,
      });
    }

    out.sort((a, b) => map.get(a.section)!.minId - map.get(b.section)!.minId);
    return out;
  },

  async getTopicSummaries(
    userId: string,
    subject: string,
    section: string,
  ): Promise<TopicSummary[]> {
    const [rowsRes, progressRes] = await Promise.all([
      supabase
        .from('syllabus')
        .select('id, topic')
        .eq('subject', subject)
        .eq('section', section)
        .order('id', { ascending: true }),
      supabase
        .from('study_progress')
        .select('syllabus_id, status, progress')
        .eq('user_id', userId),
    ]);

    if (rowsRes.error)
      throw wrapError(rowsRes.error, 'Could not load topics.');
    if (progressRes.error)
      throw wrapError(progressRes.error, 'Could not load progress.');

    const rows = (rowsRes.data ?? []) as { id: number; topic: string }[];

    const progressById = new Map<
      number,
      { status: TopicStatus; progress: number }
    >();
    for (const p of progressRes.data ?? []) {
      progressById.set(p.syllabus_id as number, {
        status: p.status as TopicStatus,
        progress: Number(p.progress) || 0,
      });
    }

    return rows.map((r) => {
      const p = progressById.get(r.id);
      return {
        syllabusId: r.id,
        topic: r.topic,
        status: p?.status ?? 'not_started',
        progressPct: p ? Math.round(p.progress) : 0,
      };
    });
  },
};
