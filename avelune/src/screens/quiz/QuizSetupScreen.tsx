import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useProfile } from '@/context/ProfileContext';
import {
  entitlementService,
  type Gate,
} from '@/services/entitlements/entitlementService';
import { unlockService } from '@/services/usage/unlockService';
import { rewardedService } from '@/services/ads/rewardedService';
import {
  syllabusService,
  type SubjectSummary,
} from '@/services/syllabus/syllabusService';
import { subjectColor } from '@/utils/subjectColor';
import { Play } from 'lucide-react';
import { BackButton } from '@/components/ui/BackButton';
import { readSession } from '@/utils/sessionStorage';
import {
  QUIZ_SESSION_KEY,
  isLiveQuizSession,
  quizSessionPath,
  type QuizPersistedSession,
} from './quizSession';
import { Button } from '@/components/ui/Button';
import { CapSheet } from '@/components/tiers/CapSheet';
import { Skeleton } from '@/components/ui/Skeleton';
import {
  TIME_OPTIONS,
  QUESTION_OPTIONS,
  DIFFICULTIES,
  DEFAULT_TIME_MINUTES,
  DEFAULT_QUESTION_COUNT,
  DEFAULT_DIFFICULTY,
  type Difficulty,
} from './quizConfig';
import styles from './QuizSetupScreen.module.css';

function parseDifficulty(raw: string | null): Difficulty {
  if (raw === 'easy' || raw === 'medium' || raw === 'hard') return raw;
  return DEFAULT_DIFFICULTY;
}

