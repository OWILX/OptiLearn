import { supabase } from '@/lib/supabase';
import { wrapError } from '@/utils/errors';

/**
 * Write-side of question_attempts.
 *
 * Every answered question across every mode (practice, SEP, daily
 * challenge) lands here. The SEP weighted sampler reads this table to
 * decide which questions to favor next time.
 *
 * Only answered questions are logged. Skipped questions are not
 * recorded here — writing them with is_correct = null would pollute
 * the correctness ratio and skew the sampler.
 */

export type AttemptType = 'practice' | 'sep' | 'daily_challenge';

export interface AttemptInput {
  questionId: number;
  selectedAnswer: string;
  isCorrect: boolean;
  timeSpentSeconds?: number | null;
  attemptType: AttemptType;
}

interface AttemptRow {
  user_id: string;
  question_id: number;
  selected_answer: string;
  is_correct: boolean;
  time_spent_seconds: number | null;
  attempt_type: AttemptType;
}

function toRow(userId: string, input: AttemptInput): AttemptRow {
  return {
    user_id: userId,
    question_id: input.questionId,
    selected_answer: input.selectedAnswer,
    is_correct: input.isCorrect,
    time_spent_seconds: input.timeSpentSeconds ?? null,
    attempt_type: input.attemptType,
  };
}

export const attemptService = {
  /** Log a single attempt. */
  async logAttempt(userId: string, input: AttemptInput): Promise<void> {
    const { error } = await supabase
      .from('question_attempts')
      .insert(toRow(userId, input));
    if (error) throw wrapError(error, 'Could not save attempt.');
  },

  /** Log a batch of attempts in one round trip. */
  async logAttempts(userId: string, inputs: AttemptInput[]): Promise<void> {
    if (inputs.length === 0) return;
    const rows = inputs.map((i) => toRow(userId, i));
    const { error } = await supabase.from('question_attempts').insert(rows);
    if (error) throw wrapError(error, 'Could not save attempts.');
  },
};
