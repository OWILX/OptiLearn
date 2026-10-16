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
        console.error('[STUDY] Sections load failed:', err);
        setError(
          "We couldn't load sections. Check your connection and try again.",
        );
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
  const totalSubtopics =
    sections?.reduce((sum, section) => sum + section.subtopicsCount, 0) ?? 0;
  const totalModules =
    sections?.reduce((sum, section) => sum + section.modulesCount, 0) ?? 0;

  return (
    <section className={styles.page}>
      <BackButton label="All courses" onClick={() => navigate('/study')} />

      <div className={styles.header}>
        <h1 className={styles.title}>{subject}</h1>
        {!loading && sections && sections.length > 0 && (
          <p className={styles.subtitle}>
            {sections.length} {sections.length === 1 ? 'topic' : 'topics'}
            {' · '}
            {totalSubtopics} {totalSubtopics === 1 ? 'subtopic' : 'subtopics'}
            {' · '}
            {totalModules} {totalModules === 1 ? 'module' : 'modules'}
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
          title="No topics found"
          message="This course has no topics in the curriculum yet."
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
                  {s.subtopicsCount}{' '}
                  {s.subtopicsCount === 1 ? 'subtopic' : 'subtopics'}
                  {' · '}
                  {s.modulesCount} {s.modulesCount === 1 ? 'module' : 'modules'}
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
