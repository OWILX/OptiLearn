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
  /**
   * The syllabus topic this question belongs to.
   * Used by Ask AI to scope the per-topic daily cap on Platinum.
   */
  syllabusId: number | null;
  question: string;
  options: string[];
  answer: 'A' | 'B' | 'C' | 'D';
  standardExplanation: string;
  premiumExplanation: string;
  passageUuid: string | null;
  passage: string | null;
}

const VALID_ANSWERS = ['A', 'B', 'C', 'D'] as const;

export const QUESTION_BANK_SELECT =
  'id, syllabus_id, question_type, question, option_a, option_b, option_c, option_d, correct_answer, standard_explanation, premium_explanation, difficulty, cognitive_level, quality_grade';
export const QUESTION_BANK_LIVE_SELECT =
  'id, syllabus_id, question_type, question, option_a, option_b, option_c, option_d, difficulty, cognitive_level, quality_grade';
export const QUESTION_BANK_KEY_SELECT =
  'id, correct_answer, standard_explanation, premium_explanation';

/**
 * Parse a row from question_bank_live.
 *
 * The live view intentionally omits correct_answer and explanations.
 * Those authoritative fields are returned by submitSep()/submitQuiz()
 * after submission. During an active exam, the answer value here is only
 * a placeholder so the question can safely live in the session state.
 */
function parseLiveMCQ(row: QuestionBankRow): MCQQuestion | null {
  const question = (row.question ?? '').trim();
  if (!question) return null;

  const options = [
    (row.option_a ?? '').trim(),
    (row.option_b ?? '').trim(),
    (row.option_c ?? '').trim(),
    (row.option_d ?? '').trim(),
  ];
  if (options.some((o) => !o)) return null;

  return {
    id: row.id,
    syllabusId: row.syllabus_id ?? null,
    question,
    options,
    // Deliberately not the real answer. The live view does not expose it.
    answer: 'A',
    standardExplanation: '',
    premiumExplanation: '',
    passageUuid: null,
    passage: null,
  };
}

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
    syllabusId: row.syllabus_id ?? null,
    question,
    options,
    answer: answer as MCQQuestion['answer'],
    standardExplanation: (row.standard_explanation ?? '').trim(),
    premiumExplanation: (row.premium_explanation ?? '').trim(),
    passageUuid: null,
    passage: null,
  };
}

function clusterByPassage<T extends { passageUuid?: string | null }>(items: T[]): T[] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = item.passageUuid;
    if (!key) continue;
    const list = groups.get(key) ?? [];
    list.push(item);
    groups.set(key, list);
  }
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const key = item.passageUuid;
    if (!key) {
      out.push(item);
      continue;
    }
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(...(groups.get(key) ?? [item]));
  }
  return out;
}

export async function attachPassages<T extends { id: number; passageUuid?: string | null; passage?: string | null }>(
  questions: T[],
): Promise<T[]> {
  if (questions.length === 0) return questions;
  const ids = questions.map((q) => q.id);
  const { data: linkRows, error: linkError } = await supabase
    .from('question_bank')
    .select('id, passage_id')
    .in('id', ids);
  if (linkError) {
    console.warn('[PASSAGE] question_bank', linkError.message);
    return questions;
  }

  const uuidById = new Map<number, string>();
  for (const row of (linkRows ?? []) as { id: number; passage_id: string | null }[]) {
    if (row.passage_id) uuidById.set(row.id, row.passage_id);
  }
  const uuids = Array.from(new Set(uuidById.values()));
  if (uuids.length === 0) return questions;

  const { data: passages, error: passageError } = await supabase
    .from('question_passages')
    .select('id, passage_text')
    .in('id', uuids);
  if (passageError) {
    console.warn('[PASSAGE] question_passages', passageError.message);
    return questions;
  }

  const textByUuid = new Map<string, string>();
  for (const row of (passages ?? []) as { id: string; passage_text: string | null }[]) {
    const text = (row.passage_text ?? '').trim();
    if (row.id && text) textByUuid.set(row.id, text);
  }

  return questions.map((q) => {
    const uuid = uuidById.get(q.id) ?? null;
    return { ...q, passageUuid: uuid, passage: uuid ? textByUuid.get(uuid) ?? null : null };
  });
}

/**
 * Sampling weights per question id, matching the model guide:
 * never attempted 4, always correct 1, always wrong 8, mixed 4.
 */
