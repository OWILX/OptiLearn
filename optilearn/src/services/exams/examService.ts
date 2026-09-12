import { supabase } from '@/lib/supabase';
import { wrapError } from '@/utils/errors';
import { parseMCQ, type QuestionBankRow } from '@/services/questions/questionService';

/**
 * Read-side of exam_attempts (for stats) and write-side (for SEP save).
 *
 * SEP subject storage: exam_attempts.subject holds a comma-separated
 * string of the 4 subjects in slot order, e.g.
 *   "Use of English,Mathematics,Physics,Chemistry"
 * Per-question subject detail lives in exam_attempt_questions via
 * question_bank.syllabus_id — used for future per-subject analytics.
 */

export interface ExamStats {
  attemptsCount: number;
  averageScore: number | null;
}

export interface RecentAttempt {
  id: number;
  /** Comma-joined subject string as stored in exam_attempts.subject. */
  subject: string | null;
  totalQuestions: number;
  correctAnswers: number;
  questionsAnswered: number;
  score: number | null;
  completedAt: string;
}

export interface AttemptListItem extends RecentAttempt {
  startedAt: string;
  timeLimitSeconds: number | null;
}

export type ReviewVerdict = 'correct' | 'wrong' | 'skipped';

export interface AttemptReviewQuestion {
  questionId: number;
  questionNumber: number;
  subject: string;
  question: string;
  options: string[];
  answer: 'A' | 'B' | 'C' | 'D';
  explanation: string;
  userAnswer: string | null;
  verdict: ReviewVerdict;
}

export interface AttemptDetail {
  attempt: AttemptListItem;
  questions: AttemptReviewQuestion[];
}

export interface SEPQuestionResult {
  questionId: number;
  selectedAnswer: string | null;
  isCorrect: boolean;
}

export interface SEPAttemptInput {
  userId: string;
  subjects: string[];
  startedAt: string;
  completedAt: string;
  timeLimitSeconds: number;
  totalQuestions: number;
  questionsAnswered: number;
  correctAnswers: number;
  score: number;
  questions: SEPQuestionResult[];
}

