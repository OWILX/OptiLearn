import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronRight, ListChecks } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import {
  syllabusService,
  type SubtopicSummary,
} from '@/services/syllabus/syllabusService';
import { subjectColor } from '@/utils/subjectColor';
import { BackButton } from '@/components/ui/BackButton';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import styles from './SectionDetailScreen.module.css';

export function SectionDetailScreen() {
  const {
    subject: subjectParam,
    section: sectionParam,
  } = useParams<{ subject: string; section: string }>();
  const subject = subjectParam ?? '';
  const section = sectionParam ?? '';
  const navigate = useNavigate();
  const { user } = useAuth();

  const [subtopics, setSubtopics] = useState<SubtopicSummary[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (!user || !subject || !section) return;
    let cancelled = false;

    setLoading(true);
    setError(null);

    syllabusService
      .getSubtopicSummaries(user.id, subject, section)
      .then((rows) => {
        if (cancelled) return;
        setSubtopics(rows);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        console.error('[STUDY] Subtopics load failed:', err);
        setError(
          "We couldn't load subtopics. Check your connection and try again.",
        );
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user, subject, section, retryKey]);

  const accent = subjectColor(subject);

  return (
    <section className={styles.page}>
      <BackButton
        label={subject}
        onClick={() =>
          navigate(`/study/subject/${encodeURIComponent(subject)}`)
        }
      />

      <div className={styles.header}>
        <span className={styles.crumb} style={{ color: accent.fg }}>
          {subject}
        </span>
        <h1 className={styles.title}>{section}</h1>
        {!loading && subtopics && subtopics.length > 0 && (
          <p className={styles.subtitle}>
            {subtopics.length}{' '}
            {subtopics.length === 1 ? 'subtopic' : 'subtopics'}
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
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} height={62} />
          ))}
        </div>
      )}

      {!loading && subtopics && subtopics.length === 0 && (
        <EmptyState
          icon={<ListChecks size={24} aria-hidden="true" />}
          title="No subtopics found"
          message="This topic has no subtopics in the curriculum yet."
        />
      )}

      {!loading && subtopics && subtopics.length > 0 && (
        <div className={styles.list}>
          {subtopics.map((subtopic) => (
            <button
              key={subtopic.subtopic}
              type="button"
              className={styles.topicRow}
              onClick={() =>
                navigate(
                  `/study/subtopic/${encodeURIComponent(subject)}/${encodeURIComponent(section)}/${encodeURIComponent(subtopic.subtopic)}`,
                )
              }
            >
              <div className={styles.topicText}>
                <span className={styles.topicName}>{subtopic.subtopic}</span>
                <span className={styles.topicMeta}>
                  {subtopic.modulesCount}{' '}
                  {subtopic.modulesCount === 1 ? 'module' : 'modules'}
                  {' · '}
                  {subtopic.progressPct}% complete
                </span>
              </div>
              <ChevronRight
                size={18}
                className={styles.chevron}
                aria-hidden="true"
              />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
