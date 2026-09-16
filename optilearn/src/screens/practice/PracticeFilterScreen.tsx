import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, Lightbulb, Timer } from 'lucide-react';
import { useProfile } from '@/context/ProfileContext';
import {
  pastQuestionsService,
  type PastQuestionsSummary,
} from '@/services/pastQuestions/pastQuestionsService';
import { BackButton } from '@/components/ui/BackButton';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import styles from './PracticeFilterScreen.module.css';

type Mode = 'untimed' | 'timed';

const TIMER_OPTIONS = [10, 15, 20, 30, 45, 60] as const;
const DEFAULT_TIMER_MINUTES = 20;

function parseMode(raw: string | null): Mode | null {
  if (raw === 'untimed' || raw === 'timed') return raw;
  return null;
}

export function PracticeFilterScreen() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const mode = parseMode(params.get('mode'));
  const { profile, loading: profileLoading } = useProfile();

  useEffect(() => {
    if (!mode) navigate('/practice', { replace: true });
  }, [mode, navigate]);

  const [summary, setSummary] = useState<PastQuestionsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  const [subject, setSubject] = useState<string | null>(null);
  const [year, setYear] = useState<number | null>(null);
  const [section, setSection] = useState<string | null>(null);
  const [topic, setTopic] = useState<string | null>(null);
  const [timerMinutes, setTimerMinutes] = useState<number>(DEFAULT_TIMER_MINUTES);

  const [filteredCount, setFilteredCount] = useState<number | null>(null);
  const [counting, setCounting] = useState(false);

  const department = profile?.department ?? null;

  useEffect(() => {
    if (!mode || profileLoading) return;
    let cancelled = false;

    setLoading(true);
    setError(null);

    pastQuestionsService
      .getSummary(department)
      .then((s) => {
        if (cancelled) return;
        setSummary(s);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Could not load filters.');
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [mode, profileLoading, department, retryKey]);

  useEffect(() => {
    if (!summary) return;
    if (!subject && !year && !section && !topic) {
      setFilteredCount(summary.totalAvailable);
      return;
    }
    let cancelled = false;
    setCounting(true);
    pastQuestionsService
      .countQuestions({ subject, year, section, topic })
      .then((n) => {
        if (cancelled) return;
        setFilteredCount(n);
      })
      .catch(() => {
        if (cancelled) return;
        setFilteredCount(null);
      })
      .finally(() => {
        if (cancelled) return;
        setCounting(false);
      });
    return () => {
      cancelled = true;
    };
  }, [summary, subject, year, section, topic]);

  const visibleTopics = useMemo(() => {
    if (!summary) return [];
    const pairs = summary.topicPairs;
    const filtered = section
      ? pairs.filter((p) => p.section === section)
      : pairs;
    const set = new Set(filtered.map((p) => p.topic));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [summary, section]);

  useEffect(() => {
    if (topic && !visibleTopics.includes(topic)) setTopic(null);
  }, [topic, visibleTopics]);

  const hasSections = (summary?.sections.length ?? 0) > 0;
  const hasTopics = visibleTopics.length > 0;
  const canStart = (filteredCount ?? 0) > 0 && !counting;

  function handleStart() {
    if (!mode || !canStart) return;
    const p = new URLSearchParams();
    p.set('mode', mode);
    if (subject) p.set('subject', subject);
    if (year) p.set('year', String(year));
    if (section) p.set('section', section);
    if (topic) p.set('topic', topic);
    if (mode === 'timed') p.set('time', String(timerMinutes));
    navigate(`/practice/session?${p.toString()}`);
  }

  if (!mode) return null;

  return (
    <section className={styles.page}>
      <BackButton label="Practice" onClick={() => navigate('/practice')} />

      <div className={styles.header}>
        <span
          className={`${styles.modeBadge} ${
            mode === 'untimed' ? styles.modeBadgeUntimed : styles.modeBadgeTimed
          }`}
        >
          {mode === 'untimed' ? (
            <Lightbulb size={12} aria-hidden="true" />
          ) : (
            <Timer size={12} aria-hidden="true" />
          )}
          {mode === 'untimed' ? 'Untimed' : 'Timed'}
        </span>
        <h1 className={styles.title}>Choose your questions</h1>
        <p className={styles.subtitle}>
          Filter by subject, year, section, or topic. Leave a filter empty to
          include everything in it.
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
      {loading && <Skeleton height={260} />}

      {!loading && summary && (
        <>
          <div className={styles.filterCard}>
            <div className={styles.filterGroup}>
              <div className={styles.filterHeader}>
                <span className={styles.filterLabel}>Subject</span>
                {subject && (
                  <button
                    type="button"
                    className={styles.clearButton}
                    onClick={() => setSubject(null)}
                  >
                    Clear
                  </button>
                )}
              </div>
              {summary.subjects.length > 0 ? (
                <div className={styles.chipRow}>
                  {summary.subjects.map((s) => (
                    <button
                      key={s}
                      type="button"
                      className={`${styles.chip} ${subject === s ? styles.chipActive : ''}`}
                      onClick={() =>
                        setSubject((prev) => (prev === s ? null : s))
                      }
                    >
                      {s}
                    </button>
                  ))}
                </div>
              ) : (
                <p className={styles.filterHint}>
                  No subjects available in your department yet. More will
                  appear as the question bank is populated.
                </p>
              )}
            </div>

            {summary.years.length > 0 && (
              <div className={styles.filterGroup}>
                <div className={styles.filterHeader}>
                  <span className={styles.filterLabel}>Year</span>
                  {year && (
                    <button
                      type="button"
                      className={styles.clearButton}
                      onClick={() => setYear(null)}
                    >
                      Clear
                    </button>
                  )}
                </div>
                <div className={styles.chipRow}>
                  {summary.years.map((y) => (
                    <button
                      key={y}
                      type="button"
                      className={`${styles.chip} ${year === y ? styles.chipActive : ''}`}
                      onClick={() =>
                        setYear((prev) => (prev === y ? null : y))
                      }
                    >
                      {y}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {hasSections && (
              <div className={styles.filterGroup}>
                <div className={styles.filterHeader}>
                  <span className={styles.filterLabel}>Section</span>
                  {section && (
                    <button
                      type="button"
                      className={styles.clearButton}
                      onClick={() => setSection(null)}
                    >
                      Clear
                    </button>
                  )}
                </div>
                <div className={styles.chipRow}>
                  {summary.sections.map((s) => (
                    <button
                      key={s}
                      type="button"
                      className={`${styles.chip} ${section === s ? styles.chipActive : ''}`}
                      onClick={() =>
                        setSection((prev) => (prev === s ? null : s))
                      }
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {hasTopics && (
              <div className={styles.filterGroup}>
                <div className={styles.filterHeader}>
                  <span className={styles.filterLabel}>Topic</span>
                  {topic && (
                    <button
                      type="button"
                      className={styles.clearButton}
                      onClick={() => setTopic(null)}
                    >
                      Clear
                    </button>
                  )}
                </div>
                <div className={styles.chipRow}>
                  {visibleTopics.map((t) => (
                    <button
                      key={t}
                      type="button"
                      className={`${styles.chip} ${topic === t ? styles.chipActive : ''}`}
                      onClick={() =>
                        setTopic((prev) => (prev === t ? null : t))
                      }
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {!hasSections && !hasTopics && (
              <p className={styles.filterHint}>
                Section and topic filters become available once past questions
                are linked to the syllabus.
              </p>
            )}

            {mode === 'timed' && (
              <div className={styles.filterGroup}>
                <div className={styles.filterHeader}>
                  <span className={styles.filterLabel}>Timer</span>
                </div>
                <div className={styles.chipRow}>
                  {TIMER_OPTIONS.map((m) => (
                    <button
                      key={m}
                      type="button"
                      className={`${styles.chip} ${timerMinutes === m ? styles.chipActive : ''}`}
                      onClick={() => setTimerMinutes(m)}
                    >
                      {m} min
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className={styles.summaryBar}>
            <div className={styles.summaryText}>
              <span
                className={`${styles.summaryCount} ${counting ? styles.summaryCountMuted : ''}`}
              >
                {counting
                  ? 'Counting…'
                  : filteredCount === 0
                    ? 'No questions match these filters'
                    : `${filteredCount} ${filteredCount === 1 ? 'question' : 'questions'} available`}
              </span>
              {mode === 'timed' && (
                <span className={styles.summaryMeta}>
                  Timer: {timerMinutes} minutes
                </span>
              )}
            </div>
            <button
              type="button"
              className={styles.startButton}
              disabled={!canStart}
              onClick={handleStart}
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
