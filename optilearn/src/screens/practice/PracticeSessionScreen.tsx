import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useBlocker, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { attemptService } from '@/services/attempts/attemptService';
import { streakService } from '@/services/streaks/streakService';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';
import { useBeforeUnload } from '@/hooks/useBeforeUnload';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  X,
  LayoutGrid,
  Timer as TimerIcon,
  AlertTriangle,
  RotateCcw,
} from 'lucide-react';
import {
  pastQuestionsService,
  type PracticeFilters,
  type SessionQuestion,
} from '@/services/pastQuestions/pastQuestionsService';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import styles from './PracticeSessionScreen.module.css';

type Mode = 'untimed' | 'timed';

const DEFAULT_TIME_LIMIT_MINUTES = 20;

function parseMode(raw: string | null): Mode | null {
  if (raw === 'untimed' || raw === 'timed') return raw;
  return null;
}

export function PracticeSessionScreen() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { user } = useAuth();
  const mode = parseMode(params.get('mode'));

  useEffect(() => {
    if (!mode) navigate('/practice', { replace: true });
  }, [mode, navigate]);

  const filters: PracticeFilters = useMemo(() => {
    const yearRaw = params.get('year');
    return {
      subject: params.get('subject'),
      year: yearRaw ? Number(yearRaw) : null,
      section: params.get('section'),
      topic: params.get('topic'),
    };
  }, [params]);

  const timeLimitMinutes = useMemo(() => {
    const raw = params.get('time');
    const n = raw ? Number(raw) : NaN;
    return Number.isFinite(n) && n > 0 ? n : DEFAULT_TIME_LIMIT_MINUTES;
  }, [params]);

  if (!mode || !user) return null;

  if (mode === 'untimed') {
    return <UntimedSession filters={filters} userId={user.id} />;
  }

  return (
    <TimedSession
      filters={filters}
      timeLimitMinutes={timeLimitMinutes}
      userId={user.id}
    />
  );
}

/* ============================================================
   Untimed session — per-question immediate feedback
   ============================================================ */

interface UntimedSessionProps {
  filters: PracticeFilters;
  userId: string;
}