export const examService = {
  async getMyStats(userId: string): Promise<ExamStats> {
    const { data, error, count } = await supabase
      .from('exam_attempts')
      .select('score', { count: 'exact' })
      .eq('user_id', userId)
      .not('completed_at', 'is', null);

    if (error) throw wrapError(error, 'Could not load exam stats.');

    const scores = (data ?? [])
      .map((row) => row.score)
      .filter((s): s is number => typeof s === 'number' && !Number.isNaN(s));

    const averageScore =
      scores.length > 0
        ? scores.reduce((sum, s) => sum + s, 0) / scores.length
        : null;

    return {
      attemptsCount: count ?? 0,
      averageScore,
    };
  },

  /**
   * Most recent completed SEP attempts, newest first.
   * Returns [] when the user has no completed attempts.
   */
  async getRecentAttempts(
    userId: string,
    limit = 3,
  ): Promise<RecentAttempt[]> {
    const { data, error } = await supabase
      .from('exam_attempts')
      .select(
        'id, subject, total_questions, correct_answers, questions_answered, score, completed_at',
      )
      .eq('user_id', userId)
      .not('completed_at', 'is', null)
      .order('completed_at', { ascending: false })
      .limit(limit);

    if (error) throw wrapError(error, 'Could not load recent attempts.');

    return (data ?? []).map((row) => ({
      id: row.id as number,
      subject: (row.subject as string | null) ?? null,
      totalQuestions: row.total_questions as number,
      correctAnswers: row.correct_answers as number,
      questionsAnswered: row.questions_answered as number,
      score: row.score as number | null,
      completedAt: row.completed_at as string,
    }));
  },

  /**
   * Persist a completed SEP attempt.
   *
   * Writes three rows/row-sets:
   *   1. exam_attempts — one row for the session
   *   2. exam_attempt_questions — one row per question, in order
   *   3. question_attempts — only for answered questions (attempt_type='sep')
   *
   * Not transactional across tables — Supabase doesn't expose client-side
   * transactions. If step 2 or 3 fails partway, some data may be written.
   * Acceptable for now; the review screen still shows the user's results
   * regardless of persistence outcome.
   */
  async saveSEPAttempt(input: SEPAttemptInput): Promise<{ id: number }> {
    // 1. Exam attempt row
    const { data: examRow, error: examError } = await supabase
      .from('exam_attempts')
      .insert({
        user_id: input.userId,
        subject: input.subjects.join(','),
        total_questions: input.totalQuestions,
        questions_answered: input.questionsAnswered,
        correct_answers: input.correctAnswers,
        score: input.score,
        started_at: input.startedAt,
        completed_at: input.completedAt,
        time_limit_seconds: input.timeLimitSeconds,
      })
      .select('id')
      .single();

    if (examError) throw wrapError(examError, 'Could not save exam attempt.');
    if (!examRow) throw new Error('Exam insert returned no row.');

    const attemptId = examRow.id as number;

    // 2. Per-question rows
    const examQuestionRows = input.questions.map((q, i) => ({
      exam_attempt_id: attemptId,
      question_id: q.questionId,
      question_number: i + 1,
      selected_answer: q.selectedAnswer,
      is_correct: q.selectedAnswer !== null ? q.isCorrect : null,
      time_spent_seconds: null,
    }));

    if (examQuestionRows.length > 0) {
      const { error: eqError } = await supabase
        .from('exam_attempt_questions')
        .insert(examQuestionRows);
      if (eqError)
        throw wrapError(eqError, 'Could not save exam question rows.');
    }

    // 3. Question attempts (only answered)
    const qaRows = input.questions
      .filter((q) => q.selectedAnswer !== null)
      .map((q) => ({
        user_id: input.userId,
        question_id: q.questionId,
        selected_answer: q.selectedAnswer,
        is_correct: q.isCorrect,
        time_spent_seconds: null,
        attempt_type: 'sep' as const,
      }));

    if (qaRows.length > 0) {
      const { error: qaError } = await supabase
        .from('question_attempts')
        .insert(qaRows);
      if (qaError)
        throw wrapError(qaError, 'Could not save question attempts.');
    }

    return { id: attemptId };
  },

  /**
   * All completed SEP attempts for this user, newest first.
   * Capped at `limit` (default 50) — enough for the history screen
   * without pagination for now.
   */
  async getAttempts(userId: string, limit = 50): Promise<AttemptListItem[]> {
    const { data, error } = await supabase
      .from('exam_attempts')
      .select(
        'id, subject, total_questions, correct_answers, questions_answered, score, started_at, completed_at, time_limit_seconds',
      )
      .eq('user_id', userId)
      .not('completed_at', 'is', null)
      .order('completed_at', { ascending: false })
      .limit(limit);

    if (error) throw wrapError(error, 'Could not load attempts.');

    return (data ?? []).map((row) => ({
      id: row.id as number,
      subject: (row.subject as string | null) ?? null,
      totalQuestions: row.total_questions as number,
      correctAnswers: row.correct_answers as number,
      questionsAnswered: row.questions_answered as number,
      score: row.score as number | null,
      startedAt: row.started_at as string,
      completedAt: row.completed_at as string,
      timeLimitSeconds: (row.time_limit_seconds as number | null) ?? null,
    }));
  },

  /**
   * Load one attempt and every question the user answered/skipped.
   *
   * Three queries:
   *   1. exam_attempts row (single)
   *   2. exam_attempt_questions rows (ordered by question_number)
   *   3. question_bank rows for those question_ids
   *   4. syllabus rows to look up each question's subject
   */
  async getAttemptDetail(
    userId: string,
    attemptId: number,
  ): Promise<AttemptDetail | null> {
    // 1. Attempt summary
    const { data: attemptRow, error: attemptErr } = await supabase
      .from('exam_attempts')
      .select(
        'id, user_id, subject, total_questions, correct_answers, questions_answered, score, started_at, completed_at, time_limit_seconds',
      )
      .eq('id', attemptId)
      .eq('user_id', userId)
      .maybeSingle();

    if (attemptErr) throw wrapError(attemptErr, 'Could not load attempt.');
    if (!attemptRow) return null;

    const attempt: AttemptListItem = {
      id: attemptRow.id as number,
      subject: (attemptRow.subject as string | null) ?? null,
      totalQuestions: attemptRow.total_questions as number,
      correctAnswers: attemptRow.correct_answers as number,
      questionsAnswered: attemptRow.questions_answered as number,
      score: attemptRow.score as number | null,
      startedAt: attemptRow.started_at as string,
      completedAt: attemptRow.completed_at as string,
      timeLimitSeconds: (attemptRow.time_limit_seconds as number | null) ?? null,
    };

    // 2. Per-question rows
    const { data: eqRows, error: eqErr } = await supabase
      .from('exam_attempt_questions')
      .select('question_id, question_number, selected_answer, is_correct')
      .eq('exam_attempt_id', attemptId)
      .order('question_number', { ascending: true });

    if (eqErr)
      throw wrapError(eqErr, 'Could not load exam question rows.');

    const eq = (eqRows ?? []) as {
      question_id: number;
      question_number: number;
      selected_answer: string | null;
      is_correct: boolean | null;
    }[];

    if (eq.length === 0) {
      return { attempt, questions: [] };
    }

    const questionIds = eq.map((r) => r.question_id);

    // 3. question_bank rows for these ids
    const { data: qbRows, error: qbErr } = await supabase
      .from('question_bank')
      .select('id, syllabus_id, question_type, question_data, created_at')
      .in('id', questionIds);

    if (qbErr)
      throw wrapError(qbErr, 'Could not load question details.');

    const qbMap = new Map<number, QuestionBankRow>();
    for (const row of (qbRows ?? []) as QuestionBankRow[]) {
      qbMap.set(row.id, row);
    }

    // 4. syllabus rows for subject lookup
    const syllabusIds = Array.from(
      new Set(
        ((qbRows ?? []) as QuestionBankRow[]).map((r) => r.syllabus_id),
      ),
    );

    const { data: sylRows, error: sylErr } = await supabase
      .from('syllabus')
      .select('id, subject')
      .in('id', syllabusIds);

    if (sylErr)
      throw wrapError(sylErr, 'Could not load subject info.');

    const subjectBySyllabus = new Map<number, string>();
    for (const s of (sylRows ?? []) as { id: number; subject: string }[]) {
      subjectBySyllabus.set(s.id, s.subject);
    }

    // Reconstruct rows
    const questions: AttemptReviewQuestion[] = [];
    for (const row of eq) {
      const qb = qbMap.get(row.question_id);
      if (!qb) continue;
      const mcq = parseMCQ(qb);
      if (!mcq) continue;

      const subject =
        subjectBySyllabus.get(qb.syllabus_id) ?? 'Unknown subject';

      let verdict: ReviewVerdict;
      if (row.selected_answer === null) verdict = 'skipped';
      else if (row.is_correct) verdict = 'correct';
      else verdict = 'wrong';

      questions.push({
        questionId: mcq.id,
        questionNumber: row.question_number,
        subject,
        question: mcq.question,
        options: mcq.options,
        answer: mcq.answer,
        explanation: mcq.explanation,
        userAnswer: row.selected_answer,
        verdict,
      });
    }

    return { attempt, questions };
  },
};
