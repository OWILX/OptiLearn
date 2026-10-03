export const TIME_OPTIONS = [5, 10, 15, 20] as const;
export const QUESTION_OPTIONS = [5, 10, 15, 20, 25] as const;

export type Difficulty = 'easy' | 'medium' | 'hard';

export const DIFFICULTIES: { key: Difficulty; label: string }[] = [
  { key: 'easy', label: 'Easy' },
  { key: 'medium', label: 'Medium' },
  { key: 'hard', label: 'Hard' },
];

export const DEFAULT_TIME_MINUTES = 10;
export const DEFAULT_QUESTION_COUNT = 10;
export const DEFAULT_DIFFICULTY: Difficulty = 'medium';
