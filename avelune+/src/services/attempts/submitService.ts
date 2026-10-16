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
  async submitQuiz(
    quizId: number,
    answers: SubmitAnswer[],
  ): Promise<GradedResult> {
    const { data, error } = await supabase.rpc('submit_quiz_attempt_with_result', {
      p_quiz_id: quizId,
      p_answers: answers,
    });
    if (error) throw wrapError(error, 'Could not submit quiz.');
    if (
      !data ||
      typeof data !== 'object' ||
      !('rows' in data) ||
      !Array.isArray(data.rows)
    ) {
      throw new Error('The quiz submission returned an invalid result.');
    }
    return data as GradedResult;
  },
};
