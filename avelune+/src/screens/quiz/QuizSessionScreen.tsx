import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import { useBlocker, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  X,
  LayoutGrid,
  Timer as TimerIcon,
  AlertTriangle,
  RotateCcw,
  Save,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useProfile } from '@/context/ProfileContext';
import { quizService, type QuizQuestion } from '@/services/quiz/quizService';
import { submitService } from '@/services/attempts/submitService';
import { streakService } from '@/services/streaks/streakService';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Markdown } from '@/components/ui/Markdown';
import {
  askAI,
  getAskAIErrorMessage,
  type AskAIMessage,
} from '@/services/ai/askAi';
import { DailyPlanQuotaError } from '@/services/plans/planService';
import { useBeforeUnload } from '@/hooks/useBeforeUnload';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';
import { userFacingErrorMessage } from '@/utils/errors';
import { QUESTION_OPTIONS, QUIZ_TYPES, isQuizType } from './quizConfig';
import {
  readSession,
  writeSession,
  clearSession,
} from '@/utils/sessionStorage';
import styles from './QuizSessionScreen.module.css';
import {
  QUIZ_SESSION_KEY,
  QUIZ_REVIEW_KEY,
  quizConfigMatches,
  quizConfigPath,
  quizSessionMatches,
  type QuizPersistedSession,
  type QuizSessionConfig,
} from './quizSession';

const LETTERS = ['A', 'B', 'C', 'D'] as const;
const TIME_WARN_SECONDS = 120;
const TIME_DANGER_SECONDS = 30;

type QuizConfig = QuizSessionConfig;

function parseConfig(params: URLSearchParams): QuizConfig | null {
  const type = params.get('type');
  const course = params.get('course')?.trim();
  const topic = params.get('topic')?.trim();
  const subtopic = params.get('subtopic')?.trim();
  const moduleIds = params.getAll('module').map(Number);
  const questionCount = Number(params.get('count'));

  if (
    !isQuizType(type) ||
    !course ||
    !topic ||
    !subtopic ||
    moduleIds.length < 1 ||
    moduleIds.some((id) => !Number.isSafeInteger(id) || id <= 0) ||
    new Set(moduleIds).size !== moduleIds.length ||
    !QUESTION_OPTIONS.some((option) => option === questionCount)
  ) {
    return null;
  }

  return { type, course, topic, subtopic, moduleIds, questionCount };
}

type Verdict = 'correct' | 'wrong' | 'skipped';

interface ResultRow {
  question: QuizQuestion;
  userAnswer: string | null;
  verdict: Verdict;
}

interface QuizReviewSession extends QuizPersistedSession {
  results: ResultRow[];
  timedOut?: boolean;
}

function normalizeCorrectAnswer(
  answer: string | null,
  kind: QuizQuestion['kind'],
): string {
  const normalized = (answer ?? '').trim().toUpperCase();
  if (kind === 'tf') {
    if (normalized === 'TRUE' || normalized === 'T') return 'T';
    if (normalized === 'FALSE' || normalized === 'F') return 'F';
  }
  return normalized;
}

