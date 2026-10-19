import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronRight, Check, Circle, Minus, ListChecks } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import {
  syllabusService,
  type ModuleSummary,
  type TopicStatus,
} from '@/services/syllabus/syllabusService';
import { subjectColor } from '@/utils/subjectColor';
import { BackButton } from '@/components/ui/BackButton';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { StudyNoteLink } from '@/components/notes/StudyNoteLink';
import { GeneratedQuizLink } from '@/components/quiz/GeneratedQuizLink';
import styles from './SectionDetailScreen.module.css';

export function SubtopicDetailScreen() {
  const {
    subject: courseParam,
    section: topicParam,
    subtopic: subtopicParam,
  } = useParams<{ subject: string; section: string; subtopic: string }>();
  const course = courseParam ?? '';
  const topic = topicParam ?? '';
  const subtopic = subtopicParam ?? '';
  const navigate = useNavigate();
  const { user } = useAuth();

  const [modules, setModules] = useState<ModuleSummary[] | null>(null);
  const [loadedRequest, setLoadedRequest] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const requestKey = `${course}\0${topic}\0${subtopic}\0${retryKey}`;
  const loading = loadedRequest !== requestKey;
  const currentError = loading ? null : error;

  useEffect(() => {
    if (!user || !course || !topic || !subtopic) return;
    let cancelled = false;

    syllabusService
      .getModuleSummaries(user.id, course, topic, subtopic)
      .then((rows) => {
        if (cancelled) return;
        setModules(rows);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        console.error('[STUDY] Modules load failed:', err);
        setError(
          "We couldn't load modules. Check your connection and try again.",
        );
      })
      .finally(() => {
        if (!cancelled) setLoadedRequest(requestKey);
      });

    return () => {
      cancelled = true;
    };
  }, [user, course, topic, subtopic, retryKey, requestKey]);

  const accent = subjectColor(course);

  return (
    <section className={styles.page}>
      <BackButton
        label={topic}
        onClick={() =>
          navigate(
            `/study/section/${encodeURIComponent(course)}/${encodeURIComponent(topic)}`,
          )
        }
      />

      <div className={styles.header}>
        <span className={styles.crumb} style={{ color: accent.fg }}>
          {course} · {topic}
        </span>
        <h1 className={styles.title}>{subtopic}</h1>
        {!loading && modules && (
          <p className={styles.subtitle}>
            {modules.length} {modules.length === 1 ? 'module' : 'modules'}
          </p>
        )}
      </div>

      {!loading && modules && modules.length > 0 && modules[0].subtopicId && (
        <StudyNoteLink
          subtopicId={modules[0].subtopicId}
          label="Study note for this subtopic"
        />
      )}

      {!loading && modules && modules.length > 0 && modules[0].subtopicId && (
        <GeneratedQuizLink subtopicId={modules[0].subtopicId} />
      )}

      {currentError && (
        <>
          <div className={styles.error}>{currentError}</div>
          <Button
            variant="secondary"
            fullWidth
            onClick={() => setRetryKey((key) => key + 1)}
          >
            Try again
          </Button>
        </>
      )}

      {loading && (
        <div className={styles.list}>
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} height={62} />
          ))}
        </div>
      )}

      {!loading && modules && modules.length === 0 && (
        <EmptyState
          icon={<ListChecks size={24} aria-hidden="true" />}
          title="No modules found"
          message="This subtopic has no modules in the curriculum yet."
        />
      )}

      {!loading && modules && modules.length > 0 && (
        <div className={styles.list}>
          {modules.map((module) => (
            <button
              key={module.syllabusId}
              type="button"
              className={styles.topicRow}
              onClick={() => navigate(`/study/topic/${module.syllabusId}`)}
            >
              <StatusIcon status={module.status} />
              <div className={styles.topicText}>
                <span className={styles.topicName}>{module.module}</span>
                <span className={styles.topicMeta}>
                  {statusLabel(module.status, module.progressPct)}
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

function StatusIcon({ status }: { status: TopicStatus }) {
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
