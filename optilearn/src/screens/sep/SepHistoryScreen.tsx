import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Timer } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import {
  examService,
  type AttemptListItem,
} from '@/services/exams/examService';
import { BackButton } from '@/components/ui/BackButton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import styles from './SepHistoryScreen.module.css';

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function scorePct(item: AttemptListItem): number {
  if (item.score !== null) return Math.round(item.score);
  if (item.totalQuestions > 0) {
    return Math.round((item.correctAnswers / item.totalQuestions) * 100);
  }
  return 0;
}

function scoreClass(pct: number): string {
  if (pct >= 70) return styles.scoreGood;
  if (pct >= 40) return styles.scoreMid;
  return styles.scoreBad;
}

export function SepHistoryScreen() {
  const navigate = useNavigate();
  const { user } = useAuth();

  const [attempts, setAttempts] = useState<AttemptListItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    setLoading(true);
    setError(null);

    examService
      .getAttempts(user.id, 50)
      .then((rows) => {
        if (cancelled) return;
        setAttempts(rows);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Could not load history.');
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user]);

  return (
    <section className={styles.page}>
      <BackButton label="SEP" onClick={() => navigate('/sep')} />

      <div className={styles.header}>
        <h1 className={styles.title}>Exam history</h1>
        <p className={styles.subtitle}>
          Every completed SEP attempt, most recent first.
        </p>
      </div>

      {error && <div className={styles.error}>{error}</div>}

      {loading && (
        <div className={styles.list}>
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} height={80} />
          ))}
        </div>
      )}

      {!loading && attempts && attempts.length === 0 && (
        <EmptyState
          icon={<Timer size={24} aria-hidden="true" />}
          title="No attempts yet"
          message="Take a Simulated Exam Practice session and it will appear here."
        />
      )}

      {!loading && attempts && attempts.length > 0 && (
        <div className={styles.list}>
          {attempts.map((a) => {
            const pct = scorePct(a);
            const subjects = a.subject
              ? a.subject.split(',').map((s) => s.trim()).filter(Boolean)
              : [];
            const subjectLine =
              subjects.length > 0 ? subjects.join(' · ') : 'SEP exam';

            return (
              <button
                key={a.id}
                type="button"
                className={styles.row}
                onClick={() => navigate(`/sep/history/${a.id}`)}
              >
                <div className={`${styles.scoreCircle} ${scoreClass(pct)}`}>
                  {pct}%
                </div>

                <div className={styles.body}>
                  <span className={styles.subjectLine}>{subjectLine}</span>
                  <span className={styles.metaLine}>
                    {formatDate(a.completedAt)} · {formatTime(a.completedAt)}
                    {'  ·  '}
                    {a.correctAnswers}/{a.totalQuestions} correct
                  </span>
                </div>

                <ChevronRight
                  size={18}
                  className={styles.chevron}
                  aria-hidden="true"
                />
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
