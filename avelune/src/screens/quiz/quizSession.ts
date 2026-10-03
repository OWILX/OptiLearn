import type { QuizQuestion } from '@/services/quiz/quizService';
import type { Difficulty } from './quizConfig';

export const QUIZ_SESSION_KEY = 'optilearn.quiz.session';
export const QUIZ_REVIEW_KEY = 'optilearn.quiz.review';

export interface QuizPersistedSession {
  version: 1;
  subject: string;
  difficulty: Difficulty;
  timeLimitMinutes: number;
  questionCount: number;
  endTime: number;
  questions: QuizQuestion[];
  answers: Record<number, string>;
  currentIndex: number;
}

export interface QuizSessionConfig {
  subject: string;
  difficulty: Difficulty;
  timeLimitMinutes: number;
  questionCount: number;
}

export function quizSessionMatches(
  stored: QuizPersistedSession,
  config: QuizSessionConfig,
): boolean {
  if (stored.version !== 1) return false;
  if (stored.subject !== config.subject) return false;
  if (stored.difficulty !== config.difficulty) return false;
  if (stored.timeLimitMinutes !== config.timeLimitMinutes) return false;
  if (stored.questionCount !== config.questionCount) return false;
  return stored.endTime > Date.now() && stored.questions.length > 0;
}

export function isLiveQuizSession(
  stored: QuizPersistedSession | null,
): stored is QuizPersistedSession {
  return (
    !!stored &&
    stored.version === 1 &&
    stored.endTime > Date.now() &&
    stored.questions.length > 0
  );
}

export function quizSessionPath(stored: QuizPersistedSession): string {
  const params = new URLSearchParams();
  params.set('subject', stored.subject);
  params.set('difficulty', stored.difficulty);
  params.set('time', String(stored.timeLimitMinutes));
  params.set('count', String(stored.questionCount));
  return '/quiz/session?' + params.toString();
}
