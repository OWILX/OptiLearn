import { supabase } from '@/lib/supabase';
import { wrapError } from '@/utils/errors';

export type QuestionReportType =
  | 'question'
  | 'answer'
  | 'explanation'
  | 'other';

export const questionReportService = {
  async create(input: {
    userId: string;
    questionId: number;
    reportType: QuestionReportType;
    description: string;
  }): Promise<void> {
    const { error } = await supabase.from('question_reports').insert({
      user_id: input.userId,
      question_id: input.questionId,
      report_type: input.reportType,
      description: input.description.trim() || null,
    });

    if (error) throw wrapError(error, 'Could not submit question feedback.');
  },
};
