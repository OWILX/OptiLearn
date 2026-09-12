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
  ChevronDown,
  Save,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { questionService } from '@/services/questions/questionService';
import { examService } from '@/services/exams/examService';
import { streakService } from '@/services/streaks/streakService';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { useBeforeUnload } from '@/hooks/useBeforeUnload';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';
import {
  readSession,
  writeSession,
  clearSession,
} from '@/utils/sessionStorage';
import styles from './SepExamScreen.module.css';

import {
  SEP_SESSION_KEY,
  type SEPPersistedSessionSession,
  type SepPersistedQuestion,
} from '@/services/exams/sepSession';

const LETTERS = ['A', 'B', 'C', 'D'] as const;
const PER_SLOT_TARGETS = [60, 40, 40, 40] as const;

interface SepConfig {
  subjects: string[];
  timeLimitMinutes: number;
}

function parseConfig(params: URLSearchParams): SepConfig | null {
  const subjectsRaw = params.get('subjects');
  const timeRaw = params.get('time');
  if (!subjectsRaw || !timeRaw) return null;

  const subjects = subjectsRaw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const time = Number(timeRaw);

  if (subjects.length !== 4) return null;
  if (!Number.isFinite(time) || time <= 0 || time > 600) return null;

  return { subjects, timeLimitMinutes: time };
}

type SepQuestion = SepPersistedQuestion;

type Verdict = 'correct' | 'wrong' | 'skipped';

interface ResultRow {
  question: SepQuestion;
  userAnswer: string | null;
  verdict: Verdict;
}