function computeWeights(
  ids: number[],
  history: { question_id: number; is_correct: boolean | null }[],
): Map<number, number> {
  const byId = new Map<number, { correct: number; wrong: number }>();
  for (const row of history) {
    const entry = byId.get(row.question_id) ?? { correct: 0, wrong: 0 };
    if (row.is_correct === true) entry.correct += 1;
    else if (row.is_correct === false) entry.wrong += 1;
    byId.set(row.question_id, entry);
  }
  const weights = new Map<number, number>();
  for (const id of ids) {
    const h = byId.get(id);
    if (!h || (h.correct === 0 && h.wrong === 0)) {
      weights.set(id, 4);
    } else if (h.wrong === 0) {
      weights.set(id, 1);
    } else if (h.correct === 0) {
      weights.set(id, 8);
    } else {
      weights.set(id, 4);
    }
  }
  return weights;
}

/**
 * Sample `count` items without replacement, weighted by `weights`.
 * Ids missing from the map default to weight 4.
 */
function weightedSampleWithoutReplacement<T extends { id: number }>(
  items: T[],
  weights: Map<number, number>,
  count: number,
): T[] {
  const pool = items.slice();
  const w = pool.map((item) => weights.get(item.id) ?? 4);
  const out: T[] = [];
  const target = Math.min(count, pool.length);
  for (let i = 0; i < target; i += 1) {
    const total = w.reduce((a, b) => a + b, 0);
    if (total <= 0) break;
    let r = Math.random() * total;
    let pick = 0;
    for (let j = 0; j < w.length; j += 1) {
      r -= w[j];
      if (r <= 0) {
        pick = j;
        break;
      }
    }
    out.push(pool[pick]);
    pool.splice(pick, 1);
    w.splice(pick, 1);
  }
  return out;
}

export const questionService = {
  async getMCQsForTopic(syllabusId: number): Promise<MCQQuestion[]> {
    const { data, error } = await supabase.rpc('get_study_mcqs', {
      p_syllabus_id: syllabusId,
    });

    if (error) throw wrapError(error, 'Could not load questions.');

    const rows = (data ?? []) as QuestionBankRow[];
    const parsed: MCQQuestion[] = [];
    for (const row of rows) {
      const mcq = parseLiveMCQ(row);
      if (mcq) parsed.push(mcq);
      else if (import.meta.env.DEV) {
        console.warn('[QUESTIONS] Skipped malformed row id=', row.id);
      }
    }
    const keyed = await questionService.attachAnswerKeys(parsed);
    const withPassages = await attachPassages(keyed);
    return clusterByPassage(withPassages);
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
      .from('question_bank_live')
      .select(QUESTION_BANK_LIVE_SELECT)
      .in('syllabus_id', syllabusIds)
      .eq('question_type', 'mcq');

    if (error) throw wrapError(error, `Could not load ${subject} questions.`);

    const candidates: MCQQuestion[] = [];
    for (const row of (rows ?? []) as QuestionBankRow[]) {
      const mcq = parseLiveMCQ(row);
      if (mcq) candidates.push(mcq);
      else if (import.meta.env.DEV) {
        console.warn('[SEP] Skipped malformed live row id=', row.id);
      }
    }

    if (candidates.length === 0) return [];

    const ids = candidates.map((c) => c.id);
    // SEP-only history — keeps SEP weighting independent of Quiz.
    const { data: attemptRows, error: attemptErr } = await supabase
      .from('question_attempts')
      .select('question_id, is_correct')
      .eq('user_id', userId)
      .eq('attempt_type', 'sep')
      .in('question_id', ids);

    const history = attemptErr
      ? []
      : ((attemptRows ?? []) as {
          question_id: number;
          is_correct: boolean | null;
        }[]);
    const weights = computeWeights(ids, history);
    const sampled = weightedSampleWithoutReplacement(candidates, weights, count);
    const withPassages = await attachPassages(sampled);
    return clusterByPassage(withPassages);
  },

  async attachAnswerKeys(questions: MCQQuestion[]): Promise<MCQQuestion[]> {
    if (questions.length === 0) return questions;
    const ids = questions.map((q) => q.id);
    const { data, error } = await supabase
      .from('question_bank')
      .select(QUESTION_BANK_KEY_SELECT)
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
        ? (raw as MCQQuestion['answer'])
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
