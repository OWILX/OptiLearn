import { supabase } from '@/lib/supabase';
import { wrapError } from '@/utils/errors';
import {
  DEPARTMENT_LABELS,
  DEPARTMENT_SUBJECTS,
} from '@/constants/departments';
import type { Department } from '@/services/profile/profileService';

/**
 * Read-side of public.syllabus — the single source of curriculum truth.
 */

export interface SyllabusRow {
  id: number;
  courseName: string;
  topicName: string;
  subtopicName: string;
  moduleName: string;
  content: string | null;
  objectives: string | null;
  createdAt: string | null;
}

export interface SubjectSummary {
  subject: string;
  topicsCount: number;
  modulesCount: number;
  completedCount: number;
  progressPct: number;
}

export interface QuizCurriculumRow {
  moduleId: number;
  courseName: string;
  topicName: string;
  subtopicName: string;
  moduleName: string;
}

export interface SectionSummary {
  section: string;
  subtopicsCount: number;
  modulesCount: number;
  completedCount: number;
  progressPct: number;
}

export interface SubtopicSummary {
  subtopic: string;
  modulesCount: number;
  completedCount: number;
  progressPct: number;
}

export type TopicStatus = 'not_started' | 'in_progress' | 'completed';

export interface ModuleSummary {
  syllabusId: number;
  module: string;
  status: TopicStatus;
  progressPct: number;
}

interface CompletedProgressRow {
  syllabus_id: number;
}

const CURRICULUM_PAGE_SIZE = 500;

async function loadQuizCurriculumRows(): Promise<QuizCurriculumRow[]> {
  const rows: QuizCurriculumRow[] = [];

  for (let from = 0; ; from += CURRICULUM_PAGE_SIZE) {
    const { data, error } = await supabase
      .from('syllabus')
      .select(
        'moduleId:module_id, courseName:course_name, topicName:topic_name, subtopicName:subtopic_name, moduleName:module_name',
      )
      .order('id', { ascending: true })
      .range(from, from + CURRICULUM_PAGE_SIZE - 1);

    if (error) throw wrapError(error, 'Could not load quiz curriculum.');

    const page = (data ?? []) as QuizCurriculumRow[];
    rows.push(...page);
    if (page.length < CURRICULUM_PAGE_SIZE) return rows;
  }
}

function completedSyllabusIds(rows: readonly CompletedProgressRow[]): Set<number> {
  return new Set(rows.map((row) => row.syllabus_id));
}

function progressPct(completed: number, total: number): number {
  return total > 0 ? Math.round((completed / total) * 100) : 0;
}

