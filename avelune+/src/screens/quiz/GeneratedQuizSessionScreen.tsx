import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, X } from 'lucide-react';
import { BackButton } from '@/components/ui/BackButton';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import {
  generatedQuizService,
  type GeneratedQuestion,
  type GeneratedQuiz,
  type GeneratedQuestionType,
} from '@/services/quiz/generatedQuizService';
import { studyNoteUrl } from '@/services/notes/notesLinkService';
import { userFacingErrorMessage } from '@/utils/errors';
import styles from './GeneratedQuiz.module.css';

const LETTERS = ['A', 'B', 'C', 'D'] as const;

function formatType(type: GeneratedQuestionType): string {
  if (type === 'mcq_tf') return 'MCQ + True/False';
  if (type === 'tf') return 'True/False';
  return 'MCQ';
}

function optionValue(question: GeneratedQuestion, index: number): string {
  return question.type === 'tf' ? (index === 0 ? 'T' : 'F') : LETTERS[index];
}

function optionLabel(
  question: GeneratedQuestion,
  option: string,
  index: number,
): string {
  if (question.type !== 'tf') return option;
  return index === 0 ? 'True' : 'False';
}

function formatDate(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function GeneratedQuizSessionScreen() {
  const navigate = useNavigate();
  const { quizId: quizIdParam } = useParams<{ quizId: string }>();
  const quizId = Number(quizIdParam);
  const validQuizId = Number.isSafeInteger(quizId) && quizId > 0;

  const [loadState, setLoadState] = useState<{
    quizId: number;
    status: 'loading' | 'success' | 'error';
    quiz?: GeneratedQuiz;
    error?: string;
  }>({ quizId: Number.NaN, status: 'loading' });

  useEffect(() => {
    if (!validQuizId) return;
    let cancelled = false;
    generatedQuizService
      .getQuiz(quizId)
      .then((quiz) => {
        if (!cancelled) {
          setLoadState({ quizId, status: 'success', quiz });
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setLoadState({
            quizId,
            status: 'error',
            error: userFacingErrorMessage(
              err,
              "We couldn't load this quiz. Please try again.",
            ),
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [quizId, validQuizId]);

  const current = loadState.quizId === quizId ? loadState : null;
  const loading =
    validQuizId && (!current || current.status === 'loading');
  const quiz = current?.status === 'success' ? current.quiz ?? null : null;
  const error = !validQuizId
    ? 'This quiz could not be found.'
    : current?.status === 'error'
    ? current.error ?? 'Could not load this quiz.'
    : null;

  if (loading) {
    return (
      <section className={styles.page}>
        <Skeleton height={280} />
      </section>
    );
  }

  if (error || !quiz || quiz.questions.length === 0) {
    return (
      <section className={styles.page}>
        <BackButton
          label="Personalized quizzes"
          onClick={() => navigate('/quiz/generated')}
        />
        <EmptyState
          title="Quiz unavailable"
          message={error ?? 'This quiz has no questions.'}
        />
      </section>
    );
  }

  if (quiz.completedAt) {
    return <GeneratedQuizReview quiz={quiz} />;
  }

  return (
    <GeneratedQuizPlay
      quiz={quiz}
      onSubmitted={(updated) =>
        setLoadState({ quizId, status: 'success', quiz: updated })
      }
    />
  );
}

function GeneratedQuizPlay({
  quiz,
  onSubmitted,
}: {
  quiz: GeneratedQuiz;
  onSubmitted: (quiz: GeneratedQuiz) => void;
}) {
  const navigate = useNavigate();
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [index, setIndex] = useState(0);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const question = quiz.questions[Math.min(index, quiz.questions.length - 1)];
  const answeredCount = Object.keys(answers).length;
  const isLast = index >= quiz.questions.length - 1;
  const selected = answers[question.id];

  async function submit() {
    setSubmitting(true);
    setSubmitError(null);
    try {
      await generatedQuizService.submit(
        quiz.quizId,
        Object.entries(answers).map(([questionId, value]) => ({
          questionId: Number(questionId),
          selected: value,
        })),
      );
      const updated = await generatedQuizService.getQuiz(quiz.quizId);
      setConfirmOpen(false);
      onSubmitted(updated);
    } catch (err) {
      setSubmitError(
        userFacingErrorMessage(err, "We couldn't submit your quiz."),
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className={styles.page}>
      <div className={styles.topBar}>
        <BackButton
          label="Personalized quizzes"
          onClick={() => navigate('/quiz/generated')}
        />
        <span className={styles.counter}>
          {index + 1} / {quiz.questions.length}
        </span>
      </div>

      <div
        className={styles.progressTrack}
        role="progressbar"
        aria-label="Quiz progress"
        aria-valuemin={0}
        aria-valuemax={quiz.questions.length}
        aria-valuenow={answeredCount}
      >
        <div
          className={styles.progressFill}
          style={{ width: `${(answeredCount / quiz.questions.length) * 100}%` }}
        />
      </div>

      <div className={styles.metaRow}>
        <span className={styles.metaChip}>{quiz.noteTitle}</span>
        <span className={styles.metaChip}>{formatType(quiz.questionType)}</span>
        <span className={styles.metaChip}>{answeredCount} answered</span>
      </div>

      <article className={styles.questionCard}>
        <p className={styles.questionText}>{question.question}</p>
        <div className={styles.options}>
          {question.options.map((option, optionIndex) => {
            const value = optionValue(question, optionIndex);
            const isSelected = selected === value;
            return (
              <button
                key={`${question.id}-${value}`}
                type="button"
                className={`${styles.option} ${
                  isSelected ? styles.optionSelected : ''
                }`}
                onClick={() =>
                  setAnswers((previous) => ({
                    ...previous,
                    [question.id]: value,
                  }))
                }
                aria-pressed={isSelected}
              >
                <span className={styles.optionLetter}>{value}</span>
                <span className={styles.optionText}>
                  {optionLabel(question, option, optionIndex)}
                </span>
              </button>
            );
          })}
        </div>
      </article>

      <div className={styles.navigatorGrid} aria-label="Question navigator">
        {quiz.questions.map((item, itemIndex) => {
          const answered = answers[item.id] !== undefined;
          const current = itemIndex === index;
          return (
            <button
              key={item.id}
              type="button"
              className={`${styles.navCell} ${
                current
                  ? styles.navCellCurrent
                  : answered
                  ? styles.navCellAnswered
                  : ''
              }`}
              onClick={() => setIndex(itemIndex)}
              aria-label={`Question ${itemIndex + 1}${
                answered ? ', answered' : ''
              }`}
              aria-current={current ? 'step' : undefined}
            >
              {itemIndex + 1}
            </button>
          );
        })}
      </div>

      {submitError && (
        <p className={styles.error} role="alert">
          {submitError}
        </p>
      )}

      <div className={styles.submitRow}>
        <Button
          variant="secondary"
          disabled={index === 0 || submitting}
          onClick={() => setIndex((value) => Math.max(0, value - 1))}
        >
          <ArrowLeft size={16} aria-hidden="true" />
          Previous
        </Button>
        {isLast ? (
          <Button
            variant="primary"
            disabled={submitting}
            onClick={() => setConfirmOpen(true)}
          >
            Submit quiz
          </Button>
        ) : (
          <Button
            variant="primary"
            disabled={submitting}
            onClick={() =>
              setIndex((value) => Math.min(quiz.questions.length - 1, value + 1))
            }
          >
            Next
            <ArrowRight size={16} aria-hidden="true" />
          </Button>
        )}
      </div>

      {confirmOpen && (
        <div
          className={styles.confirmOverlay}
          role="dialog"
          aria-modal="true"
          aria-label="Submit quiz"
        >
          <div className={styles.confirmCard}>
            <h2 className={styles.confirmTitle}>Submit this quiz?</h2>
            <p className={styles.confirmText}>
              {answeredCount} of {quiz.questions.length} answered.
              {answeredCount < quiz.questions.length
                ? ' Unanswered questions will be marked as skipped.'
                : ''}
            </p>
            {submitError && (
              <p className={styles.error} role="alert">
                {submitError}
              </p>
            )}
            <div className={styles.confirmActions}>
              <Button
                variant="secondary"
                disabled={submitting}
                onClick={() => setConfirmOpen(false)}
              >
                Keep going
              </Button>
              <Button
                variant="primary"
                loading={submitting}
                onClick={() => void submit()}
              >
                Submit
              </Button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function GeneratedQuizReview({ quiz }: { quiz: GeneratedQuiz }) {
  const navigate = useNavigate();
  const [index, setIndex] = useState(0);
  const question = quiz.questions[Math.min(index, quiz.questions.length - 1)];
  const isLast = index >= quiz.questions.length - 1;
  const score = Math.round(quiz.score ?? 0);
  const verdictClass =
    question.verdict === 'correct'
      ? styles.reviewVerdictCorrect
      : question.verdict === 'wrong'
      ? styles.reviewVerdictWrong
      : styles.reviewVerdictSkipped;

  return (
    <section className={styles.page}>
      <BackButton
        label="Personalized quizzes"
        onClick={() => navigate('/quiz/generated')}
      />

      <header className={styles.reviewHeader}>
        <span className={styles.reviewScore}>{score}%</span>
        <span className={styles.reviewScoreSub}>
          {quiz.correctAnswers} of {quiz.totalQuestions} correct ·{' '}
          {formatDate(quiz.completedAt)}
        </span>
        <h1 className={styles.reviewTitle}>{quiz.noteTitle}</h1>
        <span className={styles.reviewScoreSub}>
          {quiz.courseName} · {quiz.topicName} · {quiz.subtopicName}
        </span>
        <div className={styles.reviewStats}>
          <div className={styles.reviewStat}>
            <span className={styles.reviewStatValue}>
              {quiz.correctAnswers}
            </span>
            <span className={styles.reviewStatLabel}>Correct</span>
          </div>
          <div className={styles.reviewStat}>
            <span className={styles.reviewStatValue}>
              {quiz.questionsAnswered}
            </span>
            <span className={styles.reviewStatLabel}>Answered</span>
          </div>
          <div className={styles.reviewStat}>
            <span className={styles.reviewStatValue}>{quiz.totalQuestions}</span>
            <span className={styles.reviewStatLabel}>Total</span>
          </div>
        </div>
      </header>

      <div className={styles.topBar}>
        <button
          type="button"
          className={styles.secondaryButton}
          onClick={() => setIndex((value) => Math.max(0, value - 1))}
          disabled={index === 0}
        >
          <ArrowLeft size={16} aria-hidden="true" />
          Previous
        </button>
        <span className={styles.counter}>
          Question {index + 1} of {quiz.questions.length}
        </span>
        <button
          type="button"
          className={styles.secondaryButton}
          onClick={() =>
            setIndex((value) => Math.min(quiz.questions.length - 1, value + 1))
          }
          disabled={isLast}
        >
          Next
          <ArrowRight size={16} aria-hidden="true" />
        </button>
      </div>

      <article className={styles.reviewCard}>
        <div className={styles.reviewCardHeader}>
          <span className={styles.qBadge}>Q{index + 1}</span>
          <span className={`${styles.reviewVerdict} ${verdictClass}`}>
            {question.verdict ?? 'skipped'}
          </span>
        </div>

        <p className={styles.reviewQuestion}>{question.question}</p>

        <div className={styles.reviewOptions}>
          {question.options.map((option, optionIndex) => {
            const value = optionValue(question, optionIndex);
            const isSelected = question.selected === value;
            const isCorrect = question.answer === value;
            let className = styles.reviewOption;
            if (isCorrect) {
              className += ` ${styles.reviewOptionCorrect}`;
            } else if (isSelected) {
              className += ` ${styles.reviewOptionWrong}`;
            }
            return (
              <div key={`${question.id}-${value}`} className={className}>
                <span className={styles.reviewOptionLetter}>{value}</span>
                <span className={styles.reviewOptionText}>
                  {optionLabel(question, option, optionIndex)}
                </span>
                {isSelected && (
                  <span className={styles.reviewScoreSub}>Your answer</span>
                )}
              </div>
            );
          })}
        </div>

        <div className={styles.reviewExplanation}>
          {question.explanation?.trim()
            ? question.explanation
            : 'No explanation is available for this question.'}
        </div>

        {question.verdict === 'skipped' && (
          <p className={styles.reviewScoreSub}>
            <X size={14} aria-hidden="true" /> You skipped this question.
          </p>
        )}
        {question.verdict === 'correct' && (
          <p className={styles.reviewScoreSub}>
            <Check size={14} aria-hidden="true" /> Your answer was correct.
          </p>
        )}
      </article>

      <div className={styles.actions}>
        {quiz.noteSlug && (
          <a
            className={styles.secondaryButton}
            href={studyNoteUrl(quiz.noteSlug)}
          >
            Read the study note
          </a>
        )}
        <Button
          variant="primary"
          fullWidth
          onClick={() => navigate('/quiz/generated')}
        >
          Back to my quizzes
        </Button>
      </div>
    </section>
  );
}
