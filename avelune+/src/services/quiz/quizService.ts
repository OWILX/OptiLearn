import { supabase } from '@/lib/supabase';
import { wrapError } from '@/utils/errors';
import type { QuizType } from '@/screens/quiz/quizConfig';
import { DailyPlanQuotaError } from '@/services/plans/planService';

export interface QuizQuestion {
  id: number;
  kind: 'mcq' | 'tf';
  question: string;
  options: string[];
  answer: string;
  standardExplanation: string;
  premiumExplanation: string;
}

interface CreatedQuiz {
  quizId: number;
  questions: QuizQuestion[];
}

export interface QuizHistorySummary {
  id: number;
  type: string;
  totalQuestions: number;
  correctAnswers: number;
  questionsAnswered: number;
  score: number;
  completedAt: string;
}

export interface QuizHistoryQuestion extends QuizQuestion {
  userAnswer: string | null;
  verdict: 'correct' | 'wrong' | 'skipped';
}

export interface QuizHistoryReview {
  quiz: QuizHistorySummary;
  questions: QuizHistoryQuestion[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function parseQuizQuestion(value: unknown): QuizQuestion | null {
  if (
    !isRecord(value) ||
    typeof value.id !== 'number' ||
    !Number.isSafeInteger(value.id)
  ) {
    return null;
  }

  const kind = value.type;
  if (kind !== 'mcq' && kind !== 'tf') return null;

  const question =
    kind === 'tf'
      ? typeof value.statement === 'string'
        ? value.statement.trim()
        : ''
      : typeof value.question === 'string'
        ? value.question.trim()
        : '';

  if (!question) return null;

  if (kind === 'tf') {
    return {
      id: value.id,
      kind,
      question,
      options: ['T', 'F'],
      answer: '',
      standardExplanation: '',
      premiumExplanation: '',
    };
  }

  if (
    !Array.isArray(value.options) ||
    value.options.length !== 4 ||
    !value.options.every(isNonEmptyString)
  ) {
    return null;
  }

  return {
    id: value.id,
    kind,
    question,
    options: value.options.map((option) => option.trim()),
    answer: '',
    standardExplanation: '',
    premiumExplanation: '',
  };
}

function parseHistorySummary(value: unknown): QuizHistorySummary | null {
  if (
    !isRecord(value) ||
    typeof value.quiz_id !== 'number' ||
    typeof value.quiz_type !== 'string' ||
    typeof value.total_questions !== 'number' ||
    typeof value.correct_answers !== 'number' ||
    typeof value.questions_answered !== 'number' ||
    typeof value.score !== 'number' ||
    typeof value.completed_at !== 'string'
  ) {
    return null;
  }

  return {
    id: value.quiz_id,
    type: value.quiz_type,
    totalQuestions: value.total_questions,
    correctAnswers: value.correct_answers,
    questionsAnswered: value.questions_answered,
    score: value.score,
    completedAt: value.completed_at,
  };
}

function parseHistoryQuestion(value: unknown): QuizHistoryQuestion | null {
  if (!isRecord(value)) return null;
  const question = parseQuizQuestion(value);
  const verdict = value.verdict;
  const selected =
    typeof value.selected === 'string' ? value.selected : null;
  if (
    !question ||
    (verdict !== 'correct' && verdict !== 'wrong' && verdict !== 'skipped') ||
    (selected !== null && typeof selected !== 'string') ||
    typeof value.answer !== 'string' ||
    typeof value.standardExplanation !== 'string' ||
    typeof value.premiumExplanation !== 'string'
  ) {
    return null;
  }

  return {
    ...question,
    answer: value.answer,
    standardExplanation: value.standardExplanation,
    premiumExplanation: value.premiumExplanation,
    userAnswer: selected,
    verdict,
  };
}

export const quizService = {
  async createQuiz(input: {
    moduleIds: number[];
    questionCount: number;
    type: QuizType;
  }): Promise<CreatedQuiz> {
    const { data, error } = await supabase.rpc('create_curriculum_quiz', {
      p_modules: input.moduleIds,
      p_num: input.questionCount,
      p_type: input.type,
    });

    if (error) {
      if (error.message.includes('DAILY_QUIZ_QUESTION_LIMIT_REACHED')) {
        throw new DailyPlanQuotaError(
          'quiz_questions',
          "You've used today's new quiz-question allowance. Your limit resets tomorrow. Review questions you've already seen, or view plans to increase your daily allowance.",
        );
      }
      throw wrapError(error, 'Could not create quiz.');
    }
    if (!isRecord(data) || data.ok !== true || !Array.isArray(data.questions)) {
      throw new Error('The quiz service returned an invalid quiz.');
    }

    const quizId = Number(data.quiz_id);
    if (!Number.isSafeInteger(quizId) || quizId <= 0) {
      throw new Error('The quiz service returned an invalid quiz ID.');
    }

    const parsedQuestions = data.questions.map(parseQuizQuestion);
    if (parsedQuestions.some((question) => question === null)) {
      throw new Error('The quiz contains a question with invalid data.');
    }
    const questions = parsedQuestions.filter(
      (question): question is QuizQuestion => question !== null,
    );
    if (questions.length === 0) {
      throw new Error('No questions are available in the selected modules.');
    }

    return { quizId, questions };
  },

  async getQuizCount(): Promise<number> {
    const { data, error } = await supabase.rpc('get_my_quiz_count');
    if (error) throw wrapError(error, 'Could not load quiz stats.');
    if (typeof data !== 'number' || !Number.isSafeInteger(data) || data < 0) {
      throw new Error('The quiz stats service returned an invalid count.');
    }
    return data;
  },

  async getRecentQuizzes(limit = 3): Promise<QuizHistorySummary[]> {
    const { data, error } = await supabase.rpc('get_my_quiz_history', {
      p_limit: limit,
    });
    if (error) throw wrapError(error, 'Could not load recent quizzes.');
    if (!Array.isArray(data)) {
      throw new Error('The quiz history service returned an invalid response.');
    }

    const summaries = data.map(parseHistorySummary);
    if (summaries.some((summary) => summary === null)) {
      throw new Error('The quiz history contains invalid data.');
    }
    return summaries.filter(
      (summary): summary is QuizHistorySummary => summary !== null,
    );
  },

  async getQuizReview(quizId: number): Promise<QuizHistoryReview> {
    const { data, error } = await supabase.rpc('get_my_quiz_review', {
      p_quiz_id: quizId,
    });
    if (error) throw wrapError(error, 'Could not load quiz review.');
    if (
      !isRecord(data) ||
      typeof data.quiz_id !== 'number' ||
      typeof data.quiz_type !== 'string' ||
      typeof data.total_questions !== 'number' ||
      typeof data.correct_answers !== 'number' ||
      typeof data.questions_answered !== 'number' ||
      typeof data.score !== 'number' ||
      typeof data.completed_at !== 'string' ||
      !Array.isArray(data.questions)
    ) {
      throw new Error('The quiz review service returned an invalid response.');
    }

    const summary = parseHistorySummary({
      quiz_id: data.quiz_id,
      quiz_type: data.quiz_type,
      total_questions: data.total_questions,
      correct_answers: data.correct_answers,
      questions_answered: data.questions_answered,
      score: data.score,
      completed_at: data.completed_at,
    });
    const questions = data.questions.map(parseHistoryQuestion);
    if (!summary || questions.some((question) => question === null)) {
      throw new Error('The quiz review contains invalid data.');
    }
    const parsedQuestions = questions.filter(
      (question): question is QuizHistoryQuestion => question !== null,
    );
    if (parsedQuestions.length !== summary.totalQuestions) {
      throw new Error('The quiz review is missing one or more questions.');
    }

    return { quiz: summary, questions: parsedQuestions };
  },
};
