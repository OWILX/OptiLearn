import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useProfile } from '@/context/ProfileContext';
import { quizService, type QuizQuestion } from '@/services/quiz/quizService';
import { submitService } from '@/services/attempts/submitService';
import { attemptService } from '@/services/attempts/attemptService';
import { streakService } from '@/services/streaks/streakService';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Markdown } from '@/components/ui/Markdown';
import { useBeforeUnload } from '@/hooks/useBeforeUnload';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';
import {
  readSession,
  writeSession,
  clearSession,
} from '@/utils/sessionStorage';
import styles from './QuizSessionScreen.module.css';
import { DEFAULT_TIME_MINUTES, DEFAULT_QUESTION_COUNT, DEFAULT_DIFFICULTY, type Difficulty } from './quizConfig';
import {
  QUIZ_SESSION_KEY,
  QUIZ_REVIEW_KEY,
  quizSessionMatches,
  type QuizPersistedSession,
} from './quizSession';

const LETTERS = ['A', 'B', 'C', 'D'] as const;
const TIME_WARN_SECONDS = 120;
const TIME_DANGER_SECONDS = 30;

interface QuizConfig {
  subject: string;
  difficulty: Difficulty;
  timeLimitMinutes: number;
  questionCount: number;
}

function parseConfig(params: URLSearchParams): QuizConfig | null {
  const subject = params.get('subject')?.trim();
  const difficultyRaw = params.get('difficulty');
  const timeRaw = params.get('time');
  const countRaw = params.get('count');

  if (!subject) return null;

  const difficulty: Difficulty =
    difficultyRaw === 'easy' ||
    difficultyRaw === 'medium' ||
    difficultyRaw === 'hard'
      ? difficultyRaw
      : DEFAULT_DIFFICULTY;

  const time = Number(timeRaw);
  const count = Number(countRaw);

  return {
    subject,
    difficulty,
    timeLimitMinutes:
      Number.isFinite(time) && time > 0 ? time : DEFAULT_TIME_MINUTES,
    questionCount:
      Number.isFinite(count) && count > 0 ? count : DEFAULT_QUESTION_COUNT,
  };
}

type Verdict = 'correct' | 'wrong' | 'skipped';

interface ResultRow {
  question: QuizQuestion;
  userAnswer: string | null;
  verdict: Verdict;
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
  const { profile } = useProfile();
  const [params] = useSearchParams();
  const config = useMemo(() => parseConfig(params), [params]);
  const isPremium = profile?.premium === true;

  useEffect(() => {
    if (!config) navigate('/quiz', { replace: true });
  }, [config, navigate]);

