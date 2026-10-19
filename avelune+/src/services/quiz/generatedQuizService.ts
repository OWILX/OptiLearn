import { supabase } from '@/lib/supabase';
import { UserFacingError, wrapError } from '@/utils/errors';

/**
 * Personalized quizzes generated from a study note. Questions are stored
 * server-side with their answer key; the play screen only receives answers
 * after the quiz is submitted.
 */

export type GeneratedQuestionType = 'mcq' | 'tf' | 'mcq_tf';
export type GeneratedQuestionKind = 'mcq' | 'tf';
export type GeneratedVerdict = 'correct' | 'wrong' | 'skipped';

export interface GeneratedQuestion {
  id: number;
  type: GeneratedQuestionKind;
  question: string;
  options: string[];
  answer?: string;
  explanation?: string;
  selected?: string | null;
  verdict?: GeneratedVerdict | null;
}

export interface GeneratedQuiz {
  quizId: number;
  noteSlug: string | null;
  noteTitle: string;
  courseName: string;
  topicName: string;
  subtopicName: string;
  questionType: GeneratedQuestionType;
  totalQuestions: number;
  correctAnswers: number;
  questionsAnswered: number;
  score: number | null;
  createdAt: string;
  completedAt: string | null;
  questions: GeneratedQuestion[];
}

export interface GeneratedQuizSummary {
  quizId: number;
  noteSlug: string | null;
  noteTitle: string;
  courseName: string;
  topicName: string;
  subtopicName: string;
  questionType: GeneratedQuestionType;
  totalQuestions: number;
  correctAnswers: number;
  questionsAnswered: number;
  score: number | null;
  createdAt: string;
  completedAt: string | null;
}

export interface GeneratedQuizContext {
  subtopicId: number;
  courseName: string;
  topicName: string;
  subtopicName: string;
  modulesCount: number;
  noteSlug: string | null;
  noteTitle: string | null;
}

export interface GenerateQuizResult {
  quizId: number;
  granted: number;
  used: number;
  limit: number;
}

export class GeneratedQuizError extends UserFacingError {
  readonly reason: string;