export function QuizSetupScreen() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { user } = useAuth();
  const { profile, loading: profileLoading, limits } = useProfile();

  const initialDifficulty = parseDifficulty(params.get('difficulty'));

  const [subjects, setSubjects] = useState<SubjectSummary[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  const [difficulty, setDifficulty] = useState<Difficulty>(initialDifficulty);
  const [subject, setSubject] = useState<string | null>(null);
  const [timeMinutes, setTimeMinutes] = useState<number>(DEFAULT_TIME_MINUTES);
  const [count, setCount] = useState<number>(DEFAULT_QUESTION_COUNT);
  const [resumable, setResumable] = useState<QuizPersistedSession | null>(null);
  const [quizGate, setQuizGate] = useState<Gate | null>(null);
  const [checkingGate, setCheckingGate] = useState(false);
  const [capSheetOpen, setCapSheetOpen] = useState(false);
  const [unlocking, setUnlocking] = useState(false);

  const allowedDifficulties = limits.quizzes.difficulties;

  const department = profile?.department ?? null;

  useEffect(() => {
    const stored = readSession<QuizPersistedSession>(QUIZ_SESSION_KEY);
    setResumable(isLiveQuizSession(stored) ? stored : null);
  }, []);

  // Force difficulty to an allowed one on load.
  useEffect(() => {
    if (!allowedDifficulties.includes(difficulty)) {
      setDifficulty(allowedDifficulties[0]);
    }
  }, [allowedDifficulties, difficulty]);

  // Refresh the gate on every difficulty change.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void entitlementService
      .quizGate(user.id, limits, difficulty)
      .then((g) => {
        if (!cancelled) setQuizGate(g);
      })
      .catch((err) => {
        if (import.meta.env.DEV) {
          console.warn('[QUIZ] Gate lookup failed:', err);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [user, limits, difficulty]);

  useEffect(() => {
    if (!user || profileLoading) return;
    let cancelled = false;

    setLoading(true);
    setError(null);

    syllabusService
      .getSubjectSummaries(user.id, department)
      .then((rows) => {
        if (cancelled) return;
        setSubjects(rows);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (import.meta.env.DEV) {
          console.warn('[QUIZ] Load subjects failed:', err);
        }
        setError(
          "We couldn't load subjects. Check your connection and try again.",
        );
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user, profileLoading, department, retryKey]);

  const canStart = subject !== null;

  async function handleStart() {
    if (!canStart || !subject || !user) return;
    setCheckingGate(true);
    try {
      const gate = await entitlementService.quizGate(user.id, limits, difficulty);
      setQuizGate(gate);
      if (gate.state === 'at-cap' || gate.state === 'blocked') {
        setCapSheetOpen(true);
        return;
      }
      const p = new URLSearchParams();
      p.set('subject', subject);
      p.set('difficulty', difficulty);
      p.set('time', String(timeMinutes));
      p.set('count', String(count));
      navigate(`/quiz/session?${p.toString()}`);
    } finally {
      setCheckingGate(false);
    }
  }

  async function handleWatchQuizAd() {
    if (!user || unlocking) return;
    setUnlocking(true);
    try {
      const result = await rewardedService.show();
      if (result !== 'rewarded') return;
      await unlockService.grantQuizAdReward(user.id);
      const gate = await entitlementService.quizGate(user.id, limits, difficulty);
      setQuizGate(gate);
      if (gate.state === 'has-room') {
        setCapSheetOpen(false);
      }
    } catch (err) {
      if (import.meta.env.DEV) {
        console.warn('[QUIZ] Unlock failed:', err);
      }
    } finally {
      setUnlocking(false);
    }
  }

  return (
    <section className={styles.page}>
      <BackButton label="Quiz" onClick={() => navigate('/quiz')} />

      {resumable && (
        <button
          type="button"
          className={styles.resumeBanner}
          onClick={() => navigate(quizSessionPath(resumable))}
        >
          <span className={styles.resumeIcon}>
            <Play size={16} aria-hidden="true" />
          </span>
          <span className={styles.resumeText}>
            <span className={styles.resumeTitle}>Resume quiz</span>
            <span className={styles.resumeMeta}>
              {resumable.subject} - {Object.keys(resumable.answers).length}/{resumable.questions.length} answered
            </span>
          </span>
        </button>
      )}

      <div className={styles.header}>
        <h1 className={styles.title}>Set up your quiz</h1>
        <p className={styles.subtitle}>
          Pick a subject, then tune the session.
        </p>
      </div>

      {error && (
        <>
          <div className={styles.error}>{error}</div>
          <Button
            variant="secondary"
            fullWidth
            onClick={() => setRetryKey((k) => k + 1)}
          >
            Try again
          </Button>
        </>
      )}

      {loading && <Skeleton height={280} />}

      {!loading && !error && subjects && subjects.length === 0 && (
        <div className={styles.empty}>
          No subjects match your department yet.
        </div>
      )}

      {!loading && !error && subjects && subjects.length > 0 && (
        <>
          <div className={styles.section}>
            <span className={styles.sectionLabel}>Subject</span>
            <div className={styles.chipRow}>
              {subjects.map((s) => {
                const active = subject === s.subject;
                const accent = subjectColor(s.subject);
                return (
                  <button
                    key={s.subject}
                    type="button"
                    className={`${styles.chip} ${active ? styles.chipActive : ''}`}
                    style={
                      active
                        ? {
                            borderColor: accent.fg,
                            color: accent.fg,
                            background: accent.bg,
                          }
                        : undefined
                    }
                    onClick={() => setSubject(s.subject)}
                  >
                    {s.subject}
                  </button>
                );
              })}
            </div>
          </div>

          <div className={styles.section}>
            <span className={styles.sectionLabel}>Difficulty</span>
            <div className={styles.chipRow}>
              {DIFFICULTIES.map((d) => {
                const locked = !allowedDifficulties.includes(d.key);
                return (
                  <button
                    key={d.key}
                    type="button"
                    className={`${styles.chip} ${
                      difficulty === d.key ? styles.chipActive : ''
                    } ${locked ? styles.chipLocked : ''}`}
                    onClick={() => {
                      if (locked) {
                        setCapSheetOpen(true);
                        return;
                      }
                      setDifficulty(d.key);
                    }}
                    aria-disabled={locked}
                  >
                    {d.label}
                    {locked && ' \u00b7 Upgrade'}
                  </button>
                );
              })}
            </div>
          </div>

          <div className={styles.section}>
            <span className={styles.sectionLabel}>Time</span>
            <div className={styles.chipRow}>
              {TIME_OPTIONS.map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`${styles.chip} ${
                    timeMinutes === t ? styles.chipActive : ''
                  }`}
                  onClick={() => setTimeMinutes(t)}
                >
                  {t} min
                </button>
              ))}
            </div>
          </div>

          <div className={styles.section}>
            <span className={styles.sectionLabel}>Questions</span>
            <div className={styles.chipRow}>
              {QUESTION_OPTIONS.map((n) => (
                <button
                  key={n}
                  type="button"
                  className={`${styles.chip} ${
                    count === n ? styles.chipActive : ''
                  }`}
                  onClick={() => setCount(n)}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          {quizGate && quizGate.state !== 'unlimited' && quizGate.state !== 'blocked' && (
            <div className={styles.gateLine}>
              {quizGate.remaining > 0
                ? `${quizGate.remaining} quiz${quizGate.remaining === 1 ? '' : 'zes'} remaining today`
                : 'No quizzes remaining today — watch a video or upgrade'}
            </div>
          )}

          <div className={styles.summaryBar}>
            <div className={styles.summaryText}>
              <span className={styles.summaryMain}>
                {subject ?? 'Pick a subject'}
              </span>
              <span className={styles.summaryMeta}>
                {difficulty} · {count} questions · {timeMinutes} min
              </span>
            </div>
            <button
              type="button"
              className={styles.startButton}
              onClick={handleStart}
              disabled={!canStart || checkingGate}
            >
              {checkingGate ? 'Checking…' : 'Start'}
              <ArrowRight size={16} aria-hidden="true" />
            </button>
          </div>
        </>
      )}

      <CapSheet
        open={capSheetOpen}
        title={
          !allowedDifficulties.includes(difficulty)
            ? 'Upgrade to unlock this difficulty'
            : 'No quizzes remaining'
        }
        body={
          !allowedDifficulties.includes(difficulty)
            ? 'Medium and Hard quizzes are available on Pro and above.'
            : quizGate?.canWatchAd
              ? `Watch a short video to unlock ${quizGate.adReward} more quiz.`
              : 'You\u2019ve used all your quiz unlocks for today. Upgrade for unlimited practice.'
        }
        onWatchAd={
          quizGate?.canWatchAd && allowedDifficulties.includes(difficulty)
            ? handleWatchQuizAd
            : undefined
        }
        watchLabel={quizGate ? `Watch for +${quizGate.adReward}` : undefined}
        onSeePlans={() => {
          setCapSheetOpen(false);
          navigate('/subscribe');
        }}
        onDismiss={() => setCapSheetOpen(false)}
        busy={unlocking}
      />
    </section>
  );
}
