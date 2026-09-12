import { supabase } from '@/lib/supabase';
import { wrapError } from '@/utils/errors';

/**
 * Read-side of question_bank.
 *
 * Study reader uses `getMCQsForTopic` — full topic, in order.
 * SEP exam uses `getSEPQuestions` — weighted random sample by subject.
 */

export interface QuestionBankRow {
  id: number;
  syllabus_id: number;
  question_type: string;
  question_data: unknown;
  created_at: string;
}

export interface MCQQuestion {
  id: number;
  question: string;
  options: string[];
  answer: 'A' | 'B' | 'C' | 'D';
  explanation: string;
}

const VALID_ANSWERS = ['A', 'B', 'C', 'D'] as const;

/**
 * Validate a raw question_bank row into a renderable MCQ.
 * Returns null for anything malformed — callers skip those rows.
 */
export function parseMCQ(row: QuestionBankRow): MCQQuestion | null {
  const raw = row.question_data;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;

  const data = raw as Record<string, unknown>;

  const question = typeof data.question === 'string' ? data.question.trim() : '';
  if (!question) return null;

  const options = data.options;
  if (!Array.isArray(options) || options.length !== 4) return null;
  if (!options.every((o) => typeof o === 'string' && o.trim().length > 0)) {
    return null;
  }

  const answer = typeof data.answer === 'string' ? data.answer.trim().toUpperCase() : '';
  if (!VALID_ANSWERS.includes(answer as (typeof VALID_ANSWERS)[number])) {
    return null;
  }

  const explanation =
    typeof data.explanation === 'string' ? data.explanation.trim() : '';

  return {
    id: row.id,
    question,
    options: options.map((o) => (o as string).trim()),
    answer: answer as MCQQuestion['answer'],
    explanation,
  };
}

/* ============================================================
   Weighted sampling
   ============================================================ */

/**
 * Weights used by the SEP sampler.
 *   - Questions the user has never attempted get medium weight.
 *   - Questions the user always answers correctly get the LOWEST weight.
 *   - Questions the user always answers wrong get the HIGHEST weight.
 */
const W_NEVER_ATTEMPTED = 4;
const W_ALWAYS_CORRECT = 1;
const W_ALWAYS_WRONG = 8;

interface AttemptHistoryEntry {
  correct: number;
  total: number;
}

/**
 * Compute per-question weights from the user's attempt history.
 *
 * Weight = 1 + (1 − correctRatio) × 7    (for seen questions)
 * Weight = 4                              (for unseen questions)
 *
 * Never-attempted questions get the mid-range value so new topics still
 * appear at a healthy rate.
 */
function computeWeights(
  candidateIds: number[],
  attempts: { question_id: number; is_correct: boolean | null }[],
): Map<number, number> {
  const history = new Map<number, AttemptHistoryEntry>();
  for (const a of attempts) {
    if (a.is_correct === null) continue; // ignore incomplete rows
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

/**
 * Weighted random sample without replacement.
 * Uses Efraimidis-Spirakis (A-Res): key = random()^(1/w), take top-K.
 */
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
  /**
   * All MCQs for a topic, ordered by id. Used by the Study reader.
   */
  async getMCQsForTopic(syllabusId: number): Promise<MCQQuestion[]> {
    const { data, error } = await supabase
      .from('question_bank')
      .select('id, syllabus_id, question_type, question_data, created_at')
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

  /**
   * Build a SEP question set for one subject.
   *
   * Picks `count` questions from question_bank belonging to `subject`,
   * weighted by the user's attempt history (see `computeWeights`).
   *
   * Returns fewer than `count` when the pool is smaller.
   */
  async getSEPQuestions(
    userId: string,
    subject: string,
    count: number,
  ): Promise<MCQQuestion[]> {
    // 1. Find syllabus ids for this subject.
    const { data: sylRows, error: sylErr } = await supabase
      .from('syllabus')
      .select('id')
      .eq('subject', subject);

    if (sylErr) throw wrapError(sylErr, `Could not load ${subject} syllabus.`);
    const syllabusIds = ((sylRows ?? []) as { id: number }[]).map((r) => r.id);
    if (syllabusIds.length === 0) return [];

    // 2. Fetch candidate questions.
    const { data: rows, error } = await supabase
      .from('question_bank')
      .select('id, syllabus_id, question_type, question_data, created_at')
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

    // 3. Fetch attempt history for these candidates.
    const ids = candidates.map((c) => c.id);
    const { data: attemptRows, error: attemptErr } = await supabase
      .from('question_attempts')
      .select('question_id, is_correct')
      .eq('user_id', userId)
      .in('question_id', ids);

    if (attemptErr)
      throw wrapError(attemptErr, 'Could not load attempt history.');

    // 4. Weight + sample.
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
