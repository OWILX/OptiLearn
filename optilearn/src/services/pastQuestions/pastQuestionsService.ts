import { supabase } from '@/lib/supabase';
import { wrapError } from '@/utils/errors';
import { filterSubjectsByDepartment } from '@/constants/departments';
import type { Department } from '@/services/profile/profileService';

/**
 * Read-side of past_questions (historical UTME/JAMB questions).
 */

export interface LinkedSyllabusPair {
  section: string;
  topic: string;
}

export interface PastQuestionsSummary {
  subjects: string[];
  years: number[];
  sections: string[];
  topicPairs: LinkedSyllabusPair[];
  totalAvailable: number;
}

export interface PracticeFilters {
  subject?: string | null;
  year?: number | null;
  section?: string | null;
  topic?: string | null;
}

export interface SessionOption {
  letter: string;
  text: string;
}

export interface SessionQuestion {
  id: number;
  subject: string;
  year: number;
  questionNumber: number;
  question: string;
  options: SessionOption[];
  correctAnswer: string;
  explanation: string | null;
}

interface RawRow {
  id: number;
  subject: string;
  year: number;
  question_number: number;
  question_text: string;
  options: unknown;
  correct_answer: string | null;
  explanation: string | null;
}

const SESSION_LIMIT = 100;

function parseRow(row: RawRow): SessionQuestion | null {
  if (!row.question_text?.trim()) return null;

  const answer = (row.correct_answer ?? '').trim().toUpperCase();
  if (!answer || !/^[A-D]$/.test(answer)) return null;

  const raw = row.options;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;

  const obj = raw as Record<string, unknown>;
  const letters = ['A', 'B', 'C', 'D'];
  const options: SessionOption[] = [];
  for (const letter of letters) {
    const text = obj[letter];
    if (typeof text !== 'string' || !text.trim()) return null;
    options.push({ letter, text: text.trim() });
  }

  return {
    id: row.id,
    subject: row.subject,
    year: row.year,
    questionNumber: row.question_number,
    question: row.question_text.trim(),
    options,
    correctAnswer: answer,
    explanation: row.explanation?.trim() || null,
  };
}

export const pastQuestionsService = {
  /**
   * Distinct subjects / years, plus total count.
   *
   * When `department` is provided, the returned `subjects` array is
   * filtered to that department. `years` and `totalAvailable` reflect
   * the full dataset — filtering those would confuse users who haven't
   * picked a subject yet.
   */
  async getSummary(
    department?: Department | null,
  ): Promise<PastQuestionsSummary> {
    const [rowsRes, linkedRes, countRes] = await Promise.all([
      supabase.from('past_questions').select('subject, year'),
      supabase
        .from('past_questions')
        .select('syllabus_id')
        .not('syllabus_id', 'is', null),
      supabase
        .from('past_questions')
        .select('id', { count: 'exact', head: true }),
    ]);

    if (rowsRes.error)
      throw wrapError(rowsRes.error, 'Could not load past questions.');
    if (linkedRes.error)
      throw wrapError(linkedRes.error, 'Could not load linked questions.');
    if (countRes.error)
      throw wrapError(countRes.error, 'Could not load past questions.');

    const rows = (rowsRes.data ?? []) as { subject: string; year: number }[];

    const subjectSet = new Set<string>();
    const yearSet = new Set<number>();
    for (const r of rows) {
      if (r.subject) subjectSet.add(r.subject);
      if (typeof r.year === 'number') yearSet.add(r.year);
    }

    let subjects = Array.from(subjectSet).sort((a, b) => a.localeCompare(b));
    if (department) {
      subjects = filterSubjectsByDepartment(subjects, department);
    }

    const syllabusIds = Array.from(
      new Set(
        ((linkedRes.data ?? []) as { syllabus_id: number }[]).map(
          (r) => r.syllabus_id,
        ),
      ),
    );

    let topicPairs: LinkedSyllabusPair[] = [];
    if (syllabusIds.length > 0) {
      const { data: sylRows, error: sylError } = await supabase
        .from('syllabus')
        .select('section, topic')
        .in('id', syllabusIds);

      if (sylError)
        throw wrapError(sylError, 'Could not load linked syllabus rows.');

      const seen = new Set<string>();
      for (const s of (sylRows ?? []) as { section: string; topic: string }[]) {
        const key = `${s.section}|||${s.topic}`;
        if (!seen.has(key)) {
          seen.add(key);
          topicPairs.push({ section: s.section, topic: s.topic });
        }
      }
    }

    const sections = Array.from(
      new Set(topicPairs.map((p) => p.section)),
    ).sort((a, b) => a.localeCompare(b));

    return {
      subjects,
      years: Array.from(yearSet).sort((a, b) => b - a),
      sections,
      topicPairs,
      totalAvailable: countRes.count ?? 0,
    };
  },

  async countQuestions(filters: PracticeFilters): Promise<number> {
    let syllabusIds: number[] | null = null;

    if (filters.section || filters.topic) {
      let sq = supabase.from('syllabus').select('id');
      if (filters.section) sq = sq.eq('section', filters.section);
      if (filters.topic) sq = sq.eq('topic', filters.topic);

      const { data: sRows, error: sError } = await sq;
      if (sError) throw wrapError(sError, 'Could not filter by section/topic.');

      syllabusIds = (sRows ?? []).map((r) => r.id as number);
      if (syllabusIds.length === 0) return 0;
    }

    let q = supabase
      .from('past_questions')
      .select('id', { count: 'exact', head: true });

    if (filters.subject) q = q.eq('subject', filters.subject);
    if (filters.year) q = q.eq('year', filters.year);
    if (syllabusIds) q = q.in('syllabus_id', syllabusIds);

    const { count, error } = await q;
    if (error) throw wrapError(error, 'Could not count past questions.');
    return count ?? 0;
  },

  async getSessionQuestions(
    filters: PracticeFilters,
  ): Promise<SessionQuestion[]> {
    let syllabusIds: number[] | null = null;

    if (filters.section || filters.topic) {
      let sq = supabase.from('syllabus').select('id');
      if (filters.section) sq = sq.eq('section', filters.section);
      if (filters.topic) sq = sq.eq('topic', filters.topic);

      const { data: sRows, error: sError } = await sq;
      if (sError) throw wrapError(sError, 'Could not filter by section/topic.');

      syllabusIds = (sRows ?? []).map((r) => r.id as number);
      if (syllabusIds.length === 0) return [];
    }

    let q = supabase
      .from('past_questions')
      .select(
        'id, subject, year, question_number, question_text, options, correct_answer, explanation',
      )
      .order('year', { ascending: false })
      .order('question_number', { ascending: true })
      .limit(SESSION_LIMIT);

    if (filters.subject) q = q.eq('subject', filters.subject);
    if (filters.year) q = q.eq('year', filters.year);
    if (syllabusIds) q = q.in('syllabus_id', syllabusIds);

    const { data, error } = await q;
    if (error) throw wrapError(error, 'Could not load questions.');

    const out: SessionQuestion[] = [];
    for (const row of (data ?? []) as RawRow[]) {
      const parsed = parseRow(row);
      if (parsed) out.push(parsed);
      else if (import.meta.env.DEV) {
        console.warn('[PRACTICE] Skipped malformed past_question id=', row.id);
      }
    }
    return out;
  },
};