  constructor(reason: string, message: string) {
    super(message);
    this.name = 'GeneratedQuizError';
    this.reason = reason;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isQuestionType(value: unknown): value is GeneratedQuestionType {
  return value === 'mcq' || value === 'tf' || value === 'mcq_tf';
}

function isVerdict(value: unknown): value is GeneratedVerdict {
  return value === 'correct' || value === 'wrong' || value === 'skipped';
}

function parseQuestion(value: unknown): GeneratedQuestion | null {
  if (!isRecord(value)) return null;
  const id = Number(value.id);
  const type = value.type === 'tf' ? 'tf' : value.type === 'mcq' ? 'mcq' : null;
  if (!Number.isSafeInteger(id) || id <= 0 || !type) return null;
  if (typeof value.question !== 'string' || !value.question.trim()) return null;
  if (!Array.isArray(value.options)) return null;

  return {
    id,
    type,
    question: value.question,
    options: value.options.map((option) => String(option)),
    answer: typeof value.answer === 'string' ? value.answer : undefined,
    explanation:
      typeof value.explanation === 'string' ? value.explanation : undefined,
    selected: typeof value.selected === 'string' ? value.selected : null,
    verdict: isVerdict(value.verdict) ? value.verdict : null,
  };
}

function parseQuiz(value: unknown): GeneratedQuiz {
  if (!isRecord(value)) {
    throw new Error('The quiz service returned an invalid response.');
  }
  const quizId = Number(value.quiz_id);
  const questions = Array.isArray(value.questions)
    ? value.questions.map(parseQuestion)
    : [];
  if (
    !Number.isSafeInteger(quizId) ||
    quizId <= 0 ||
    typeof value.note_title !== 'string' ||
    !isQuestionType(value.question_type) ||
    questions.some((question) => question === null)
  ) {
    throw new Error('The quiz service returned an invalid response.');
  }

  return {
    quizId,
    noteSlug: typeof value.note_slug === 'string' ? value.note_slug : null,
    noteTitle: value.note_title,
    courseName: typeof value.course_name === 'string' ? value.course_name : '',
    topicName: typeof value.topic_name === 'string' ? value.topic_name : '',
    subtopicName:
      typeof value.subtopic_name === 'string' ? value.subtopic_name : '',
    questionType: value.question_type,
    totalQuestions:
      typeof value.total_questions === 'number' ? value.total_questions : 0,
    correctAnswers:
      typeof value.correct_answers === 'number' ? value.correct_answers : 0,
    questionsAnswered:
      typeof value.questions_answered === 'number'
        ? value.questions_answered
        : 0,
    score: typeof value.score === 'number' ? value.score : null,
    createdAt: String(value.created_at ?? ''),
    completedAt:
      typeof value.completed_at === 'string' ? value.completed_at : null,
    questions: questions.filter(
      (question): question is GeneratedQuestion => question !== null,
    ),
  };
}

function parseSummary(value: unknown): GeneratedQuizSummary | null {
  if (!isRecord(value)) return null;
  const quizId = Number(value.quiz_id);
  if (
    !Number.isSafeInteger(quizId) ||
    quizId <= 0 ||
    typeof value.note_title !== 'string' ||
    !isQuestionType(value.question_type)
  ) {
    return null;
  }
  return {
    quizId,
    noteSlug: typeof value.note_slug === 'string' ? value.note_slug : null,
    noteTitle: value.note_title,
    courseName: typeof value.course_name === 'string' ? value.course_name : '',
    topicName: typeof value.topic_name === 'string' ? value.topic_name : '',
    subtopicName:
      typeof value.subtopic_name === 'string' ? value.subtopic_name : '',
    questionType: value.question_type,
    totalQuestions:
      typeof value.total_questions === 'number' ? value.total_questions : 0,
    correctAnswers:
      typeof value.correct_answers === 'number' ? value.correct_answers : 0,
    questionsAnswered:
      typeof value.questions_answered === 'number'
        ? value.questions_answered
        : 0,
    score: typeof value.score === 'number' ? value.score : null,
    createdAt: String(value.created_at ?? ''),
    completedAt:
      typeof value.completed_at === 'string' ? value.completed_at : null,
  };
}

const FRIENDLY_REASONS: Record<string, string> = {
  plan_required:
    'Personalized quizzes are available on Plus and Pro. Upgrade to generate questions from your notes.',
  daily_limit:
    "You've used all of today's personalized questions. Your allowance resets tomorrow.",
  insufficient_source:
    'This note does not have enough content to generate a quiz yet. Try another subtopic.',
  subtopic_unavailable:
    'This subtopic is not available for personalized quizzes yet.',
  source_unavailable:
    "We couldn't load this note. Please try again in a moment.",
  usage_unavailable:
    "We couldn't check your allowance. Please try again in a moment.",
  provider_failed:
    'The question generator is busy right now. Please try again in a moment.',
  provider_empty:
    'The question generator returned an empty response. Please try again.',
  provider_invalid:
    'The generated questions were not usable. Please try again.',
  save_failed:
    "We couldn't save your quiz. Please try again in a moment.",
  server_misconfigured:
    'Personalized quizzes are temporarily unavailable. Please try again later.',
};

async function functionErrorMessage(error: unknown): Promise<{
  reason: string;
  message: string;
}> {
  const fallback = {
    reason: 'unknown',
    message: 'We could not generate a quiz. Please try again.',
  };
  if (!isRecord(error) || !isRecord(error.context)) return fallback;
  const context = error.context;
  if (typeof context.json !== 'function') return fallback;
  try {
    const response: unknown = await (context.json as () => Promise<unknown>)
      .call(context);
    if (isRecord(response) && typeof response.reason === 'string') {
      return {
        reason: response.reason,
        message:
          FRIENDLY_REASONS[response.reason] ??
          'We could not generate a quiz. Please try again.',
      };
    }
  } catch (parseError) {
    console.error('[GENERATED QUIZ] Could not parse the error response.', parseError);
  }
  return fallback;
}

export const generatedQuizService = {
  /** Labels + published note for a subtopic, or null when it is unknown. */
  async getContext(subtopicId: number): Promise<GeneratedQuizContext | null> {
    if (!Number.isSafeInteger(subtopicId) || subtopicId <= 0) return null;

    const [moduleRes, noteRes] = await Promise.all([
      supabase
        .from('syllabus')
        .select('course_name, topic_name, subtopic_name')
        .eq('subtopic_id', subtopicId)
        .order('id', { ascending: true }),
      supabase
        .from('pages')
        .select('slug, title')
        .eq('subtopic_id', subtopicId)
        .eq('status', 'published')
        .maybeSingle(),
    ]);

    if (moduleRes.error) {
      throw wrapError(moduleRes.error, 'Could not load this subtopic.');
    }
    if (noteRes.error) {
      throw wrapError(noteRes.error, 'Could not load the study note.');
    }

    const rows = (moduleRes.data ?? []) as {
      course_name: string;
      topic_name: string;
      subtopic_name: string;
    }[];
    if (rows.length === 0) return null;
    const first = rows[0];
    const note = noteRes.data as { slug: string; title: string } | null;

    return {
      subtopicId,
      courseName: first.course_name,
      topicName: first.topic_name,
      subtopicName: first.subtopic_name,
      modulesCount: rows.length,
      noteSlug: note?.slug ?? null,
      noteTitle: note?.title ?? null,
    };
  },

  async generate(input: {
    subtopicId: number;
    count: number;
    questionType: GeneratedQuestionType;
  }): Promise<GenerateQuizResult> {
    const { data, error } = await supabase.functions.invoke(
      'generate-note-quiz',
      {
        body: {
          subtopic_id: input.subtopicId,
          count: input.count,
          question_type: input.questionType,
        },
      },
    );

    if (error) {
      const { reason, message } = await functionErrorMessage(error);
      throw new GeneratedQuizError(reason, message);
    }
    if (!isRecord(data) || data.ok !== true) {
      const reason =
        isRecord(data) && typeof data.reason === 'string'
          ? data.reason
          : 'unknown';
      throw new GeneratedQuizError(
        reason,
        FRIENDLY_REASONS[reason] ??
          'We could not generate a quiz. Please try again.',
      );
    }

    const quizId = Number(data.quiz_id);
    if (!Number.isSafeInteger(quizId) || quizId <= 0) {
      throw new Error('The quiz generator returned an invalid quiz.');
    }
    return {
      quizId,
      granted: Number(data.granted) || 0,
      used: Number(data.used) || 0,
      limit: Number(data.limit) || 0,
    };
  },

  async getQuiz(quizId: number): Promise<GeneratedQuiz> {
    const { data, error } = await supabase.rpc('get_my_generated_quiz', {
      p_quiz_id: quizId,
    });
    if (error) throw wrapError(error, 'Could not load your quiz.');
    if (!data) {
      throw new UserFacingError('This quiz is no longer available.');
    }
    return parseQuiz(data);
  },

  async getHistory(limit = 20): Promise<GeneratedQuizSummary[]> {
    const { data, error } = await supabase.rpc('get_my_generated_quizzes', {
      p_limit: limit,
    });
    if (error) throw wrapError(error, 'Could not load your quizzes.');
    if (!Array.isArray(data)) {
      throw new Error('The quiz service returned an invalid response.');
    }
    return data
      .map(parseSummary)
      .filter((row): row is GeneratedQuizSummary => row !== null);
  },

  async submit(
    quizId: number,
    answers: { questionId: number; selected: string }[],
  ): Promise<void> {
    const { error } = await supabase.rpc('submit_generated_quiz', {
      p_quiz_id: quizId,
      p_answers: answers.map((answer) => ({
        question_id: answer.questionId,
        selected: answer.selected,
      })),
    });
    if (error) throw wrapError(error, 'Could not submit your quiz.');
  },
};


