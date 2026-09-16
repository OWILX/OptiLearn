import { supabase } from '@/lib/supabase';
import { wrapError } from '@/utils/errors';

/**
 * Read-side of question_bank (flat schema).
 *
 * Study reader uses `getMCQsForTopic` — full topic, in order.
 * SEP exam uses `getSEPQuestions` — weighted random sample by subject.
 *
 * Explanations come in two flavours (standard / premium). Callers choose
 * which to render based on the user's `profiles.premium` flag.
 */

export interface QuestionBankRow {
  id: number;
  syllabus_id: number;
  question_type: string;
  question: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  correct_answer: string;
  standard_explanation: string;
  premium_explanation: string;
  difficulty: string | null;
  cognitive_level: string | null;
  quality_grade: string | null;
}

export interface MCQQuestion {
  id: number;
  question: string;
  options: string[];
  answer: 'A' | 'B' | 'C' | 'D';
  standardExplanation: string;
  premiumExplanation: string;
}

const VALID_ANSWERS = ['A', 'B', 'C', 'D'] as const;

const SELECT_COLS =
  'id, syllabus_id, question_type, question, option_a, option_b, option_c, option_d, correct_answer, standard_explanation, premium_explanation, difficulty, cognitive_level, quality_grade';

export function parseMCQ(row: QuestionBankRow): MCQQuestion | null {
  const question = (row.question ?? '').trim();
  if (!question) return null;

  const options = [
    (row.option_a ?? '').trim(),
    (row.option_b ?? '').trim(),
    (row.option_c ?? '').trim(),
    (row.option_d ?? '').trim(),
  ];
  if (options.some((o) => !o)) return null;

  const answer = (row.correct_answer ?? '').trim().toUpperCase();
  if (!VALID_ANSWERS.includes(answer as (typeof VALID_ANSWERS)[number])) {
    return null;
  }

  return {
    id: row.id,
    question,
    options,
    answer: answer as MCQQuestion['answer'],
    standardExplanation: (row.standard_explanation ?? '').trim(),
    premiumExplanation: (row.premium_explanation ?? '').trim(),
  };
}

/* ============================================================
   Weighted sampling
   ============================================================ */

const W_NEVER_ATTEMPTED = 4;
const W_ALWAYS_CORRECT = 1;
const W_ALWAYS_WRONG = 8;

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

function weightedSampleWithoutReplacement<T extends { id: number }>(
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

/* ============================================================
   Service
   ============================================================ */

export const questionService = {
  async getMCQsForTopic(syllabusId: number): Promise<MCQQuestion[]> {
    const { data, error } = await supabase
      .from('question_bank')
      .select(SELECT_COLS)
      .eq('syllabus_id', syllabusId)
      .eq('question_type', 'mcq')
      .order('id', { ascending: true });

    if (error) throw wrapError(error, 'Could not load questions.');

    const rows = (data ?? []) as QuestionBankRow[];
    const parsed: MCQQuestion[] = [];
    for (const row of rows) {
      const mcq = parseMCQ(row);
      if (mcq) parsed.push(mcq);
      else if (import.meta.env.DEV) {
        console.warn('[QUESTIONS] Skipped malformed row id=', row.id);
      }
    }
    return parsed;
  },

  async getSEPQuestions(
    userId: string,
    subject: string,
    count: number,
  ): Promise<MCQQuestion[]> {
    const { data: sylRows, error: sylErr } = await supabase
      .from('syllabus')
      .select('id')
      .eq('subject', subject);

    if (sylErr) throw wrapError(sylErr, `Could not load ${subject} syllabus.`);
    const syllabusIds = ((sylRows ?? []) as { id: number }[]).map((r) => r.id);
    if (syllabusIds.length === 0) return [];

    const { data: rows, error } = await supabase
      .from('question_bank')
      .select(SELECT_COLS)
      .in('syllabus_id', syllabusIds)
      .eq('question_type', 'mcq');

    if (error) throw wrapError(error, `Could not load ${subject} questions.`);

    const candidates: MCQQuestion[] = [];
    for (const row of (rows ?? []) as QuestionBankRow[]) {
      const mcq = parseMCQ(row);
      if (mcq) candidates.push(mcq);
      else if (import.meta.env.DEV) {
        console.warn('[SEP] Skipped malformed row id=', row.id);
      }
    }

    if (candidates.length === 0) return [];

    const ids = candidates.map((c) => c.id);
    const { data: attemptRows, error: attemptErr } = await supabase
      .from('question_attempts')
      .select('question_id, is_correct')
      .eq('user_id', userId)
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
    return weightedSampleWithoutReplacement(candidates, weights, count);
  },
};