  const [questions, setQuestions] = useState<QuizQuestion[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  const submittedRef = useRef(false);

  useEffect(() => {
    if (!config || !user) return;
    let cancelled = false;

    setLoading(true);
    setError(null);
    setAnswers({});
    setCurrentIndex(0);
    setSubmitted(false);
    setResults(null);
    setTimedOut(false);
    setWasResumed(false);
    submittedRef.current = false;

    const review = readSession<{
      subject: string;
      questions: typeof questions;
      answers: Record<number, string>;
      results: ResultRow[];
      timedOut?: boolean;
      endTime: number;
    }>(QUIZ_REVIEW_KEY);
    if (
      review &&
      Array.isArray(review.results) &&
      review.results.length > 0 &&
      review.subject === config.subject
    ) {
      setQuestions(review.questions);
      setAnswers(review.answers ?? {});
      setResults(review.results);
      setSubmitted(true);
      submittedRef.current = true;
      setTimedOut(!!review.timedOut);
      setEndTime(review.endTime ?? Date.now());
      setRemainingMs(0);
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }


    const stored = readSession<QuizPersistedSession>(QUIZ_SESSION_KEY);
    if (stored && quizSessionMatches(stored, config)) {
      setQuestions(stored.questions);
      setAnswers(stored.answers);
      setCurrentIndex(
        Math.min(Math.max(0, stored.currentIndex), stored.questions.length - 1),
      );
      setEndTime(stored.endTime);
      setRemainingMs(Math.max(0, stored.endTime - Date.now()));
      setWasResumed(true);
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }

    clearSession(QUIZ_SESSION_KEY);

    quizService
      .getQuizQuestions(user.id, {
        subject: config.subject,
        difficulty: config.difficulty,
        count: config.questionCount,
      })
      .then((qs) => {
        if (cancelled) return;
        setQuestions(qs);
        if (qs.length > 0) {
          const endMs = Date.now() + config.timeLimitMinutes * 60_000;
          setEndTime(endMs);
          setRemainingMs(config.timeLimitMinutes * 60_000);
          writeSession<QuizPersistedSession>(QUIZ_SESSION_KEY, {
            version: 1,
            subject: config.subject,
            difficulty: config.difficulty,
            timeLimitMinutes: config.timeLimitMinutes,
            questionCount: config.questionCount,
            endTime: endMs,
            questions: qs,
            answers: {},
            currentIndex: 0,
          });
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (import.meta.env.DEV) {
          console.warn('[QUIZ] Load failed:', err);
        }
        setError(
          "We couldn't load questions for this quiz. Try a different subject or difficulty.",
        );
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [config, user, reloadKey]);

  const doSubmit = useCallback(
    (isTimeout: boolean) => {
      if (submittedRef.current || !questions || !user) return;
      submittedRef.current = true;
      clearSession(QUIZ_SESSION_KEY);

      void submitService
        .submitQuiz(
          questions.map((q) => ({
            question_id: q.id,
            selected: answers[q.id] ?? null,
          })),
        )
        .then((graded) => {
      const keyed = questions.map((q) => {
        const g = graded.rows.find((r) => r.question_id === q.id);
        if (!g) return q;
        const raw = (g.correct_answer ?? 'A').toUpperCase();
        const letter = (raw === 'B' || raw === 'C' || raw === 'D' ? raw : 'A') as typeof q.answer;
        return {
          ...q,
          answer: letter,
          standardExplanation: g.standard_explanation,
          premiumExplanation: g.premium_explanation,
        };
      });

      const rows: ResultRow[] = keyed.map((q) => {
        const userAnswer = answers[q.id] ?? null;
        let verdict: Verdict;
        if (!userAnswer) verdict = 'skipped';
        else if (userAnswer === q.answer) verdict = 'correct';
        else verdict = 'wrong';
        return { question: q, userAnswer, verdict };
      });

      setResults(rows);
      writeSession(QUIZ_REVIEW_KEY, {
        subject: config.subject,
        questions: keyed,
        answers,
        results: rows,
        timedOut: isTimeout,
        endTime: Date.now(),
      });

      setTimedOut(isTimeout);
      setSubmitted(true);
      setShowNavigator(false);
      setShowConfirm(false);
      window.scrollTo(0, 0);

      void streakService.bumpStreak().catch((err) => {
        if (import.meta.env.DEV) console.warn('[QUIZ] Failed to bump streak:', err);
      });
        })
        .catch((err) => {
          submittedRef.current = false;
          if (import.meta.env.DEV) console.warn('[QUIZ] Submit failed:', err);
        });
    },
    [answers, questions, user, config],
  );

  useEffect(() => {
    if (!endTime || submitted) return;
    const tick = () => {
      const ms = endTime - Date.now();
      if (ms <= 0) {
        setRemainingMs(0);
        doSubmit(true);
        return;
      }
      setRemainingMs(ms);
    };
    tick();
    const id = window.setInterval(tick, 500);
    return () => window.clearInterval(id);
  }, [endTime, submitted, doSubmit]);

  useEffect(() => {
    if (loading || submitted || submittedRef.current || !questions || !config || !endTime) return;
    const id = window.setTimeout(() => writeSession<QuizPersistedSession>(QUIZ_SESSION_KEY, {
      version: 1,
      subject: config.subject,
      difficulty: config.difficulty,
      timeLimitMinutes: config.timeLimitMinutes,
      questionCount: config.questionCount,
      endTime,
      questions: questions.map((q) => ({
        ...q,
        answer: 'A',
        standardExplanation: '',
        premiumExplanation: '',
      })),
      answers,
      currentIndex,
    }), 180);
    return () => window.clearTimeout(id);
  }, [loading, submitted, questions, answers, currentIndex, config, endTime]);

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
    const p = new URLSearchParams();
    p.set('subject', config.subject);
    p.set('difficulty', config.difficulty);
    navigate(`/quiz/setup?${p.toString()}`);
  }

  function restart() {
    submittedRef.current = false;
    clearSession(QUIZ_SESSION_KEY);
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
          message={error ?? 'No questions match that subject and difficulty yet.'}
        />
        <button
          type="button"
          className={styles.primaryButton}
          onClick={() => navigate('/quiz')}
        >
          Back to Quiz
        </button>
      </section>
    );
  }

  if (submitted && results) {
    return (
      <QuizReview
        results={results}
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
        <span className={styles.metaChip}>{config.subject}</span>
        <span className={styles.metaChip}>{config.difficulty}</span>
        <span className={styles.metaChip}>
          {currentIndex + 1} / {questions.length}
        </span>
      </div>

      <article className={styles.questionCard}>
        <Markdown variant="question" className={styles.questionText}>{current.question}</Markdown>
        <div className={styles.options}>
          {current.options.map((opt, i) => {
            const letter = LETTERS[i];
            const isSelected = selectedAnswer === letter;
            return (
              <button
                key={letter}
                type="button"
                className={`${styles.option} ${isSelected ? styles.optionSelected : ''}`}
                onClick={() =>
                  setAnswers((prev) => ({ ...prev, [current.id]: letter }))
                }
              >
                <span className={styles.optionLetter}>{letter}</span>
                <Markdown variant="option" className={styles.optionText}>{opt}</Markdown>
              </button>
            );
          })}
        </div>
      </article>

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
  timedOut: boolean;
  isPremium: boolean;
  onRetake: () => void;
  onBack: () => void;
}

function QuizReview({
  results,
  timedOut,
  isPremium,
  onRetake,
  onBack,
}: QuizReviewProps) {
  const total = results.length;
  const correct = results.filter((r) => r.verdict === 'correct').length;
  const wrong = results.filter((r) => r.verdict === 'wrong').length;
  const skipped = results.filter((r) => r.verdict === 'skipped').length;
  const pct = total > 0 ? Math.round((correct / total) * 100) : 0;

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

      <div className={styles.reviewList}>
        {results.map((row, i) => {
          const verdictClass =
            row.verdict === 'correct'
              ? styles.reviewVerdictCorrect
              : row.verdict === 'wrong'
                ? styles.reviewVerdictWrong
                : styles.reviewVerdictSkipped;

          const explanation = isPremium
            ? row.question.premiumExplanation
            : row.question.standardExplanation;

          return (
            <article key={row.question.id} className={styles.reviewCard}>
              <div className={styles.reviewCardHeader}>
                <span className={styles.qBadge}>Q{i + 1}</span>
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
                {row.question.options.map((opt, j) => {
                  const letter = LETTERS[j];
                  const isUser = row.userAnswer === letter;
                  const isCorrect = row.question.answer === letter;

                  let cls = styles.reviewOption;
                  if (isUser && isCorrect) {
                    cls += ` ${styles.reviewOptionUserCorrect}`;
                  } else if (isUser && !isCorrect) {
                    cls += ` ${styles.reviewOptionUserWrong}`;
                  } else if (!isUser && isCorrect) {
                    cls += ` ${styles.reviewOptionShowCorrect}`;
                  }

                  return (
                    <div key={letter} className={cls}>
                      <span className={styles.reviewOptionLetter}>
                        {letter}
                      </span>
                      <Markdown variant="review-option" className={styles.reviewOptionText}>
                        {opt}
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
            </article>
          );
        })}
      </div>
    </section>
  );
}
