import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowRight,
  Check,
  Lightbulb,
  Sparkles,
  BookOpen,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import {
  questionService,
  type MCQQuestion,
} from '@/services/questions/questionService';
import { progressService } from '@/services/progress/progressService';
import { streakService } from '@/services/streaks/streakService';
import {
  syllabusService,
  type SyllabusRow,
} from '@/services/syllabus/syllabusService';
import { BackButton } from '@/components/ui/BackButton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import styles from './StudyReaderScreen.module.css';

const LETTERS = ['A', 'B', 'C', 'D'] as const;

export function StudyReaderScreen() {
  const { syllabusId: syllabusIdParam } = useParams<{ syllabusId: string }>();
  const syllabusId = Number(syllabusIdParam);
  const navigate = useNavigate();
  const { user } = useAuth();

  const [syllabus, setSyllabus] = useState<SyllabusRow | null>(null);
  const [questions, setQuestions] = useState<MCQQuestion[] | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [explanationOpen, setExplanationOpen] = useState(false);
  const [showEnd, setShowEnd] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const hasRecordedInitial = useRef(false);

  useEffect(() => {
    setExplanationOpen(false);
    window.scrollTo(0, 0);
  }, [currentIndex]);

  useEffect(() => {
    if (!user || !Number.isFinite(syllabusId)) return;
    let cancelled = false;

    setLoading(true);
    setError(null);
    hasRecordedInitial.current = false;

    Promise.all([
      syllabusService.getById(syllabusId),
      questionService.getMCQsForTopic(syllabusId),
      progressService.getTopicProgress(user.id, syllabusId),
    ])
      .then(([syl, qs, prog]) => {
        if (cancelled) return;
        setSyllabus(syl);

        if (!syl || qs.length === 0) {
          setQuestions(qs);
          return;
        }

        const pct = prog?.progress ?? 0;
        const resumeIndex = Math.min(
          Math.max(0, Math.round((pct / 100) * qs.length)),
          qs.length - 1,
        );

        setQuestions(qs);
        setCurrentIndex(resumeIndex);

        if (!prog) {
          hasRecordedInitial.current = true;
          progressService
            .recordTopicProgress(user.id, syllabusId, resumeIndex + 1, qs.length)
            .catch((err) => {
              if (import.meta.env.DEV) {
                console.warn('[STUDY] Initial progress write failed:', err);
              }
            });
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Could not load topic.');
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user, syllabusId]);

  function goNext() {
    if (!user || !questions) return;
    const isLast = currentIndex >= questions.length - 1;

    if (isLast) {
      setShowEnd(true);
      progressService
        .recordTopicProgress(
          user.id,
          syllabusId,
          questions.length,
          questions.length,
        )
        .catch((err) => {
          if (import.meta.env.DEV) {
            console.warn('[STUDY] Completion write failed:', err);
          }
        });
      streakService.bumpStreak().catch((err) => {
        if (import.meta.env.DEV) {
          console.warn('[STUDY] Failed to bump streak:', err);
        }
      });
      return;
    }

    const nextIndex = currentIndex + 1;
    setCurrentIndex(nextIndex);
    progressService
      .recordTopicProgress(user.id, syllabusId, nextIndex + 1, questions.length)
      .catch((err) => {
        if (import.meta.env.DEV) {
          console.warn('[STUDY] Progress write failed:', err);
        }
      });
  }

  function goPrev() {
    if (currentIndex <= 0) return;
    setCurrentIndex(currentIndex - 1);
  }

  function backToTopicList() {
    if (syllabus) {
      navigate(
        `/study/section/${encodeURIComponent(syllabus.subject)}/${encodeURIComponent(syllabus.section)}`,
      );
    } else {
      navigate('/study');
    }
  }

  function readAgain() {
    setShowEnd(false);
    setCurrentIndex(0);
  }

  if (loading) {
    return (
      <section className={styles.page}>
        <Skeleton height={300} />
      </section>
    );
  }

  if (error) {
    return (
      <section className={styles.page}>
        <div className={styles.error}>{error}</div>
      </section>
    );
  }

  if (!syllabus || !questions || questions.length === 0) {
    return (
      <section className={styles.page}>
        <BackButton label="Back to Study" onClick={() => navigate('/study')} />
        <EmptyState
          icon={<BookOpen size={24} aria-hidden="true" />}
          title="No questions yet"
          message="This topic has no practice questions in the bank yet."
        />
      </section>
    );
  }

  if (showEnd) {
    return (
      <section className={styles.page}>
        <div className={styles.endCard}>
          <div className={styles.endIcon}>
            <Check size={28} strokeWidth={3} />
          </div>
          <h2 className={styles.endTitle}>Topic complete</h2>
          <p className={styles.endText}>
            You've read through every question in "{syllabus.topic}".
          </p>
          <div className={styles.endActions}>
            <button
              type="button"
              className={styles.prevButton}
              onClick={readAgain}
            >
              Read again
            </button>
            <button
              type="button"
              className={styles.nextButton}
              onClick={backToTopicList}
            >
              Back to topics
            </button>
          </div>
        </div>
      </section>
    );
  }

  const current = questions[currentIndex];
  const isFirst = currentIndex === 0;
  const isLast = currentIndex >= questions.length - 1;
  const displayPct = Math.round(((currentIndex + 1) / questions.length) * 100);

  return (
    <section className={styles.page}>
      <div className={styles.topBar}>
        <BackButton label={syllabus.section} onClick={backToTopicList} />
        <span className={styles.counter}>
          {currentIndex + 1} / {questions.length}
        </span>
      </div>

      <div className={styles.progressTrack} aria-hidden="true">
        <div
          className={styles.progressFill}
          style={{ width: `${displayPct}%` }}
        />
      </div>

      <article className={styles.questionCard}>
        <div className={styles.questionHeader}>
          <span className={styles.qBadge}>Q{currentIndex + 1}</span>
        </div>
        <p className={styles.questionText}>{current.question}</p>

        <div className={styles.options}>
          {current.options.map((opt, i) => {
            const letter = LETTERS[i];
            const isCorrect = letter === current.answer;
            return (
              <div
                key={letter}
                className={`${styles.option} ${isCorrect ? styles.optionCorrect : ''}`}
              >
                <span className={styles.optionLetter}>{letter}</span>
                <span className={styles.optionText}>{opt}</span>
              </div>
            );
          })}
        </div>
      </article>

      {!explanationOpen && (
        <button
          type="button"
          className={styles.revealButton}
          onClick={() => setExplanationOpen(true)}
        >
          <Lightbulb size={16} aria-hidden="true" />
          Reveal explanation
        </button>
      )}

      {explanationOpen && (
        <article className={styles.explanationCard} key={currentIndex}>
          <div className={styles.explanationHeader}>
            <span className={styles.explanationTitle}>Explanation</span>
          </div>
          {current.explanation ? (
            <p className={styles.explanationBody}>{current.explanation}</p>
          ) : (
            <p className={styles.explanationEmpty}>
              No explanation is available for this question yet.
            </p>
          )}
          <div className={styles.aiRow}>
            <button
              type="button"
              className={styles.aiButton}
              disabled
              aria-disabled="true"
              title="AI assistance is coming soon"
            >
              <Sparkles size={14} aria-hidden="true" />
              Ask AI
            </button>
            <span className={styles.aiHint}>Coming soon</span>
          </div>
        </article>
      )}

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.prevButton}
          onClick={goPrev}
          disabled={isFirst}
          aria-disabled={isFirst}
        >
          Previous
        </button>
        <button
          type="button"
          className={styles.nextButton}
          onClick={goNext}
        >
          {isLast ? 'Finish' : 'Next'}
          <ArrowRight size={16} aria-hidden="true" />
        </button>
      </div>
    </section>
  );
}
