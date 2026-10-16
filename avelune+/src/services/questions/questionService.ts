import { supabase } from '@/lib/supabase';
import { wrapError } from '@/utils/errors';
import { DailyPlanQuotaError } from '@/services/plans/planService';

export interface StudyQuestion {
  id: number;
  kind: 'mcq' | 'tf';
  question: string;
  options: string[];
  answer: string;
  explanation: string;
}

interface StudyQuestionsResponse {
  questions: unknown[];
  statements: unknown[];
  has_more: boolean;
}

export interface StudyQuestionsResult {
  questions: StudyQuestion[];
  hasMore: boolean;
}

const VALID_ANSWERS = ['A', 'B', 'C', 'D'] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseStudyMCQ(value: unknown): StudyQuestion | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.id !== 'number' ||
    !Number.isSafeInteger(value.id) ||
    typeof value.question !== 'string' ||
    !Array.isArray(value.options) ||
    !value.options.every((option) => typeof option === 'string') ||
    typeof value.answer !== 'string'
  ) {
    return null;
  }

  const question = value.question.trim();
  const options = value.options.map((option) => option.trim());
  const answer = value.answer.trim().toUpperCase();
  if (
    !question ||
    options.length !== 4 ||
    options.some((option) => !option) ||
    !VALID_ANSWERS.includes(answer as (typeof VALID_ANSWERS)[number])
  ) {
    return null;
  }

  return {
    id: value.id,
    kind: 'mcq',
    question,
    options,
    answer,
    explanation: typeof value.explanation === 'string' ? value.explanation : '',
  };
}

function parseStudyStatement(value: unknown): StudyQuestion | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.id !== 'number' ||
    !Number.isSafeInteger(value.id) ||
    typeof value.statement !== 'string' ||
    typeof value.answer !== 'string'
  ) {
    return null;
  }

  const question = value.statement.trim();
  const answer = value.answer.trim().toLowerCase();
  if (
    !question ||
    (answer !== 'true' && answer !== 'false' && answer !== 't' && answer !== 'f')
  ) {
    return null;
  }

  return {
    id: value.id,
    kind: 'tf',
    question,
    options: ['True', 'False'],
    answer: answer === 'true' || answer === 't' ? 'True' : 'False',
    explanation: typeof value.explanation === 'string' ? value.explanation : '',
  };
}

function parseStudyQuestions(data: unknown): StudyQuestionsResult {
  if (
    isRecord(data) &&
    data.error_code === 'DAILY_STUDY_QUESTION_LIMIT_REACHED'
  ) {
    throw new DailyPlanQuotaError(
      'study_questions',
      "You've used today's new study-question allowance. Your limit resets tomorrow. Review questions you've already seen, or view plans to increase your daily allowance.",
    );
  }
  if (
    !isRecord(data) ||
    !Array.isArray(data.questions) ||
    !Array.isArray(data.statements) ||
    typeof data.has_more !== 'boolean'
  ) {
    throw new Error('The question service returned an invalid response.');
  }

  const response: StudyQuestionsResponse = {
    questions: data.questions,
    statements: data.statements,
    has_more: data.has_more,
  };
  const questions: StudyQuestion[] = [];
  for (const question of response.questions) {
    const parsed = parseStudyMCQ(question);
    if (parsed) questions.push(parsed);
    else if (import.meta.env.DEV) {
      console.warn('[QUESTIONS] Skipped malformed study MCQ.', question);
    }
  }
  for (const statement of response.statements) {
    const parsed = parseStudyStatement(statement);
    if (parsed) questions.push(parsed);
    else if (import.meta.env.DEV) {
      console.warn('[QUESTIONS] Skipped malformed study statement.', statement);
    }
  }

  for (let i = questions.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [questions[i], questions[j]] = [questions[j], questions[i]];
  }

  return { questions, hasMore: response.has_more };
}

/* ============================================================
   Service
   ============================================================ */

export const questionService = {
  async getStudyQuestions(syllabusId: number): Promise<StudyQuestionsResult> {
    const { data, error } = await supabase.rpc('get_questions', {
      p_syllabus_id: syllabusId,
    });

    if (error) throw wrapError(error, 'Could not load questions.');
    return parseStudyQuestions(data);
  },

  async markStudyQuestionViewed(
    syllabusId: number,
    questionId: number,
  ): Promise<void> {
    const { data, error } = await supabase.rpc(
      'mark_study_question_viewed',
      {
        p_syllabus_id: syllabusId,
        p_question_id: questionId,
      },
    );

    if (error) throw wrapError(error, 'Could not record question view.');
    if (!isRecord(data)) {
      throw new Error('The question view service returned an invalid response.');
    }
    if (data.error_code === 'DAILY_STUDY_QUESTION_LIMIT_REACHED') {
      throw new DailyPlanQuotaError(
        'study_questions',
        "You've used today's new study-question allowance. Your limit resets tomorrow. Review questions you've already seen, or view plans to increase your daily allowance.",
      );
    }
    if (data.ok !== true) {
      throw new Error('The question view could not be recorded.');
    }
  },
};
