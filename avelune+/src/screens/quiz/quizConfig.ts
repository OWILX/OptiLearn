export const QUESTION_OPTIONS = [5, 10, 15, 20, 25] as const;

export type QuizType = 'mcq' | 'tf' | 'mcq_tf';

export const QUIZ_TYPES: { key: QuizType; label: string; description: string }[] = [
  {
    key: 'mcq',
    label: 'MCQs',
    description: 'Multiple-choice questions',
  },
  {
    key: 'tf',
    label: 'True / False',
    description: 'Decide whether each statement is true or false',
  },
  {
    key: 'mcq_tf',
    label: 'MCQs + True / False',
    description: 'A mix of both question types',
  },
];

export const DEFAULT_QUESTION_COUNT = 10;

export function isQuizType(value: string | null): value is QuizType {
  return value === 'mcq' || value === 'tf' || value === 'mcq_tf';
}
