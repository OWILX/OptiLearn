import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronRight, Check, Circle, Minus, ListChecks } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import {
  syllabusService,
  type TopicSummary,
  type TopicStatus,
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

  const [topics, setTopics] = useState<TopicSummary[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (!user || !subject || !section) return;
    let cancelled = false;

    setLoading(true);
    setError(null);

    syllabusService
      .getTopicSummaries(user.id, subject, section)
      .then((rows) => {
        if (cancelled) return;
        setTopics(rows);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Could not load topics.');
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
        {!loading && topics && topics.length > 0 && (
          <p className={styles.subtitle}>
            {topics.length} {topics.length === 1 ? 'topic' : 'topics'}
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

      {!loading && topics && topics.length === 0 && (
        <EmptyState
          icon={<ListChecks size={24} aria-hidden="true" />}
          title="No topics found"
          message="This section has no topics in the curriculum yet."
        />
      )}

      {!loading && topics && topics.length > 0 && (
        <div className={styles.list}>
          {topics.map((t) => (
            <button
              key={t.syllabusId}
              type="button"
              className={styles.topicRow}
              onClick={() => navigate(`/study/topic/${t.syllabusId}`)}
            >
              <StatusIcon status={t.status} />
              <div className={styles.topicText}>
                <span className={styles.topicName}>{t.topic}</span>
                <span className={styles.topicMeta}>
                  {statusLabel(t.status, t.progressPct)}
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

function statusLabel(status: TopicStatus, pct: number): string {
  if (status === 'completed') return 'Completed';
  if (status === 'in_progress') return `In progress · ${pct}%`;
  return 'Not started';
}

interface StatusIconProps {
  status: TopicStatus;
}

function StatusIcon({ status }: StatusIconProps) {
  if (status === 'completed') {
    return (
      <span
        className={`${styles.statusIcon} ${styles.statusIconCompleted}`}
        aria-hidden="true"
      >
        <Check size={14} strokeWidth={3} />
      </span>
    );
  }
  if (status === 'in_progress') {
    return (
      <span
        className={`${styles.statusIcon} ${styles.statusIconInProgress}`}
        aria-hidden="true"
      >
        <Minus size={14} strokeWidth={3} />
      </span>
    );
  }
  return (
    <span className={styles.statusIcon} aria-hidden="true">
      <Circle size={10} />
    </span>
  );
}