function normalizeCourseName(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

function courseMatchesDepartment(
  courseName: string,
  department: Department,
): boolean {
  const courseWords = normalizeCourseName(courseName);
  const departmentCourses = [
    DEPARTMENT_LABELS[department],
    ...DEPARTMENT_SUBJECTS[department],
  ];

  return departmentCourses.some((departmentCourse) => {
    const courseWordsToMatch = normalizeCourseName(departmentCourse);
    if (
      courseWordsToMatch.length === 0 ||
      courseWordsToMatch.length > courseWords.length
    ) {
      return false;
    }

    return courseWords.some((_, index) =>
      courseWordsToMatch.every(
        (word, wordIndex) => courseWords[index + wordIndex] === word,
      ),
    );
  });
}

export const syllabusService = {
  async getQuizCurriculum(
    department?: Department | null,
  ): Promise<QuizCurriculumRow[]> {
    const rows = await loadQuizCurriculumRows();
    return department
      ? rows.filter((row) => courseMatchesDepartment(row.courseName, department))
      : rows;
  },

  async getById(id: number): Promise<SyllabusRow | null> {
    const { data, error } = await supabase
      .from('syllabus')
      .select(
        'id, courseName:course_name, topicName:topic_name, subtopicName:subtopic_name, moduleName:module_name, content, objectives, createdAt:created_at',
      )
      .eq('id', id)
      .maybeSingle();

    if (error) throw wrapError(error, 'Could not load module.');
    return (data as SyllabusRow | null) ?? null;
  },

  /** Courses are derived from distinct syllabus.course_name values. */
  async getSubjectSummaries(
    userId: string,
    department?: Department | null,
  ): Promise<SubjectSummary[]> {
    const [rowsRes, progressRes] = await Promise.all([
      supabase
        .from('syllabus')
        .select('id, course_name, topic_name')
        .order('id', { ascending: true }),
      supabase
        .from('study_progress')
        .select('syllabus_id')
        .eq('user_id', userId)
        .eq('status', 'completed'),
    ]);

    if (rowsRes.error)
      throw wrapError(rowsRes.error, 'Could not load courses.');
    if (progressRes.error)
      throw wrapError(progressRes.error, 'Could not load progress.');

    const rows = (rowsRes.data ?? []) as {
      id: number;
      course_name: string;
      topic_name: string;
    }[];

    const completedIds = completedSyllabusIds(
      (progressRes.data ?? []) as CompletedProgressRow[],
    );

    const grouped = new Map<
      string,
      {
        minId: number;
        topics: Set<string>;
        modules: number;
        completed: number;
      }
    >();
    for (const row of rows) {
      let group = grouped.get(row.course_name);
      if (!group) {
        group = {
          minId: row.id,
          topics: new Set<string>(),
          modules: 0,
          completed: 0,
        };
        grouped.set(row.course_name, group);
      }
      group.topics.add(row.topic_name);
      group.modules += 1;
      if (completedIds.has(row.id)) group.completed += 1;
      group.minId = Math.min(group.minId, row.id);
    }

    const summaries = Array.from(grouped, ([subject, group]) => ({
      subject,
      topicsCount: group.topics.size,
      modulesCount: group.modules,
      completedCount: group.completed,
      progressPct: progressPct(group.completed, group.modules),
    })).sort(
      (a, b) => grouped.get(a.subject)!.minId - grouped.get(b.subject)!.minId,
    );

    if (!department) return summaries;
    return summaries.filter((summary) =>
      courseMatchesDepartment(summary.subject, department),
    );
  },

  /** Topics within a course. */
  async getSectionSummaries(
    userId: string,
    courseName: string,
  ): Promise<SectionSummary[]> {
    const [rowsRes, progressRes] = await Promise.all([
      supabase
        .from('syllabus')
        .select('id, topic_name, subtopic_name')
        .eq('course_name', courseName)
        .order('id', { ascending: true }),
      supabase
        .from('study_progress')
        .select('syllabus_id')
        .eq('user_id', userId)
        .eq('status', 'completed'),
    ]);

    if (rowsRes.error)
      throw wrapError(rowsRes.error, 'Could not load topics.');
    if (progressRes.error)
      throw wrapError(progressRes.error, 'Could not load progress.');

    const rows = (rowsRes.data ?? []) as {
      id: number;
      topic_name: string;
      subtopic_name: string;
    }[];
    const completedIds = completedSyllabusIds(
      (progressRes.data ?? []) as CompletedProgressRow[],
    );
    const grouped = new Map<
      string,
      {
        minId: number;
        subtopics: Set<string>;
        modules: number;
        completed: number;
      }
    >();

    for (const row of rows) {
      let group = grouped.get(row.topic_name);
      if (!group) {
        group = {
          minId: row.id,
          subtopics: new Set<string>(),
          modules: 0,
          completed: 0,
        };
        grouped.set(row.topic_name, group);
      }
      group.subtopics.add(row.subtopic_name);
      group.modules += 1;
      if (completedIds.has(row.id)) group.completed += 1;
      group.minId = Math.min(group.minId, row.id);
    }

    return Array.from(grouped, ([section, group]) => ({
      section,
      subtopicsCount: group.subtopics.size,
      modulesCount: group.modules,
      completedCount: group.completed,
      progressPct: progressPct(group.completed, group.modules),
    })).sort(
      (a, b) => grouped.get(a.section)!.minId - grouped.get(b.section)!.minId,
    );
  },

  /** Subtopics within a course topic. */
  async getSubtopicSummaries(
    userId: string,
    courseName: string,
    topicName: string,
  ): Promise<SubtopicSummary[]> {
    const [rowsRes, progressRes] = await Promise.all([
      supabase
        .from('syllabus')
        .select('id, subtopic_name')
        .eq('course_name', courseName)
        .eq('topic_name', topicName)
        .order('id', { ascending: true }),
      supabase
        .from('study_progress')
        .select('syllabus_id')
        .eq('user_id', userId)
        .eq('status', 'completed'),
    ]);

    if (rowsRes.error)
      throw wrapError(rowsRes.error, 'Could not load subtopics.');
    if (progressRes.error)
      throw wrapError(progressRes.error, 'Could not load progress.');

    const rows = (rowsRes.data ?? []) as {
      id: number;
      subtopic_name: string;
    }[];
    const completedIds = completedSyllabusIds(
      (progressRes.data ?? []) as CompletedProgressRow[],
    );
    const grouped = new Map<
      string,
      { minId: number; modules: number; completed: number }
    >();

    for (const row of rows) {
      let group = grouped.get(row.subtopic_name);
      if (!group) {
        group = { minId: row.id, modules: 0, completed: 0 };
        grouped.set(row.subtopic_name, group);
      }
      group.modules += 1;
      if (completedIds.has(row.id)) group.completed += 1;
      group.minId = Math.min(group.minId, row.id);
    }

    return Array.from(grouped, ([subtopic, group]) => ({
      subtopic,
      modulesCount: group.modules,
      completedCount: group.completed,
      progressPct: progressPct(group.completed, group.modules),
    })).sort(
      (a, b) => grouped.get(a.subtopic)!.minId - grouped.get(b.subtopic)!.minId,
    );
  },

  /** Modules within a subtopic, with per-module study progress. */
  async getModuleSummaries(
    userId: string,
    courseName: string,
    topicName: string,
    subtopicName: string,
  ): Promise<ModuleSummary[]> {
    const [rowsRes, progressRes] = await Promise.all([
      supabase
        .from('syllabus')
        .select('id, module_name')
        .eq('course_name', courseName)
        .eq('topic_name', topicName)
        .eq('subtopic_name', subtopicName)
        .order('id', { ascending: true }),
      supabase
        .from('study_progress')
        .select('syllabus_id, status, progress')
        .eq('user_id', userId),
    ]);

    if (rowsRes.error)
      throw wrapError(rowsRes.error, 'Could not load modules.');
    if (progressRes.error)
      throw wrapError(progressRes.error, 'Could not load progress.');

    const progressById = new Map<
      number,
      { status: TopicStatus; progress: number }
    >();
    for (const row of progressRes.data ?? []) {
      progressById.set(row.syllabus_id, {
        status: row.status as TopicStatus,
        progress: Number(row.progress) || 0,
      });
    }

    return ((rowsRes.data ?? []) as { id: number; module_name: string }[]).map(
      (row) => {
        const progress = progressById.get(row.id);
        return {
          syllabusId: row.id,
          module: row.module_name,
          status: progress?.status ?? 'not_started',
          progressPct: progress ? Math.round(progress.progress) : 0,
        };
      },
    );
  },
};
