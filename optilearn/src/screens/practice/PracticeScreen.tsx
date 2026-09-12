import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Info,
  BookMarked,
  Lightbulb,
  Timer,
  ChevronRight,
} from 'lucide-react';
import { useProfile } from '@/context/ProfileContext';
import { pastQuestionsService } from '@/services/pastQuestions/pastQuestionsService';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import styles from './PracticeScreen.module.css';

export function PracticeScreen() {
  const navigate = useNavigate();
  const { profile, loading: profileLoading } = useProfile();
  const [totalAvailable, setTotalAvailable] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const department = profile?.department ?? null;

  useEffect(() => {
    if (profileLoading) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    pastQuestionsService
      .getSummary(department)
      .then((s) => {
        if (cancelled) return;
        setTotalAvailable(s.totalAvailable);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Could not load past questions.');
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [profileLoading, department]);

  const hasAnyData = (totalAvailable ?? 0) > 0;

  return (
    <section className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Past Questions</h1>
        <p className={styles.subtitle}>
          Practice real UTME / JAMB past questions. Pick a mode to begin.
        </p>
      </div>

      <div className={styles.infoBanner}>
        <Info size={18} className={styles.infoIcon} aria-hidden="true" />
        <span>
          Filter by subject, year, section, or topic. Untimed sessions give
          instant feedback per question — timed sessions reveal everything at
          the end.
        </span>
      </div>

      {error && <div className={styles.error}>{error}</div>}

      {loading && <Skeleton height={200} />}

      {!loading && !hasAnyData && (
        <EmptyState
          icon={<BookMarked size={24} aria-hidden="true" />}
          title="No past questions yet"
          message="The past-questions bank is being prepared. Once it's populated, you'll be able to start a session here."
        />
      )}

      {!loading && hasAnyData && (
        <>
          <button
            type="button"
            className={styles.sepCard}
            onClick={() => navigate('/sep')}
          >
            <div className={styles.sepIconWrap}>
              <Timer size={24} aria-hidden="true" />
            </div>
            <div className={styles.sepText}>
              <span className={styles.sepSubtitle}>Full exam</span>
              <span className={styles.sepTitle}>SEP</span>
              <span className={styles.sepDesc}>
                4 subjects · 180 questions · 2-hour timer
              </span>
            </div>
            <ChevronRight
              size={20}
              className={styles.sepChevron}
              aria-hidden="true"
            />
          </button>

          <div className={styles.modeGrid}>
          <button
            type="button"
            className={styles.modeCard}
            onClick={() => navigate('/practice/filter?mode=untimed')}
          >
            <div
              className={`${styles.modeIconWrap} ${styles.modeIconUntimed}`}
            >
              <Lightbulb size={22} aria-hidden="true" />
            </div>
            <span className={styles.modeTitle}>Untimed</span>
            <span className={styles.modeDesc}>
              Answer one question at a time. See the correct answer and
              explanation instantly after each.
            </span>
            <span className={styles.modeChevron}>
              Start untimed
              <ChevronRight size={14} aria-hidden="true" />
            </span>
          </button>

          <button
            type="button"
            className={styles.modeCard}
            onClick={() => navigate('/practice/filter?mode=timed')}
          >
            <div className={`${styles.modeIconWrap} ${styles.modeIconTimed}`}>
              <Timer size={22} aria-hidden="true" />
            </div>
            <span className={styles.modeTitle}>Timed</span>
            <span className={styles.modeDesc}>
              Answer under a timer of your choice. Everything is reviewed
              together after you submit.
            </span>
            <span className={styles.modeChevron}>
              Start timed
              <ChevronRight size={14} aria-hidden="true" />
            </span>
          </button>
          </div>
        </>
      )}
    </section>
  );
}