function formatTime(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function configMatches(
  persisted: SEPPersistedSession,
  config: SepConfig,
): boolean {
  if (persisted.version !== 1) return false;
  if (persisted.timeLimitMinutes !== config.timeLimitMinutes) return false;
  if (persisted.subjects.length !== config.subjects.length) return false;
  return persisted.subjects.every((s, i) => s === config.subjects[i]);
}

export function SepExamScreen() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [params] = useSearchParams();
  const config = useMemo(() => parseConfig(params), [params]);

  useEffect(() => {
    if (!config) navigate('/sep', { replace: true });
  }, [config, navigate]);

  const [questions, setQuestions] = useState<SepQuestion[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [currentIndex, setCurrentIndex] = useState(0);

  const [endTime, setEndTime] = useState<number | null>(null);
  const [remainingMs, setRemainingMs] = useState<number>(0);
  const [startedAt, setStartedAt] = useState<string | null>(null);

  const [showNavigator, setShowNavigator] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [results, setResults] = useState<ResultRow[] | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [wasResumed, setWasResumed] = useState(false);

  const submittedRef = useRef(false);

  // ---------- load or restore ----------
  useEffect(() => {
    if (!config || !user) return;
    let cancelled = false;

    setLoading(true);
    setError(null);

    (async () => {
      try {
        // 1. Try to restore a matching persisted session.
        const persisted = readSession<SEPPersistedSession>(SEP_SESSION_KEY);
        if (
          persisted &&
          configMatches(persisted, config) &&
          persisted.endTime - Date.now() > 0
        ) {
          if (cancelled) return;
          setQuestions(persisted.questions);
          setAnswers(persisted.answers);
          setCurrentIndex(persisted.currentIndex);
          setStartedAt(persisted.startedAt);
          setEndTime(persisted.endTime);
          setRemainingMs(persisted.endTime - Date.now());
          setWasResumed(true);
          setLoading(false);
          return;
        }

        // 2. Any stale session is discarded.
        clearSession(SEP_SESSION_KEY);
        setWasResumed(false);

        // 3. Sample fresh questions.
        const flat: SepQuestion[] = [];
        for (let i = 0; i < config.subjects.length; i++) {
          const subject = config.subjects[i];
          const target = PER_SLOT_TARGETS[i] ?? 40;
          const qs = await questionService.getSEPQuestions(
            user.id,
            subject,
            target,
          );
          for (const q of qs) flat.push({ ...q, subject });
          if (cancelled) return;
        }
        if (cancelled) return;

        if (flat.length === 0) {
          setQuestions([]);
          setError(
            'No questions are available for the selected subjects yet.',
          );
          setLoading(false);
          return;
        }

        const nowIso = new Date().toISOString();
        const endMs = Date.now() + config.timeLimitMinutes * 60_000;

        setQuestions(flat);
        setStartedAt(nowIso);
        setEndTime(endMs);
        setRemainingMs(config.timeLimitMinutes * 60_000);
        setLoading(false);

        writeSession<SEPPersistedSession>(SEP_SESSION_KEY, {
          version: 1,
          subjects: config.subjects,
          timeLimitMinutes: config.timeLimitMinutes,
          startedAt: nowIso,
          endTime: endMs,
          questions: flat,
          answers: {},
          currentIndex: 0,
        });
      } catch (err) {
        if (cancelled) return;
        setError(
          err instanceof Error ? err.message : 'Could not load the exam.',
        );
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [config, user, reloadKey]);

  // ---------- persist on every change ----------
  useEffect(() => {
    if (
      loading ||
      submitted ||
      !questions ||
      !config ||
      !startedAt ||
      !endTime
    )
      return;
    writeSession<SEPPersistedSession>(SEP_SESSION_KEY, {
      version: 1,
      subjects: config.subjects,
      timeLimitMinutes: config.timeLimitMinutes,
      startedAt,
      endTime,
      questions,
      answers,
      currentIndex,
    });
  }, [
    loading,
    submitted,
    questions,
    answers,
    currentIndex,
    config,
    startedAt,
    endTime,
  ]);

  // ---------- submit ----------
  const doSubmit = useCallback(
    (isTimeout: boolean) => {
      if (submittedRef.current || !questions || !user || !config) return;
      submittedRef.current = true;
      clearSession(SEP_SESSION_KEY);

      const rows: ResultRow[] = questions.map((q) => {
        const userAnswer = answers[q.id] ?? null;
        let verdict: Verdict;
        if (!userAnswer) verdict = 'skipped';
        else if (userAnswer === q.answer) verdict = 'correct';
        else verdict = 'wrong';
        return { question: q, userAnswer, verdict };
      });

      setResults(rows);
      setTimedOut(isTimeout);
      setSubmitted(true);
      setShowNavigator(false);
      setShowConfirm(false);
      window.scrollTo(0, 0);

      const correct = rows.filter((r) => r.verdict === 'correct').length;
      const answered = rows.filter((r) => r.userAnswer !== null).length;
      const score =
        rows.length > 0
          ? Math.round((correct / rows.length) * 10000) / 100
          : 0;
      examService
        .saveSEPAttempt({
          userId: user.id,
          subjects: config.subjects,
          startedAt: startedAt ?? new Date().toISOString(),
          completedAt: new Date().toISOString(),
          timeLimitSeconds: config.timeLimitMinutes * 60,
          totalQuestions: rows.length,
          questionsAnswered: answered,
          correctAnswers: correct,
          score,
          questions: rows.map((r) => ({
            questionId: r.question.id,
            selectedAnswer: r.userAnswer,
            isCorrect: r.verdict === 'correct',
          })),
        })
        .catch((err) => {
          if (import.meta.env.DEV) {
            console.warn('[SEP] Failed to persist attempt:', err);
          }
        });
      streakService
        .bumpStreak()
        .then((info) => {
          window.alert('SEP streak OK: ' + JSON.stringify(info));
        })
        .catch((err) => {
          window.alert(
            'SEP streak ERROR: ' +
              (err instanceof Error ? err.message : String(err)),
          );
        });
    },
    [answers, questions, user, config, startedAt],
  );

  // ---------- timer ----------
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

  // ---------- scroll on question change ----------
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [currentIndex]);

  // ---------- guard: refresh / close tab ----------
  const shouldWarn =
    !submitted && !loading && questions !== null && questions.length > 0;
  useBeforeUnload(shouldWarn);



  // ---------- guard: in-app navigation / browser back ----------
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      shouldWarn && currentLocation.pathname !== nextLocation.pathname,
  );

  // Lock body scroll when any dialog is visible.
  useBodyScrollLock(
    showConfirm || showNavigator || blocker.state === 'blocked',
  );

  function restartExam() {
    clearSession(SEP_SESSION_KEY);
    submittedRef.current = false;
    setAnswers({});
    setCurrentIndex(0);
    setSubmitted(false);
    setResults(null);
    setTimedOut(false);
    setShowNavigator(false);
    setShowConfirm(false);
    setQuestions(null);
    setEndTime(null);
    setRemainingMs(0);
    setStartedAt(null);
    setWasResumed(false);
    setReloadKey((k) => k + 1);
  }

  if (!config) return null;

  // ---------- render: loading ----------
  if (loading) {
    return (
      <section className={styles.page}>
        <Skeleton height={300} />
      </section>
    );
  }

  // ---------- render: error / empty ----------
  if (error || !questions || questions.length === 0) {
    return (
      <section className={styles.page}>
        <EmptyState
          icon={<AlertTriangle size={24} aria-hidden="true" />}
          title="Exam not available"
          message={error ?? 'No questions match the selected subjects yet.'}
        />
        <button
          type="button"
          className={styles.primaryButton}
          onClick={() => navigate('/sep')}
        >
          Back to setup
        </button>
      </section>
    );
  }

  // ---------- render: review ----------
  if (submitted && results) {
    return (
      <SepReview
        results={results}
        timedOut={timedOut}
        onRetake={restartExam}
        onBack={() => navigate('/sep')}
      />
    );
  }

  // ---------- render: exam ----------
  const current = questions[currentIndex];
  const isFirst = currentIndex === 0;
  const isLast = currentIndex >= questions.length - 1;
  const answeredCount = Object.keys(answers).length;
  const selectedAnswer = answers[current.id] ?? null;
  const displayPct = Math.round((answeredCount / questions.length) * 100);

  const remainingMin = remainingMs / 60_000;
  const timerClass =
    remainingMin <= 5
      ? styles.timerValueDanger
      : remainingMin <= 15
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
        <span className={styles.metaChip}>{current.subject}</span>
        <span className={styles.metaChip}>
          {currentIndex + 1} / {questions.length}
        </span>
      </div>

      <article className={styles.questionCard}>
        <p className={styles.questionText}>{current.question}</p>
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
                <span className={styles.optionText}>{opt}</span>
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
        <SepNavigator
          questions={questions}
          answers={answers}
          currentIndex={currentIndex}
          onJump={(i) => {
            setCurrentIndex(i);
            setShowNavigator(false);
          }}
          onClose={() => setShowNavigator(false)}
          onSubmit={() => {
            setShowNavigator(false);
            setShowConfirm(true);
          }}
        />
      )}

      {showConfirm && (
        <SepConfirmSubmit
          total={questions.length}
          answered={answeredCount}
          onCancel={() => setShowConfirm(false)}
          onConfirm={() => doSubmit(false)}
        />
      )}

      {blocker.state === 'blocked' && (
        <div className={styles.confirmOverlay}>
          <div
            className={styles.confirmCard}
            role="dialog"
            aria-modal="true"
          >
            <span className={styles.confirmTitle}>Leave exam?</span>
            <p className={styles.confirmText}>
              Your progress is saved. You can resume this exam later from
              where you stopped — the timer will keep counting down in the
              background.
            </p>
            <div className={styles.confirmActions}>
              <button
                type="button"
                className={styles.primaryButton}
                onClick={() => blocker.reset?.()}
              >
                Stay in exam
              </button>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => blocker.proceed?.()}
              >
                Leave
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

/* ============================================================
   Navigator — grouped by subject
   ============================================================ */

interface SepNavigatorProps {
  questions: SepQuestion[];
  answers: Record<number, string>;
  currentIndex: number;
  onJump: (index: number) => void;
  onClose: () => void;
  onSubmit: () => void;
}

interface SubjectBlock {
  subject: string;
  startIndex: number;
  endIndex: number;
}

function SepNavigator({
  questions,
  answers,
  currentIndex,
  onJump,
  onClose,
  onSubmit,
}: SepNavigatorProps) {
  const blocks = useMemo(() => {
    const out: SubjectBlock[] = [];
    let i = 0;
    while (i < questions.length) {
      const subject = questions[i].subject;
      const start = i;
      while (i < questions.length && questions[i].subject === subject) i++;
      out.push({ subject, startIndex: start, endIndex: i - 1 });
    }
    return out;
  }, [questions]);

  return (
    <>
      <div
        className={styles.sheetOverlay}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className={styles.sheet}
        role="dialog"
        aria-label="Question navigator"
      >
        <div className={styles.sheetHeader}>
          <span className={styles.sheetTitle}>Jump to question</span>
          <button
            type="button"
            className={styles.sheetClose}
            onClick={onClose}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <div className={styles.sheetLegend}>
          <span className={styles.legendItem}>
            <span
              className={`${styles.legendDot} ${styles.legendDotCurrent}`}
            />
            Current
          </span>
          <span className={styles.legendItem}>
            <span
              className={`${styles.legendDot} ${styles.legendDotAnswered}`}
            />
            Answered
          </span>
          <span className={styles.legendItem}>
            <span
              className={`${styles.legendDot} ${styles.legendDotEmpty}`}
            />
            Unanswered
          </span>
        </div>

        {blocks.map((block) => (
          <div key={block.subject} className={styles.subjectGroup}>
            <div className={styles.subjectHeader}>
              <span className={styles.subjectName}>{block.subject}</span>
              <span className={styles.subjectRange}>
                {block.startIndex + 1}–{block.endIndex + 1}
              </span>
            </div>
            <div className={styles.navigatorGrid}>
              {questions
                .slice(block.startIndex, block.endIndex + 1)
                .map((q, offset) => {
                  const i = block.startIndex + offset;
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
                      onClick={() => onJump(i)}
                    >
                      {i + 1}
                    </button>
                  );
                })}
            </div>
          </div>
        ))}

        <button
          type="button"
          className={`${styles.primaryButton} ${styles.sheetSubmit}`}
          onClick={onSubmit}
        >
          Submit exam
        </button>
      </div>
    </>
  );
}

/* ============================================================
   Confirm submit dialog
   ============================================================ */

interface SepConfirmSubmitProps {
  total: number;
  answered: number;
  onCancel: () => void;
  onConfirm: () => void;
}

function SepConfirmSubmit({
  total,
  answered,
  onCancel,
  onConfirm,
}: SepConfirmSubmitProps) {
  const unanswered = total - answered;
  return (
    <div className={styles.confirmOverlay}>
      <div className={styles.confirmCard} role="dialog" aria-modal="true">
        <span className={styles.confirmTitle}>Submit exam?</span>
        {unanswered > 0 ? (
          <p className={styles.confirmText}>
            You have{' '}
            <span className={styles.confirmStrong}>
              {unanswered} unanswered{' '}
              {unanswered === 1 ? 'question' : 'questions'}
            </span>
            . Unanswered questions will be marked as wrong.
          </p>
        ) : (
          <p className={styles.confirmText}>
            All {total} questions answered. Ready to submit?
          </p>
        )}
        <div className={styles.confirmActions}>
          <button
            type="button"
            className={styles.secondaryButton}
            onClick={onCancel}
          >
            Keep working
          </button>
          <button
            type="button"
            className={styles.primaryButton}
            onClick={onConfirm}
          >
            Submit
          </button>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   Review
   ============================================================ */

interface SepReviewProps {
  results: ResultRow[];
  timedOut: boolean;
  onRetake: () => void;
  onBack: () => void;
}

interface ReviewGroup {
  subject: string;
  rows: ResultRow[];
  correct: number;
  wrong: number;
  skipped: number;
}

function SepReview({ results, timedOut, onRetake, onBack }: SepReviewProps) {
  const [openSubjects, setOpenSubjects] = useState<Set<string>>(new Set());

  const total = results.length;
  const correct = results.filter((r) => r.verdict === 'correct').length;
  const wrong = results.filter((r) => r.verdict === 'wrong').length;
  const skipped = results.filter((r) => r.verdict === 'skipped').length;
  const pct = total > 0 ? Math.round((correct / total) * 100) : 0;

  const groups: ReviewGroup[] = useMemo(() => {
    const map = new Map<string, ReviewGroup>();
    for (const row of results) {
      const s = row.question.subject;
      let g = map.get(s);
      if (!g) {
        g = { subject: s, rows: [], correct: 0, wrong: 0, skipped: 0 };
        map.set(s, g);
      }
      g.rows.push(row);
      if (row.verdict === 'correct') g.correct += 1;
      else if (row.verdict === 'wrong') g.wrong += 1;
      else g.skipped += 1;
    }
    return Array.from(map.values());
  }, [results]);

  function toggleSubject(s: string) {
    setOpenSubjects((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  }

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

      <div className={styles.subjectSectionList}>
        {groups.map((g) => {
          const open = openSubjects.has(g.subject);
          const gTotal = g.rows.length;
          const gPct = gTotal > 0 ? Math.round((g.correct / gTotal) * 100) : 0;
          return (
            <div key={g.subject} className={styles.subjectSection}>
              <button
                type="button"
                className={styles.subjectSectionHeader}
                onClick={() => toggleSubject(g.subject)}
                aria-expanded={open}
              >
                <div className={styles.subjectSectionLeft}>
                  <ChevronDown
                    size={18}
                    className={`${styles.subjectSectionChevron} ${
                      open ? styles.subjectSectionChevronOpen : ''
                    }`}
                    aria-hidden="true"
                  />
                  <span className={styles.subjectSectionName}>
                    {g.subject}
                  </span>
                </div>
                <span className={styles.subjectSectionScore}>
                  {g.correct}/{gTotal}{' '}
                  <span className={styles.subjectSectionPct}>{gPct}%</span>
                </span>
              </button>

              {open && (
                <div className={styles.subjectSectionBody}>
                  {g.rows.map((row) => {
                    const qIndex = results.indexOf(row) + 1;
                    const verdictClass =
                      row.verdict === 'correct'
                        ? styles.reviewVerdictCorrect
                        : row.verdict === 'wrong'
                          ? styles.reviewVerdictWrong
                          : styles.reviewVerdictSkipped;

                    return (
                      <div
                        key={row.question.id}
                        className={styles.reviewCard}
                      >
                        <div className={styles.reviewCardHeader}>
                          <span className={styles.qBadge}>Q{qIndex}</span>
                          <span
                            className={`${styles.reviewVerdict} ${verdictClass}`}
                          >
                            {row.verdict === 'correct'
                              ? 'Correct'
                              : row.verdict === 'wrong'
                                ? 'Wrong'
                                : 'Skipped'}
                          </span>
                        </div>

                        <p className={styles.reviewQuestion}>
                          {row.question.question}
                        </p>

                        <div className={styles.reviewOptions}>
                          {row.question.options.map((opt, i) => {
                            const letter = LETTERS[i];
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
                                <span className={styles.reviewOptionText}>
                                  {opt}
                                </span>
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
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