function UntimedSession({ filters, userId }: UntimedSessionProps) {
  const navigate = useNavigate();

  const [questions, setQuestions] = useState<SessionQuestion[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [correctCount, setCorrectCount] = useState(0);
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    pastQuestionsService
      .getSessionQuestions(filters)
      .then((qs) => {
        if (cancelled) return;
        setQuestions(qs);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Could not load questions.');
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [filters]);

  useEffect(() => {
    setSelected(null);
    window.scrollTo(0, 0);
  }, [currentIndex]);

  function handleSelect(letter: string) {
    if (selected !== null || !questions) return;
    const current = questions[currentIndex];
    const isCorrect = letter === current.correctAnswer;
    setSelected(letter);
    if (isCorrect) {
      setCorrectCount((c) => c + 1);
    }
    // Persist — fire and forget.
    attemptService
      .logAttempt(userId, {
        questionId: current.id,
        selectedAnswer: letter,
        isCorrect,
        attemptType: 'practice',
      })
      .catch((err) => {
        if (import.meta.env.DEV) {
          console.warn('[PRACTICE] Failed to log attempt:', err);
        }
      });
    // Streak — fire and forget. Same-day calls are no-ops server-side.
    streakService.bumpStreak().catch((err) => {
      if (import.meta.env.DEV) {
        console.warn('[PRACTICE] Failed to bump streak:', err);
      }
    });
  }

  function handleNext() {
    if (!questions) return;
    if (currentIndex >= questions.length - 1) {
      setFinished(true);
      return;
    }
    setCurrentIndex((i) => i + 1);
  }

  function backToFilter() {
    const p = new URLSearchParams({ mode: 'untimed' });
    if (filters.subject) p.set('subject', filters.subject);
    if (filters.year) p.set('year', String(filters.year));
    if (filters.section) p.set('section', filters.section);
    if (filters.topic) p.set('topic', filters.topic);
    navigate(`/practice/filter?${p.toString()}`);
  }

  function restart() {
    setCurrentIndex(0);
    setSelected(null);
    setCorrectCount(0);
    setFinished(false);
  }

  if (loading) {
    return (
      <section className={styles.page}>
        <Skeleton height={300} />
      </section>
    );
  }

  if (error) {
    return (
      <section className={styles.page}>
        <div className={styles.error}>{error}</div>
        <button
          type="button"
          className={styles.secondaryButton}
          onClick={backToFilter}
        >
          Back to filters
        </button>
      </section>
    );
  }

  if (!questions || questions.length === 0) {
    return (
      <section className={styles.page}>
        <EmptyState
          title="No questions match"
          message="The current filters didn't return any questions. Adjust and try again."
        />
        <button
          type="button"
          className={styles.primaryButton}
          onClick={backToFilter}
        >
          Back to filters
        </button>
      </section>
    );
  }

  if (finished) {
    const total = questions.length;
    const pct = total > 0 ? Math.round((correctCount / total) * 100) : 0;
    const perfect = correctCount === total;

    return (
      <section className={styles.page}>
        <div className={styles.endCard}>
          <div className={styles.endIcon}>
            <Check size={28} strokeWidth={3} />
          </div>
          <div
            className={`${styles.endScore} ${perfect ? '' : styles.endScoreMuted}`}
          >
            {correctCount} / {total}
          </div>
          <span className={styles.endScoreSub}>{pct}% correct</span>
          <h2 className={styles.endTitle}>
            {perfect ? 'Perfect session' : 'Session complete'}
          </h2>
          <p className={styles.endText}>
            {perfect
              ? 'Every question answered correctly. Nice work.'
              : 'Review the topics you missed and try again.'}
          </p>
          <div className={styles.endActions}>
            <button
              type="button"
              className={styles.secondaryButton}
              onClick={restart}
            >
              Try again
            </button>
            <button
              type="button"
              className={styles.primaryButton}
              onClick={backToFilter}
            >
              Back to filters
            </button>
          </div>
        </div>
      </section>
    );
  }

  const current = questions[currentIndex];
  const isLast = currentIndex >= questions.length - 1;
  const revealed = selected !== null;
  const wasCorrect = revealed && selected === current.correctAnswer;

  // Progress = questions completed (answered), not raw position.
  // Because you can only advance after answering, currentIndex equals the
  // count of already-answered questions.
  const completedCount = currentIndex + (revealed ? 1 : 0);
  const displayPct = Math.round((completedCount / questions.length) * 100);

  return (
    <section className={styles.page}>
      <div className={styles.topBar}>
        <button
          type="button"
          className={styles.backButton}
          onClick={backToFilter}
        >
          <ArrowLeft size={16} aria-hidden="true" />
          Filters
        </button>
        <span className={styles.counter}>
          {currentIndex + 1} / {questions.length}
        </span>
      </div>

      <div className={styles.progressTrack} aria-hidden="true">
        <div
          className={styles.progressFill}
          style={{ width: `${displayPct}%` }}
        />
      </div>

      <div className={styles.metaRow}>
        <span className={styles.metaChip}>
          {current.subject} · {current.year}
        </span>
        <span className={styles.metaChip}>Q{current.questionNumber}</span>
      </div>

      <article className={styles.questionCard}>
        <div className={styles.questionHeader}>
          <span className={styles.qBadge}>Q{currentIndex + 1}</span>
        </div>
        <p className={styles.questionText}>{current.question}</p>

        <div className={styles.options}>
          {current.options.map((opt) => {
            const isSelected = selected === opt.letter;
            const isCorrect = opt.letter === current.correctAnswer;

            let cls = styles.option;
            if (revealed) {
              if (isCorrect) cls += ` ${styles.optionCorrect}`;
              else if (isSelected) cls += ` ${styles.optionWrong}`;
            }

            return (
              <button
                key={opt.letter}
                type="button"
                className={cls}
                onClick={() => handleSelect(opt.letter)}
                disabled={revealed}
              >
                <span className={styles.optionLetter}>{opt.letter}</span>
                <span className={styles.optionText}>{opt.text}</span>
              </button>
            );
          })}
        </div>

        {!revealed && (
          <p className={styles.hint}>Choose an answer to see the result</p>
        )}
      </article>

      {revealed && (
        <article className={styles.explanationCard} key={currentIndex}>
          <span className={styles.explanationTitle}>
            {wasCorrect ? 'Correct' : 'Incorrect'} · Explanation
          </span>
          {current.explanation ? (
            <p className={styles.explanationBody}>{current.explanation}</p>
          ) : (
            <p className={styles.explanationEmpty}>
              No explanation is available for this question yet.
            </p>
          )}
        </article>
      )}

      {revealed && (
        <div className={`${styles.actions} ${styles.actionsRight}`}>
          <button
            type="button"
            className={styles.nextButton}
            onClick={handleNext}
          >
            {isLast ? 'Finish' : 'Next'}
            <ArrowRight size={16} aria-hidden="true" />
          </button>
        </div>
      )}
    </section>
  );
}
/* ============================================================
   Timed session
   ============================================================ */

interface TimedSessionProps {
  filters: PracticeFilters;
  timeLimitMinutes: number;
  userId: string;
}

function formatTime(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

type Verdict = 'correct' | 'wrong' | 'skipped';

interface ResultRow {
  question: SessionQuestion;
  userAnswer: string | null;
  verdict: Verdict;
}

function TimedSession({
  filters,
  timeLimitMinutes,
  userId,
}: TimedSessionProps) {
  const navigate = useNavigate();

  const [questions, setQuestions] = useState<SessionQuestion[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [currentIndex, setCurrentIndex] = useState(0);

  const [endTime, setEndTime] = useState<number | null>(null);
  const [remainingMs, setRemainingMs] = useState<number>(
    timeLimitMinutes * 60_000,
  );

  const [showNavigator, setShowNavigator] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [results, setResults] = useState<ResultRow[] | null>(null);
  const [timedOut, setTimedOut] = useState(false);

  // Ref to prevent double submit from both the timer and manual click.
  const submittedRef = useRef(false);

  // Load questions, then start the clock.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    pastQuestionsService
      .getSessionQuestions(filters)
      .then((qs) => {
        if (cancelled) return;
        setQuestions(qs);
        if (qs.length > 0) {
          setEndTime(Date.now() + timeLimitMinutes * 60_000);
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Could not load questions.');
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [filters, timeLimitMinutes]);

  const doSubmit = useCallback(
    (isTimeout: boolean) => {
      if (submittedRef.current || !questions) return;
      submittedRef.current = true;

      const rows: ResultRow[] = questions.map((q) => {
        const userAnswer = answers[q.id] ?? null;
        let verdict: Verdict;
        if (!userAnswer) verdict = 'skipped';
        else if (userAnswer === q.correctAnswer) verdict = 'correct';
        else verdict = 'wrong';
        return { question: q, userAnswer, verdict };
      });

      setResults(rows);
      setTimedOut(isTimeout);
      setSubmitted(true);
      setShowNavigator(false);
      setShowConfirm(false);
      window.scrollTo(0, 0);

      // Persist all answered questions — fire and forget.
      const toLog = rows
        .filter((r) => r.userAnswer !== null)
        .map((r) => ({
          questionId: r.question.id,
          selectedAnswer: r.userAnswer as string,
          isCorrect: r.verdict === 'correct',
          attemptType: 'practice' as const,
        }));

      if (toLog.length > 0) {
        attemptService.logAttempts(userId, toLog).catch((err) => {
          if (import.meta.env.DEV) {
            console.warn('[PRACTICE] Failed to log attempts:', err);
          }
        });
        streakService.bumpStreak().catch((err) => {
          if (import.meta.env.DEV) {
            console.warn('[PRACTICE] Failed to bump streak:', err);
          }
        });
      }
    },
    [answers, questions, userId],
  );

  // Timer tick — timestamp based. Survives background tabs.
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

  // Scroll top on question change.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [currentIndex]);

  // Guard: leaving mid-timed-exam loses answers (no resume yet for Practice).
  // Only block while actively answering — not after submit.
  const shouldBlock = !submitted && questions !== null && questions.length > 0;
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      shouldBlock && currentLocation.pathname !== nextLocation.pathname,
  );

  // Browser-level guard: refresh, tab close, back-to-a-link.
  useBeforeUnload(shouldBlock);

  // Lock body scroll behind dialogs.
  useBodyScrollLock(showConfirm || blocker.state === 'blocked');

  function handleSelect(letter: string) {
    if (!questions || submitted) return;
    const q = questions[currentIndex];
    setAnswers((prev) => ({ ...prev, [q.id]: letter }));
  }

  function goNext() {
    if (!questions) return;
    if (currentIndex < questions.length - 1) setCurrentIndex((i) => i + 1);
  }

  function goPrev() {
    if (currentIndex > 0) setCurrentIndex((i) => i - 1);
  }

  function jumpTo(index: number) {
    setCurrentIndex(index);
    setShowNavigator(false);
  }

  function backToFilter() {
    const p = new URLSearchParams({ mode: 'timed' });
    if (filters.subject) p.set('subject', filters.subject);
    if (filters.year) p.set('year', String(filters.year));
    if (filters.section) p.set('section', filters.section);
    if (filters.topic) p.set('topic', filters.topic);
    p.set('time', String(timeLimitMinutes));
    navigate(`/practice/filter?${p.toString()}`);
  }

  function restart() {
    submittedRef.current = false;
    setAnswers({});
    setCurrentIndex(0);
    setSubmitted(false);
    setResults(null);
    setTimedOut(false);
    setShowConfirm(false);
    setShowNavigator(false);
    if (questions && questions.length > 0) {
      setEndTime(Date.now() + timeLimitMinutes * 60_000);
      setRemainingMs(timeLimitMinutes * 60_000);
    }
  }

  // ---------- render ----------

  if (loading) {
    return (
      <section className={styles.page}>
        <Skeleton height={300} />
      </section>
    );
  }

  if (error) {
    return (
      <section className={styles.page}>
        <div className={styles.error}>{error}</div>
        <button
          type="button"
          className={styles.secondaryButton}
          onClick={backToFilter}
        >
          Back to filters
        </button>
      </section>
    );
  }

  if (!questions || questions.length === 0) {
    return (
      <section className={styles.page}>
        <EmptyState
          title="No questions match"
          message="The current filters didn't return any questions."
        />
        <button
          type="button"
          className={styles.primaryButton}
          onClick={backToFilter}
        >
          Back to filters
        </button>
      </section>
    );
  }

  // ---- review mode ----
  if (submitted && results) {
    return <TimedReview results={results} timedOut={timedOut} onRestart={restart} onBack={backToFilter} />;
  }
    // ---- exam mode ----
  const current = questions[currentIndex];
  const isFirst = currentIndex === 0;
  const isLast = currentIndex >= questions.length - 1;
  const answeredCount = Object.keys(answers).length;
  const selectedAnswer = answers[current.id] ?? null;

  const remainingMin = remainingMs / 60_000;

  // Progress bar reflects questions answered, not elapsed time.
  const displayPct = Math.round((answeredCount / questions.length) * 100);
  const timerClass =
    remainingMin <= 1
      ? styles.timerValueDanger
      : remainingMin <= 5
        ? styles.timerValueWarn
        : '';

  return (
    <section className={styles.page}>
      {/* Timer bar */}
      <div className={styles.timerBar}>
        <div className={styles.timerLeft}>
          <TimerIcon size={18} className={styles.timerIcon} aria-hidden="true" />
          <span className={`${styles.timerValue} ${timerClass}`}>
            {formatTime(remainingMs)}
          </span>
          <span className={styles.timerProgress}>
            {answeredCount}/{questions.length}
          </span>
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

      {/* Progress bar (uses elapsed time) */}
      <div className={styles.progressTrack} aria-hidden="true">
        <div
          className={styles.progressFill}
          style={{ width: `${displayPct}%` }}
        />
      </div>

      <div className={styles.metaRow}>
        <span className={styles.metaChip}>
          {current.subject} · {current.year}
        </span>
        <span className={styles.metaChip}>Q{current.questionNumber}</span>
      </div>

      <article className={styles.questionCard}>
        <div className={styles.questionHeader}>
          <span className={styles.qBadge}>
            {currentIndex + 1} / {questions.length}
          </span>
        </div>
        <p className={styles.questionText}>{current.question}</p>

        <div className={styles.options}>
          {current.options.map((opt) => {
            const isSelected = selectedAnswer === opt.letter;
            return (
              <button
                key={opt.letter}
                type="button"
                className={`${styles.option} ${isSelected ? styles.optionSelected : ''}`}
                onClick={() => handleSelect(opt.letter)}
              >
                <span className={styles.optionLetter}>{opt.letter}</span>
                <span className={styles.optionText}>{opt.text}</span>
              </button>
            );
          })}
        </div>
      </article>

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.prevButton}
          onClick={goPrev}
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
            onClick={goNext}
          >
            Next
            <ArrowRight size={16} aria-hidden="true" />
          </button>
        )}
      </div>

      {/* Navigator sheet */}
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
                    onClick={() => jumpTo(i)}
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
              Submit exam
            </button>
          </div>
        </>
      )}

      {/* Submit confirm */}
      {showConfirm && (
        <div className={styles.confirmOverlay}>
          <div className={styles.confirmCard} role="dialog">
            <span className={styles.confirmTitle}>Submit exam?</span>
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
          <div className={styles.confirmCard} role="dialog">
            <span className={styles.confirmTitle}>Leave session?</span>
            <p className={styles.confirmText}>
              You're in the middle of a timed session. If you leave now,
              your answers won't be saved.
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
   Timed review
   ============================================================ */

interface TimedReviewProps {
  results: ResultRow[];
  timedOut: boolean;
  onRestart: () => void;
  onBack: () => void;
}

function TimedReview({ results, timedOut, onRestart, onBack }: TimedReviewProps) {
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
          {timedOut ? 'Time up' : 'Exam complete'}
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

        <div className={styles.endActions}>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={onRestart}
          >
            <RotateCcw size={14} aria-hidden="true" />
            Retake
          </button>
          <button
            type="button"
            className={styles.primaryButton}
            onClick={onBack}
          >
            Back to filters
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

              <p className={styles.reviewQuestion}>{row.question.question}</p>

              <div className={styles.reviewOptions}>
                {row.question.options.map((opt) => {
                  const isUser = row.userAnswer === opt.letter;
                  const isCorrect = row.question.correctAnswer === opt.letter;

                  let cls = styles.reviewOption;
                  if (isUser && isCorrect) {
                    cls += ` ${styles.reviewOptionUserCorrect}`;
                  } else if (isUser && !isCorrect) {
                    cls += ` ${styles.reviewOptionUserWrong}`;
                  } else if (!isUser && isCorrect) {
                    cls += ` ${styles.reviewOptionShowCorrect}`;
                  }

                  return (
                    <div key={opt.letter} className={cls}>
                      <span className={styles.reviewOptionLetter}>
                        {opt.letter}
                      </span>
                      <span className={styles.reviewOptionText}>{opt.text}</span>
                    </div>
                  );
                })}
              </div>

              <div className={styles.reviewExplanation}>
                {row.question.explanation || (
                  <span className={styles.reviewExplanationEmpty}>
                    No explanation available for this question yet.
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