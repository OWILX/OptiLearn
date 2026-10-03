import { supabase } from '@/lib/supabase';
import { wrapError } from '@/utils/errors';

export type SubmitVerdict = 'correct' | 'wrong' | 'skipped';

export interface SubmitAnswer {
  question_id: number;
  selected: string | null;
}

export interface GradedRow {
  question_id: number;
  correct_answer: string | null;
  selected: string | null;
  verdict: SubmitVerdict;
  standard_explanation: string;
  premium_explanation: string;
}

export interface GradedResult {
  attempt_id?: number;
  correct: number;
  answered: number;
  total: number;
  score: number;
  rows: GradedRow[];
}

export const submitService = {
  async submitQuiz(answers: SubmitAnswer[]): Promise<GradedResult> {
    const { data, error } = await supabase.rpc('submit_quiz_attempt', {
      p_answers: answers,
    });
    if (error) throw wrapError(error, 'Could not submit quiz.');
    return data as GradedResult;
  },

  async submitSep(input: {
    subjects: string[];
    startedAt: string;
    timeLimitSeconds: number;
    answers: SubmitAnswer[];
  }): Promise<GradedResult> {
    const { data, error } = await supabase.rpc('submit_sep_attempt', {
      p_subjects: input.subjects,
      p_started_at: input.startedAt,
      p_time_limit_seconds: input.timeLimitSeconds,
      p_answers: input.answers,
    });
    if (error) throw wrapError(error, 'Could not submit exam.');
    return data as GradedResult;
  },
};
