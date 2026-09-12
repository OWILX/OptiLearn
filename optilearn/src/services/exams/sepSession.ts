import type { MCQQuestion } from '@/services/questions/questionService';

/**
 * Persisted shape of an in-progress SEP session.
 *
 * Written to localStorage by SepExamScreen on every state change,
 * read by SepExamScreen (to resume) and SepConfigureScreen (to
 * surface the resume banner).
 */

export const SEP_SESSION_KEY = 'optilearn.sep.session';

export interface SepPersistedQuestion extends MCQQuestion {
  subject: string;
}

export interface SEPPersistedSession {
  version: 1;
  subjects: string[];
  timeLimitMinutes: number;
  startedAt: string;
  /** Unix ms timestamp when the exam auto-submits. */
  endTime: number;
  questions: SepPersistedQuestion[];
  answers: Record<number, string>;
  currentIndex: number;
}
