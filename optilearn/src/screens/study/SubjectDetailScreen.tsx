import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { BookOpen } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import {
  syllabusService,
  type SectionSummary,
} from '@/services/syllabus/syllabusService';
import { subjectColor } from '@/utils/subjectColor';
import { BackButton } from '@/components/ui/BackButton';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import styles from './SubjectDetailScreen.module.css';

export function SubjectDetailScreen() {
  const { subject: subjectParam } = useParams<{ subject: string }>();
  const subject = subjectParam ?? '';
  const navigate = useNavigate();
  const { user } = useAuth();

  const [sections, setSections] = useState<SectionSummary[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (!user || !subject) return;
    let cancelled = false;

    setLoading(true);
    setError(null);

    syllabusService
      .getSectionSummaries(user.id, subject)
      .then((rows) => {
        if (cancelled) return;
        setSections(rows);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Could not load sections.');
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user, subject, retryKey]);

  const accent = subjectColor(subject);
  const totalTopics =
    sections?.reduce((sum, s) => sum + s.topicsCount, 0) ?? 0;

  return (
    <section className={styles.page}>
      <BackButton label="All subjects" onClick={() => navigate('/study')} />

      <div className={styles.header}>
        <h1 className={styles.title}>{subject}</h1>
        {!loading && sections && sections.length > 0 && (
          <p className={styles.subtitle}>
            {sections.length} {sections.length === 1 ? 'section' : 'sections'}
            {' · '}
            {totalTopics} {totalTopics === 1 ? 'topic' : 'topics'}
          </p>
        )}
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

      {loading && (
        <div className={styles.list}>
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} height={78} />
          ))}
        </div>
      )}

      {!loading && sections && sections.length === 0 && (
        <EmptyState
          icon={<BookOpen size={24} aria-hidden="true" />}
          title="No sections found"
          message="This subject has no sections in the curriculum yet."
        />
      )}

      {!loading && sections && sections.length > 0 && (
        <div className={styles.list}>
          {sections.map((s) => (
            <button
              key={s.section}
              type="button"
              className={styles.card}
              onClick={() =>
                navigate(
                  `/study/section/${encodeURIComponent(subject)}/${encodeURIComponent(s.section)}`,
                )
              }
            >
              <div className={styles.cardHeader}>
                <span className={styles.name}>{s.section}</span>
                <span className={styles.count}>
                  {s.topicsCount} {s.topicsCount === 1 ? 'topic' : 'topics'}
                </span>
              </div>
              <div className={styles.progressRow}>
                <div className={styles.progressTrack}>
                  <div
                    className={styles.progressFill}
                    style={{ width: `${s.progressPct}%`, background: accent.fg }}
                  />
                </div>
                <span className={styles.progressPct}>{s.progressPct}%</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
