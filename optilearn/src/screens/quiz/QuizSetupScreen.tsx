import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useProfile } from '@/context/ProfileContext';
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
  const { profile, loading: profileLoading } = useProfile();

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

  const department = profile?.department ?? null;

  useEffect(() => {
    const stored = readSession<QuizPersistedSession>(QUIZ_SESSION_KEY);
    setResumable(isLiveQuizSession(stored) ? stored : null);
  }, []);

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

  function handleStart() {
    if (!canStart || !subject) return;
    const p = new URLSearchParams();
    p.set('subject', subject);
    p.set('difficulty', difficulty);
    p.set('time', String(timeMinutes));
    p.set('count', String(count));
    navigate(`/quiz/session?${p.toString()}`);
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
              {DIFFICULTIES.map((d) => (
                <button
                  key={d.key}
                  type="button"
                  className={`${styles.chip} ${
                    difficulty === d.key ? styles.chipActive : ''
                  }`}
                  onClick={() => setDifficulty(d.key)}
                >
                  {d.label}
                </button>
              ))}
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
              disabled={!canStart}
            >
              Start
              <ArrowRight size={16} aria-hidden="true" />
            </button>
          </div>
        </>
      )}
    </section>
  );
}
