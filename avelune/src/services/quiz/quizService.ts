import { supabase } from '@/lib/supabase';
import { wrapError } from '@/utils/errors';
import type { Difficulty } from '@/screens/quiz/quizConfig';

/**
 * Quiz question fetching.
 *
 * Weighted sampling favouring questions the user has previously gotten
 * wrong. Reads question_attempts filtered to attempt_type = 'quiz', so
 * Quiz history stays independent of SEP.
 */

export interface QuizQuestion {
  id: number;
  question: string;
  options: string[];
  answer: 'A' | 'B' | 'C' | 'D';
  standardExplanation: string;
  premiumExplanation: string;
  difficulty: Difficulty;
}

interface QuestionBankRow {
  id: number;
  question: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_answer: string;
  standard_explanation: string;
  premium_explanation: string;
  difficulty: string;
}

const VALID_ANSWERS = ['A', 'B', 'C', 'D'] as const;

const LIVE_COLS =
  'id, question, option_a, option_b, option_c, option_d, difficulty';
const KEY_COLS =
  'id, correct_answer, standard_explanation, premium_explanation';

const W_NEVER_ATTEMPTED = 4;
const W_ALWAYS_CORRECT = 1;
const W_ALWAYS_WRONG = 8;

function parseQuestion(row: QuestionBankRow): QuizQuestion | null {
  const question = (row.question ?? '').trim();
  if (!question) return null;

  const options = [
    (row.option_a ?? '').trim(),
    (row.option_b ?? '').trim(),
    (row.option_c ?? '').trim(),
    (row.option_d ?? '').trim(),
  ];
  if (options.some((o) => !o)) return null;

  const rawAnswer = (row.correct_answer ?? '').trim().toUpperCase();
  const answer = VALID_ANSWERS.includes(rawAnswer as (typeof VALID_ANSWERS)[number])
    ? (rawAnswer as QuizQuestion['answer'])
    : 'A';

  return {
    id: row.id,
    question,
    options,
    answer,
    standardExplanation: (row.standard_explanation ?? '').trim(),
    premiumExplanation: (row.premium_explanation ?? '').trim(),
    difficulty: row.difficulty as Difficulty,
  };
}

interface AttemptHistoryEntry {
  correct: number;
  total: number;
}

function computeWeights(
  candidateIds: number[],
  attempts: { question_id: number; is_correct: boolean | null }[],
): Map<number, number> {
  const history = new Map<number, AttemptHistoryEntry>();
  for (const a of attempts) {
    if (a.is_correct === null) continue;
    const h = history.get(a.question_id) ?? { correct: 0, total: 0 };
    h.total += 1;
    if (a.is_correct) h.correct += 1;
    history.set(a.question_id, h);
  }

  const weights = new Map<number, number>();
  for (const id of candidateIds) {
    const h = history.get(id);
    if (!h || h.total === 0) {
      weights.set(id, W_NEVER_ATTEMPTED);
      continue;
    }
    const ratio = h.correct / h.total;
    const w =
      W_ALWAYS_CORRECT +
      (1 - ratio) * (W_ALWAYS_WRONG - W_ALWAYS_CORRECT);
    weights.set(id, w);
  }
  return weights;
}

function weightedSample<T extends { id: number }>(
  items: T[],
  weights: Map<number, number>,
  k: number,
): T[] {
  if (k <= 0) return [];
  if (k >= items.length) return [...items];

  const keyed = items.map((item) => {
    const w = Math.max(0.0001, weights.get(item.id) ?? 1);
    const key = Math.pow(Math.random(), 1 / w);
    return { item, key };
  });
  keyed.sort((a, b) => b.key - a.key);
  return keyed.slice(0, k).map((x) => x.item);
}

export interface QuizFilters {
  subject: string;
  difficulty: Difficulty;
  count: number;
}

export const quizService = {
  async getQuizQuestions(
    userId: string,
    filters: QuizFilters,
  ): Promise<QuizQuestion[]> {
    const { data: sylRows, error: sylErr } = await supabase
      .from('syllabus')
      .select('id')
      .eq('subject', filters.subject);

    if (sylErr)
      throw wrapError(sylErr, `Could not load ${filters.subject} syllabus.`);
    const syllabusIds = ((sylRows ?? []) as { id: number }[]).map((r) => r.id);
    if (syllabusIds.length === 0) return [];

    const { data: rows, error } = await supabase
      .from('question_bank_live')
      .select(LIVE_COLS)
      .in('syllabus_id', syllabusIds)
      .eq('question_type', 'mcq')
      .eq('difficulty', filters.difficulty);

    if (error)
      throw wrapError(error, `Could not load ${filters.subject} questions.`);

    const candidates: QuizQuestion[] = [];
    for (const row of (rows ?? []) as QuestionBankRow[]) {
      const q = parseQuestion(row);
      if (q) candidates.push(q);
      else if (import.meta.env.DEV) {
        console.warn('[QUIZ] Skipped malformed row id=', row.id);
      }
    }

    if (candidates.length === 0) return [];

    const ids = candidates.map((c) => c.id);
    const { data: attemptRows, error: attemptErr } = await supabase
      .from('question_attempts')
      .select('question_id, is_correct')
      .eq('user_id', userId)
      .eq('attempt_type', 'quiz')
      .in('question_id', ids);

    if (attemptErr)
      throw wrapError(attemptErr, 'Could not load attempt history.');

    const weights = computeWeights(
      ids,
      (attemptRows ?? []) as {
        question_id: number;
        is_correct: boolean | null;
      }[],
    );
    return weightedSample(candidates, weights, filters.count);
  },

  async attachQuizKeys(questions: QuizQuestion[]): Promise<QuizQuestion[]> {
    if (questions.length === 0) return questions;
    const ids = questions.map((q) => q.id);
    const { data, error } = await supabase
      .from('question_bank')
      .select(KEY_COLS)
      .in('id', ids);
    if (error) throw wrapError(error, 'Could not load answer keys.');
    const byId = new Map(
      ((data ?? []) as QuestionBankRow[]).map((row) => [row.id, row]),
    );
    return questions.map((q) => {
      const row = byId.get(q.id);
      if (!row) return q;
      const raw = (row.correct_answer ?? '').trim().toUpperCase();
      const answer = VALID_ANSWERS.includes(raw as (typeof VALID_ANSWERS)[number])
        ? (raw as QuizQuestion['answer'])
        : q.answer;
      return {
        ...q,
        answer,
        standardExplanation: (row.standard_explanation ?? '').trim(),
        premiumExplanation: (row.premium_explanation ?? '').trim(),
      };
    });
  },
};
