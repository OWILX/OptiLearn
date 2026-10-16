import type { QuizQuestion } from '@/services/quiz/quizService';
import type { QuizType } from './quizConfig';

export const QUIZ_SESSION_KEY = 'optilearn.quiz.session';
export const QUIZ_REVIEW_KEY = 'optilearn.quiz.review';

export interface QuizSessionConfig {
  type: QuizType;
  course: string;
  topic: string;
  subtopic: string;
  moduleIds: number[];
  questionCount: number;
}

export interface QuizPersistedSession extends QuizSessionConfig {
  version: 2;
  quizId: number;
  timeLimitMinutes: number;
  endTime: number;
  questions: QuizQuestion[];
  answers: Record<number, string>;
  currentIndex: number;
}

export function quizConfigPath(
  config: QuizSessionConfig,
  route = '/quiz/session',
): string {
  const params = new URLSearchParams();
  params.set('type', config.type);
  params.set('course', config.course);
  params.set('topic', config.topic);
  params.set('subtopic', config.subtopic);
  for (const moduleId of config.moduleIds) {
    params.append('module', String(moduleId));
  }
  params.set('count', String(config.questionCount));
  return `${route}?${params.toString()}`;
}

export function quizSessionMatches(
  stored: QuizPersistedSession,
  config: QuizSessionConfig,
): boolean {
  return (
    quizConfigMatches(stored, config) &&
    stored.version === 2 &&
    stored.endTime > Date.now() &&
    stored.questions.length > 0
  );
}

export function quizConfigMatches(
  stored: QuizSessionConfig,
  config: QuizSessionConfig,
): boolean {
  return (
    stored.type === config.type &&
    stored.course === config.course &&
    stored.topic === config.topic &&
    stored.subtopic === config.subtopic &&
    stored.questionCount === config.questionCount &&
    stored.moduleIds.length === config.moduleIds.length &&
    stored.moduleIds.every((id, index) => id === config.moduleIds[index])
  );
}

export function isLiveQuizSession(
  stored: QuizPersistedSession | null,
): stored is QuizPersistedSession {
  return (
    !!stored &&
    stored.version === 2 &&
    stored.endTime > Date.now() &&
    stored.questions.length > 0
  );
}

export function quizSessionPath(stored: QuizPersistedSession): string {
  return quizConfigPath(stored);
}