function formatTime(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function QuizSessionScreen() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { plan, refreshPlan } = useProfile();
  const [params] = useSearchParams();
  const config = useMemo(() => parseConfig(params), [params]);
  const isPremium = plan?.premiumExplanations === true;

  useEffect(() => {
    if (!config) navigate('/quiz', { replace: true });
  }, [config, navigate]);

  const [questions, setQuestions] = useState<QuizQuestion[] | null>(null);
  const [quizId, setQuizId] = useState<number | null>(null);
  const [loadedRequestKey, setLoadedRequestKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [quizQuotaExceeded, setQuizQuotaExceeded] = useState(false);

  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [currentIndex, setCurrentIndex] = useState(0);

  const [endTime, setEndTime] = useState<number | null>(null);
  const [remainingMs, setRemainingMs] = useState<number>(0);

  const [showNavigator, setShowNavigator] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [results, setResults] = useState<ResultRow[] | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [wasResumed, setWasResumed] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const submittedRef = useRef(false);
  const requestKey = JSON.stringify([config, reloadKey]);
  const loading = !!config && loadedRequestKey !== requestKey;

  useEffect(() => {
    if (!config || !user) return;
    let cancelled = false;

    submittedRef.current = false;

    const review = readSession<QuizReviewSession>(QUIZ_REVIEW_KEY);
    if (
      review &&
      Array.isArray(review.results) &&
      review.results.length > 0 &&
      quizConfigMatches(review, config)
    ) {
      void Promise.resolve().then(() => {
        if (cancelled) return;
        setError(null);
        setQuizQuotaExceeded(false);
        setSubmitError(null);
        setQuestions(review.questions);
        setQuizId(review.quizId);
        setAnswers(review.answers ?? {});
        setCurrentIndex(review.currentIndex);
        setResults(review.results);
        setSubmitted(true);
        submittedRef.current = true;
        setTimedOut(!!review.timedOut);
        setEndTime(review.endTime ?? Date.now());
        setRemainingMs(0);
        setLoadedRequestKey(requestKey);
      });
      return () => {
        cancelled = true;
      };
    }


    const stored = readSession<QuizPersistedSession>(QUIZ_SESSION_KEY);
    if (stored && stored.questions?.length > 0 && quizSessionMatches(stored, config)) {
      void Promise.resolve().then(() => {
        if (cancelled) return;
        setError(null);
        setSubmitError(null);
        setQuestions(stored.questions);
        setQuizId(stored.quizId);
        setAnswers(stored.answers);
        setCurrentIndex(
          Math.min(Math.max(0, stored.currentIndex), stored.questions.length - 1),
        );
        setEndTime(stored.endTime);
        setRemainingMs(Math.max(0, stored.endTime - Date.now()));
        setSubmitted(false);
        setResults(null);
        setTimedOut(false);
        setWasResumed(true);
        setLoadedRequestKey(requestKey);
      });
      return () => {
        cancelled = true;
      };
    }

    clearSession(QUIZ_SESSION_KEY);

    quizService
      .createQuiz({
        moduleIds: config.moduleIds,
        questionCount: config.questionCount,
        type: config.type,
      })
      .then(({ quizId: createdQuizId, questions: qs }) => {
        if (cancelled) return;
        setError(null);
        setSubmitError(null);
        setAnswers({});
        setCurrentIndex(0);
        setSubmitted(false);
        setResults(null);
        setTimedOut(false);
        setWasResumed(false);
        const timeLimitMinutes = qs.length;
        const durationMs = timeLimitMinutes * 60_000;
        const endMs = Date.now() + durationMs;
        setQuizId(createdQuizId);
        setQuestions(qs);
        void refreshPlan();
        setEndTime(endMs);
        setRemainingMs(durationMs);
        writeSession<QuizPersistedSession>(QUIZ_SESSION_KEY, {
          ...config,
          version: 2,
          quizId: createdQuizId,
          timeLimitMinutes,
          endTime: endMs,
          questions: qs,
          answers: {},
          currentIndex: 0,
        });
        setLoadedRequestKey(requestKey);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setQuizQuotaExceeded(err instanceof DailyPlanQuotaError);
        setError(
          userFacingErrorMessage(
            err,
            "We couldn't create this quiz. Try a different selection.",
          ),
        );
        setLoadedRequestKey(requestKey);
      });

    return () => {
      cancelled = true;
    };
  }, [config, user, reloadKey, requestKey, refreshPlan]);

  const doSubmit = useCallback(
    (isTimeout: boolean) => {
      if (
        submittedRef.current ||
        !questions ||
        !user ||
        quizId === null ||
        !config
      ) {
        return;
      }
      submittedRef.current = true;
      setSubmitError(null);

      void submitService
        .submitQuiz(
          quizId,
          questions.map((q) => ({
            question_id: q.id,
            selected: answers[q.id] ?? null,
          })),
        )
        .then((graded) => {
          const gradesById = new Map(
            graded.rows.map((row) => [row.question_id, row]),
          );
          const keyed = questions.map((question) => {
            const grade = gradesById.get(question.id);
            if (!grade) {
              throw new Error(
                `The quiz result is missing question ${question.id}.`,
              );
            }
            return {
              ...question,
              answer: normalizeCorrectAnswer(
                grade.correct_answer,
                question.kind,
              ),
              standardExplanation: grade.standard_explanation,
              premiumExplanation: grade.premium_explanation,
            };
          });

          const rows: ResultRow[] = keyed.map((question) => {
            const userAnswer = answers[question.id] ?? null;
            const verdict: Verdict = !userAnswer
              ? 'skipped'
              : userAnswer === question.answer
                ? 'correct'
                : 'wrong';
            return { question, userAnswer, verdict };
          });

          clearSession(QUIZ_SESSION_KEY);
          setResults(rows);
          writeSession<QuizReviewSession>(QUIZ_REVIEW_KEY, {
            ...config,
            version: 2,
            quizId,
            timeLimitMinutes: questions.length,
            endTime: Date.now(),
            questions: keyed,
            answers,
            currentIndex,
            results: rows,
            timedOut: isTimeout,
          });

          setTimedOut(isTimeout);
          setSubmitted(true);
          setShowNavigator(false);
          setShowConfirm(false);
          window.scrollTo(0, 0);

          void streakService.bumpStreak().catch((err) => {
            console.error('[QUIZ] Failed to bump streak:', err);
          });
        })
        .catch((err) => {
          submittedRef.current = false;
          setSubmitError(
            userFacingErrorMessage(
              err,
              "We couldn't submit this quiz. Please try again.",
            ),
          );
        });
    },
    [answers, questions, user, quizId, config, currentIndex],
  );

  useEffect(() => {
    if (!endTime || submitted) return;
    const tick = () => {
      const ms = endTime - Date.now();
      if (ms <= 0) {
        setRemainingMs(0);
        if (!submitError) doSubmit(true);
        return;
      }
      setRemainingMs(ms);
    };
    tick();
    const id = window.setInterval(tick, 500);
    return () => window.clearInterval(id);
  }, [endTime, submitted, submitError, doSubmit]);

  useEffect(() => {
    if (
      loading ||
      submitted ||
      submittedRef.current ||
      !questions ||
      !config ||
      !endTime ||
      quizId === null
    ) {
      return;
    }
    const id = window.setTimeout(
      () =>
        writeSession<QuizPersistedSession>(QUIZ_SESSION_KEY, {
          ...config,
          version: 2,
          quizId,
          timeLimitMinutes: questions.length,
          endTime,
          questions,
          answers,
          currentIndex,
        }),
      180,
    );
    return () => window.clearTimeout(id);
  }, [
    loading,
    submitted,
    questions,
    answers,
    currentIndex,
    config,
    endTime,
    quizId,
  ]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [currentIndex]);

  const shouldBlock =
    !submitted && questions !== null && questions.length > 0;

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      shouldBlock && currentLocation.pathname !== nextLocation.pathname,
  );

  useBeforeUnload(shouldBlock);
  useBodyScrollLock(showConfirm || showNavigator || blocker.state === 'blocked');

  function backToSetup() {
    if (!config) {
      navigate('/quiz');
      return;
    }
    navigate(quizConfigPath(config, '/quiz/setup'));
  }

  function restart() {
    submittedRef.current = false;
    clearSession(QUIZ_SESSION_KEY);
    clearSession(QUIZ_REVIEW_KEY);
    setWasResumed(false);
    setReloadKey((k) => k + 1);
  }

  if (!config) return null;

  if (loading) {
    return (
      <section className={styles.page}>
        <Skeleton height={300} />
      </section>
    );
  }

  if (error || !questions || questions.length === 0) {
    return (
      <section className={styles.page}>
        <EmptyState
          icon={<AlertTriangle size={24} aria-hidden="true" />}
          title="Quiz unavailable"
          message={error ?? 'No questions are available in the selected modules.'}
        />
        <button
          type="button"
          className={styles.primaryButton}
          onClick={() => navigate('/quiz')}
        >
          Back to Quiz
        </button>
        {quizQuotaExceeded && (
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={() => navigate('/plans')}
          >
            View plans
          </button>
        )}
      </section>
    );
  }

  if (submitted && results) {
    return (
      <QuizReview
        results={results}
        quizId={quizId}
        timedOut={timedOut}
        isPremium={isPremium}
        onRetake={restart}
        onBack={backToSetup}
      />
    );
  }

  const current = questions[currentIndex];
  const isFirst = currentIndex === 0;
  const isLast = currentIndex >= questions.length - 1;
  const answeredCount = Object.keys(answers).length;
  const selectedAnswer = answers[current.id] ?? null;
  const displayPct = Math.round((answeredCount / questions.length) * 100);
  const quizTypeLabel =
    QUIZ_TYPES.find((quizType) => quizType.key === config.type)?.label ??
    config.type;

  const remainingSec = remainingMs / 1000;
  const timerClass =
    remainingSec <= TIME_DANGER_SECONDS
      ? styles.timerValueDanger
      : remainingSec <= TIME_WARN_SECONDS
        ? styles.timerValueWarn
        : '';

  return (
    <section className={styles.page}>
      <div className={styles.timerBar}>
        <div className={styles.timerLeft}>
          <TimerIcon size={18} className={styles.timerIcon} aria-hidden="true" />
          <span className={`${styles.timerValue} ${timerClass}`}>
            {formatTime(remainingMs)}
          </span>
          <span className={styles.timerProgress}>
            {answeredCount}/{questions.length}
          </span>
          {wasResumed && (
            <span className={styles.resumedChip}>
              <Save size={11} aria-hidden="true" />
              Resumed
            </span>
          )}
        </div>
        <button
          type="button"
          className={styles.navTrigger}
          onClick={() => setShowNavigator(true)}
        >
          <LayoutGrid size={14} aria-hidden="true" />
          Questions
        </button>
      </div>

      <div className={styles.progressTrack} aria-hidden="true">
        <div
          className={styles.progressFill}
          style={{ width: `${displayPct}%` }}
        />
      </div>

      <div className={styles.metaRow}>
        <span className={styles.metaChip}>{config.course}</span>
        <span className={styles.metaChip}>{config.topic}</span>
        <span className={styles.metaChip}>{quizTypeLabel}</span>
        <span className={styles.metaChip}>
          {currentIndex + 1} / {questions.length}
        </span>
      </div>

      <article className={styles.questionCard}>
        <Markdown variant="question" className={styles.questionText}>{current.question}</Markdown>
        <div className={styles.options}>
          {current.options.map((opt, i) => {
            const answerValue = current.kind === 'tf' ? opt : LETTERS[i];
            const isSelected = selectedAnswer === answerValue;
            return (
              <button
                key={answerValue}
                type="button"
                className={`${styles.option} ${isSelected ? styles.optionSelected : ''}`}
                onClick={() =>
                  setAnswers((prev) => ({
                    ...prev,
                    [current.id]: answerValue,
                  }))
                }
              >
                <span className={styles.optionLetter}>{answerValue}</span>
                <Markdown variant="option" className={styles.optionText}>{opt}</Markdown>
              </button>
            );
          })}
        </div>
      </article>

      {submitError && (
        <p className={styles.submitError} role="alert">
          {submitError}
        </p>
      )}

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.prevButton}
          onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
          disabled={isFirst}
        >
          <ArrowLeft size={16} aria-hidden="true" />
          Previous
        </button>
        {isLast ? (
          <button
            type="button"
            className={styles.nextButton}
            onClick={() => setShowConfirm(true)}
          >
            Submit
            <Check size={16} aria-hidden="true" />
          </button>
        ) : (
          <button
            type="button"
            className={styles.nextButton}
            onClick={() =>
              setCurrentIndex((i) => Math.min(questions.length - 1, i + 1))
            }
          >
            Next
            <ArrowRight size={16} aria-hidden="true" />
          </button>
        )}
      </div>

      {showNavigator && (
        <>
          <div
            className={styles.sheetOverlay}
            onClick={() => setShowNavigator(false)}
            aria-hidden="true"
          />
          <div className={styles.sheet} role="dialog" aria-label="Question navigator">
            <div className={styles.sheetHeader}>
              <span className={styles.sheetTitle}>Jump to question</span>
              <button
                type="button"
                className={styles.sheetClose}
                onClick={() => setShowNavigator(false)}
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            <div className={styles.sheetLegend}>
              <span className={styles.legendItem}>
                <span className={`${styles.legendDot} ${styles.legendDotCurrent}`} />
                Current
              </span>
              <span className={styles.legendItem}>
                <span className={`${styles.legendDot} ${styles.legendDotAnswered}`} />
                Answered
              </span>
              <span className={styles.legendItem}>
                <span className={`${styles.legendDot} ${styles.legendDotEmpty}`} />
                Unanswered
              </span>
            </div>

            <div className={styles.navigatorGrid}>
              {questions.map((q, i) => {
                const answered = answers[q.id] != null;
                const isCurrent = i === currentIndex;
                const cls = [
                  styles.navCell,
                  isCurrent
                    ? styles.navCellCurrent
                    : answered
                      ? styles.navCellAnswered
                      : '',
                ]
                  .filter(Boolean)
                  .join(' ');
                return (
                  <button
                    key={q.id}
                    type="button"
                    className={cls}
                    onClick={() => {
                      setCurrentIndex(i);
                      setShowNavigator(false);
                    }}
                  >
                    {i + 1}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              className={`${styles.primaryButton} ${styles.sheetSubmit}`}
              onClick={() => {
                setShowNavigator(false);
                setShowConfirm(true);
              }}
            >
              Submit quiz
            </button>
          </div>
        </>
      )}

      {showConfirm && (
        <div className={styles.confirmOverlay}>
          <div className={styles.confirmCard} role="dialog" aria-modal="true">
            <span className={styles.confirmTitle}>Submit quiz?</span>
            {answeredCount < questions.length ? (
              <p className={styles.confirmText}>
                You have{' '}
                <span className={styles.confirmStrong}>
                  {questions.length - answeredCount} unanswered{' '}
                  {questions.length - answeredCount === 1
                    ? 'question'
                    : 'questions'}
                </span>
                . Unanswered questions will be marked as wrong.
              </p>
            ) : (
              <p className={styles.confirmText}>
                All {questions.length} questions answered. Ready to submit?
              </p>
            )}
            <div className={styles.confirmActions}>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => setShowConfirm(false)}
              >
                Keep working
              </button>
              <button
                type="button"
                className={styles.primaryButton}
                onClick={() => doSubmit(false)}
              >
                Submit
              </button>
            </div>
          </div>
        </div>
      )}

      {blocker.state === 'blocked' && (
        <div className={styles.confirmOverlay}>
          <div className={styles.confirmCard} role="dialog" aria-modal="true">
            <span className={styles.confirmTitle}>Leave quiz?</span>
            <p className={styles.confirmText}>
              You&apos;re in the middle of a timed quiz. If you leave now,
              your answers won&apos;t be saved.
            </p>
            <div className={styles.confirmActions}>
              <button
                type="button"
                className={styles.primaryButton}
                onClick={() => blocker.reset?.()}
              >
                Stay
              </button>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => blocker.proceed?.()}
              >
                Leave anyway
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

/* ============================================================
   Review
   ============================================================ */

interface QuizReviewProps {
  results: ResultRow[];
  quizId: number | null;
  timedOut: boolean;
  isPremium: boolean;
  onRetake: () => void;
  onBack: () => void;
}

function QuizReview({
  results,
  quizId,
  timedOut,
  isPremium,
  onRetake,
  onBack,
}: QuizReviewProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [conversations, setConversations] = useState<
    Record<number, AskAIMessage[]>
  >({});
  const total = results.length;
  const correct = results.filter((r) => r.verdict === 'correct').length;
  const wrong = results.filter((r) => r.verdict === 'wrong').length;
  const skipped = results.filter((r) => r.verdict === 'skipped').length;
  const pct = total > 0 ? Math.round((correct / total) * 100) : 0;
  const current = results[currentIndex];

  const scoreClass =
    pct >= 70
      ? styles.reviewIconGood
      : pct >= 40
        ? styles.reviewIconWarn
        : styles.reviewIconBad;

  return (
    <section className={styles.page}>
      <div className={styles.reviewHeader}>
        <div className={`${styles.reviewIcon} ${scoreClass}`}>
          {pct >= 70 ? (
            <Check size={28} strokeWidth={3} />
          ) : (
            <AlertTriangle size={26} />
          )}
        </div>
        <div className={styles.reviewScore}>
          {correct} / {total}
        </div>
        <span className={styles.reviewScoreSub}>{pct}% correct</span>
        <h2 className={styles.reviewTitle}>
          {timedOut ? 'Time up' : 'Quiz complete'}
        </h2>

        <div className={styles.reviewStats}>
          <div className={styles.reviewStat}>
            <span className={styles.reviewStatValue}>{correct}</span>
            <span className={styles.reviewStatLabel}>Correct</span>
          </div>
          <div className={styles.reviewStat}>
            <span className={styles.reviewStatValue}>{wrong}</span>
            <span className={styles.reviewStatLabel}>Wrong</span>
          </div>
          <div className={styles.reviewStat}>
            <span className={styles.reviewStatValue}>{skipped}</span>
            <span className={styles.reviewStatLabel}>Skipped</span>
          </div>
        </div>

        <div className={styles.reviewActions}>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={onRetake}
          >
            <RotateCcw size={14} aria-hidden="true" />
            Retake
          </button>
          <button
            type="button"
            className={styles.primaryButton}
            onClick={onBack}
          >
            Back to setup
          </button>
        </div>
      </div>

      <div className={styles.reviewPager}>
        <button
          type="button"
          className={styles.reviewPagerButton}
          onClick={() => setCurrentIndex((index) => Math.max(0, index - 1))}
          disabled={currentIndex === 0}
        >
          <ArrowLeft size={16} aria-hidden="true" />
          Previous
        </button>
        <span className={styles.reviewPagerCount}>
          Question {currentIndex + 1} of {total}
        </span>
        <button
          type="button"
          className={styles.reviewPagerButton}
          onClick={() =>
            setCurrentIndex((index) => Math.min(total - 1, index + 1))
          }
          disabled={currentIndex === total - 1}
        >
          Next
          <ArrowRight size={16} aria-hidden="true" />
        </button>
      </div>

      <QuizReviewQuestion
        key={current.question.id}
        row={current}
        index={currentIndex}
        quizId={quizId}
        isPremium={isPremium}
        messages={conversations[current.question.id] ?? []}
        onMessagesChange={(messages) =>
          setConversations((previous) => ({
            ...previous,
            [current.question.id]: messages,
          }))
        }
      />
    </section>
  );
}

function QuizReviewQuestion({
  row,
  index,
  quizId,
  isPremium,
  messages,
  onMessagesChange,
}: {
  row: ResultRow;
  index: number;
  quizId: number | null;
  isPremium: boolean;
  messages: AskAIMessage[];
  onMessagesChange: (messages: AskAIMessage[]) => void;
}) {
  const navigate = useNavigate();
  const { refreshPlan } = useProfile();
  const [showDiscussion, setShowDiscussion] = useState(false);
  const [draft, setDraft] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiQuotaExceeded, setAiQuotaExceeded] = useState(false);
  const verdictClass =
    row.verdict === 'correct'
      ? styles.reviewVerdictCorrect
      : row.verdict === 'wrong'
        ? styles.reviewVerdictWrong
        : styles.reviewVerdictSkipped;
  const explanation = isPremium
    ? row.question.premiumExplanation
    : row.question.standardExplanation;

  async function handleAsk(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = draft.trim();
    if (!message || aiLoading) return;
    if (quizId === null) {
      setAiError('This quiz review is not available for AI discussion.');
      return;
    }

    setAiLoading(true);
    setAiError(null);
    setAiQuotaExceeded(false);
    try {
      const response = await askAI({
        question_id: row.question.id,
        context: 'quiz_review',
        quiz_id: quizId,
        message,
        history: messages.slice(-8),
      });
      if (!response.ok) {
        const quotaExceeded = response.reason === 'daily_limit';
        setAiQuotaExceeded(quotaExceeded);
        setAiError(getAskAIErrorMessage(response));
        if (quotaExceeded) void refreshPlan();
        return;
      }
      onMessagesChange([
        ...messages,
        { role: 'user', content: message },
        {
          role: 'assistant',
          content: response.answer_markdown || 'Empty answer',
        },
      ]);
      setDraft('');
      void refreshPlan();
    } catch (error) {
      setAiError(
        userFacingErrorMessage(
          error,
          "The AI service couldn't respond. Please try again.",
        ),
      );
    } finally {
      setAiLoading(false);
    }
  }

  return (
    <article className={styles.reviewCard}>
      <div className={styles.reviewCardHeader}>
        <span className={styles.qBadge}>Q{index + 1}</span>
        <span className={`${styles.reviewVerdict} ${verdictClass}`}>
          {row.verdict === 'correct'
            ? 'Correct'
            : row.verdict === 'wrong'
              ? 'Wrong'
              : 'Skipped'}
        </span>
      </div>

      <Markdown variant="review-question" className={styles.reviewQuestion}>
        {row.question.question}
      </Markdown>

      <div className={styles.reviewOptions}>
        {row.question.options.map((option, optionIndex) => {
          const answerValue =
            row.question.kind === 'tf' ? option : LETTERS[optionIndex];
          const isUser = row.userAnswer === answerValue;
          const isCorrect = row.question.answer === answerValue;

          let className = styles.reviewOption;
          if (isUser && isCorrect) {
            className += ` ${styles.reviewOptionUserCorrect}`;
          } else if (isUser && !isCorrect) {
            className += ` ${styles.reviewOptionUserWrong}`;
          } else if (!isUser && isCorrect) {
            className += ` ${styles.reviewOptionShowCorrect}`;
          }

          return (
            <div key={answerValue} className={className}>
              <span className={styles.reviewOptionLetter}>{answerValue}</span>
              <Markdown variant="review-option" className={styles.reviewOptionText}>
                {option}
              </Markdown>
            </div>
          );
        })}
      </div>

      <div className={styles.reviewExplanation}>
        {explanation ? (
          <Markdown variant="explanation">{explanation}</Markdown>
        ) : (
          <span className={styles.reviewExplanationEmpty}>
            No explanation is available for this question yet.
          </span>
        )}
      </div>

      <div className={styles.reviewDiscussion}>
        <button
          type="button"
          className={styles.reviewDiscussionToggle}
          onClick={() => setShowDiscussion((visible) => !visible)}
          aria-expanded={showDiscussion}
        >
          <Sparkles size={16} aria-hidden="true" />
          {showDiscussion ? 'Close discussion' : 'Discuss this question with AI'}
        </button>

        {showDiscussion && (
          <div className={styles.reviewDiscussionPanel}>
            <p className={styles.reviewDiscussionHint}>
              Ask a question or request a deeper explanation. You can follow up
              in this discussion.
            </p>
            {messages.length > 0 && (
              <div className={styles.reviewChat}>
                {messages.map((message, messageIndex) => (
                  <div
                    key={`${message.role}-${messageIndex}`}
                    className={
                      message.role === 'user'
                        ? styles.reviewChatUser
                        : styles.reviewChatAssistant
                    }
                  >
                    {message.role === 'assistant' ? (
                      <Markdown variant="explanation">
                        {message.content}
                      </Markdown>
                    ) : (
                      message.content
                    )}
                  </div>
                ))}
              </div>
            )}
            {aiError && (
              <p className={styles.reviewDiscussionError} role="alert">
                {aiError}
              </p>
            )}
            {aiQuotaExceeded && (
              <button
                type="button"
                className={styles.reviewDiscussionToggle}
                onClick={() => navigate('/plans')}
              >
                View plans
              </button>
            )}
            <form className={styles.reviewAskForm} onSubmit={handleAsk}>
              <textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="Ask a follow-up about this question..."
                maxLength={500}
                rows={3}
                disabled={aiLoading || aiQuotaExceeded}
              />
              <button
                type="submit"
                className={styles.reviewDiscussionToggle}
                disabled={!draft.trim() || aiLoading || aiQuotaExceeded}
              >
                <Sparkles size={15} aria-hidden="true" />
                {aiLoading ? 'Thinking…' : 'Send to AI'}
              </button>
            </form>
          </div>
        )}
      </div>
    </article>
  );
}
