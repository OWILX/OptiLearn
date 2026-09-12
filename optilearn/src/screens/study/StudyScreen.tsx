import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useProfile } from '@/context/ProfileContext';
import {
  syllabusService,
  type SubjectSummary,
} from '@/services/syllabus/syllabusService';
import { subjectColor } from '@/utils/subjectColor';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import styles from './StudyScreen.module.css';

export function StudyScreen() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { profile, loading: profileLoading } = useProfile();

  const [subjects, setSubjects] = useState<SubjectSummary[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const department = profile?.department ?? null;

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
        setError(err instanceof Error ? err.message : 'Could not load subjects.');
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user, profileLoading, department]);

  return (
    <section className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Study</h1>
        <p className={styles.subtitle}>
          Read questions, reveal answers, and work through the curriculum.
        </p>
      </div>

      {error && <div className={styles.error}>{error}</div>}

      {loading && (
        <div className={styles.grid}>
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} height={152} />
          ))}
        </div>
      )}

      {!loading && subjects && subjects.length === 0 && (
        <EmptyState
          icon={<BookOpen size={24} aria-hidden="true" />}
          title="No subjects yet"
          message="No subjects match your department in the curriculum yet."
        />
      )}

      {!loading && subjects && subjects.length > 0 && (
        <div className={styles.grid}>
          {subjects.map((s) => (
            <SubjectCard
              key={s.subject}
              summary={s}
              onOpen={() =>
                navigate(`/study/subject/${encodeURIComponent(s.subject)}`)
              }
            />
          ))}
        </div>
      )}
    </section>
  );
}

interface SubjectCardProps {
  summary: SubjectSummary;
  onOpen: () => void;
}

function SubjectCard({ summary, onOpen }: SubjectCardProps) {
  const accent = subjectColor(summary.subject);
  const initial = summary.subject.trim().charAt(0).toUpperCase();
  const pct = Math.max(0, Math.min(100, summary.progressPct));

  const metaParts = [
    `${summary.sectionsCount} ${summary.sectionsCount === 1 ? 'section' : 'sections'}`,
    `${summary.topicsCount} ${summary.topicsCount === 1 ? 'topic' : 'topics'}`,
  ];

  return (
    <button type="button" className={styles.card} onClick={onOpen}>
      <div
        className={styles.iconWrap}
        style={{ color: accent.fg, background: accent.bg }}
        aria-hidden="true"
      >
        {initial}
      </div>

      <span className={styles.name}>{summary.subject}</span>
      <span className={styles.meta}>{metaParts.join(' · ')}</span>

      <div className={styles.progressRow}>
        <div className={styles.progressTrack}>
          <div
            className={styles.progressFill}
            style={{ width: `${pct}%`, background: accent.fg }}
          />
        </div>
        <span className={styles.progressPct}>{pct}%</span>
      </div>
    </button>
  );
}
