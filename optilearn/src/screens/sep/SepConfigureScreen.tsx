import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  Info,
  Lock,
  Plus,
  X,
  Users,
  ListChecks,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useProfile } from '@/context/ProfileContext';
import {
  SEP_SESSION_KEY,
  type SEPPersistedSession,
} from '@/services/exams/sepSession';
import { readSession } from '@/utils/sessionStorage';
import { Play } from 'lucide-react';
import {
  syllabusService,
  type SubjectSummary,
} from '@/services/syllabus/syllabusService';
import styles from './SepConfigureScreen.module.css';

const TOTAL_SLOTS = 4;
const COMPULSORY_SUBJECT = 'use of english';
const QUESTIONS_PER_SLOT = [60, 40, 40, 40] as const;
const TIME_LIMIT_MINUTES = 120;

export function SepConfigureScreen() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { profile, loading: profileLoading } = useProfile();

  const [subjects, setSubjects] = useState<SubjectSummary[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [slots, setSlots] = useState<string[]>(['', '', '', '']);
  const [openSlot, setOpenSlot] = useState<number>(-1);
  const [resumable, setResumable] = useState<{
    subjects: string[];
    timeLimitMinutes: number;
    endTime: number;
    answered: number;
    total: number;
  } | null>(null);

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

        const hasCompulsory = rows.some(
          (r) => r.subject.toLowerCase().trim() === COMPULSORY_SUBJECT,
        );
        if (hasCompulsory) {
          const exact = rows.find(
            (r) => r.subject.toLowerCase().trim() === COMPULSORY_SUBJECT,
          )!;
          setSlots((prev) => {
            const next = [...prev];
            next[0] = exact.subject;
            return next;
          });
        }
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

  useEffect(() => {
    const s = readSession<SEPPersistedSession>(SEP_SESSION_KEY);
    if (!s || s.endTime <= Date.now()) {
      setResumable(null);
      return;
    }
    setResumable({
      subjects: s.subjects,
      timeLimitMinutes: s.timeLimitMinutes,
      endTime: s.endTime,
      answered: Object.keys(s.answers).length,
      total: s.questions.length,
    });
  }, []);

  const hasCompulsory = useMemo(() => {
    if (!subjects) return false;
    return subjects.some(
      (r) => r.subject.toLowerCase().trim() === COMPULSORY_SUBJECT,
    );
  }, [subjects]);

  const filledCount = slots.filter(Boolean).length;
  const allFilled = filledCount === TOTAL_SLOTS;
  const canContinue = allFilled && hasCompulsory;

  const chosenSet = useMemo(() => new Set(slots.filter(Boolean)), [slots]);

  function handleSlotTap(index: number) {
    if (index === 0) return;
    if (slots[index]) {
      setSlots((prev) => {
        const next = [...prev];
        next[index] = '';
        return next;
      });
      setOpenSlot(-1);
      return;
    }
    setOpenSlot((prev) => (prev === index ? -1 : index));
  }

  function handlePick(slotIndex: number, subject: string) {
    setSlots((prev) => {
      const next = [...prev];
      next[slotIndex] = subject;
      return next;
    });
    const nextEmpty = [1, 2, 3].find((i) => i !== slotIndex && !slots[i]);
    setOpenSlot(nextEmpty ?? -1);
  }

  function handleContinue() {
    if (!canContinue) return;
    const params = new URLSearchParams();
    params.set('subjects', slots.join(','));
    params.set('time', String(TIME_LIMIT_MINUTES));
    navigate(`/sep/instructions?${params.toString()}`);
  }

  function handleResume() {
    if (!resumable) return;
    const p = new URLSearchParams();
    p.set('subjects', resumable.subjects.join(','));
    p.set('time', String(resumable.timeLimitMinutes));
    navigate(`/sep/exam?${p.toString()}`);
  }

  function formatRemaining(ms: number): string {
    const total = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    if (h > 0) return `${h}h ${m}m left`;
    return `${m}m left`;
  }

  const totalQuestions = slots.reduce(
    (sum, s, i) => (s ? sum + QUESTIONS_PER_SLOT[i] : sum),
    0,
  );

  return (
    <section className={styles.page}>
      <button
        type="button"
        className={styles.backButton}
        onClick={() => navigate('/home')}
      >
        <ArrowLeft size={16} aria-hidden="true" />
        Home
      </button>

      <div className={styles.header}>
        <h1 className={styles.title}>Simulated Exam Practice</h1>
        <p className={styles.subtitle}>
          A full UTME-style exam. Pick four subjects — Use of English is
          required — and we'll run a two-hour timed session.
        </p>
      </div>

      {resumable && (
        <button
          type="button"
          className={styles.resumeBanner}
          onClick={handleResume}
        >
          <div className={styles.resumeIcon}>
            <Play size={18} aria-hidden="true" />
          </div>
          <div className={styles.resumeText}>
            <span className={styles.resumeTitle}>Resume your exam</span>
            <span className={styles.resumeMeta}>
              {resumable.subjects.join(' · ')} · {resumable.answered}/
              {resumable.total} answered ·{' '}
              {formatRemaining(resumable.endTime - Date.now())}
            </span>
          </div>
        </button>
      )}

      <div className={styles.infoBanner}>
        <Info size={18} className={styles.infoIcon} aria-hidden="true" />
        <span>
          SEP mirrors the real UTME structure: 4 subjects, 180 questions, 120
          minutes. Your answers save automatically as you go.
        </span>
      </div>

      {error && <div className={styles.error}>{error}</div>}

      {loading && <div className={styles.skeleton} aria-hidden="true" />}

      {!loading && !hasCompulsory && subjects && subjects.length > 0 && (
        <div className={styles.error}>
          "Use of English" is not present in your department's subjects, so SEP
          can't be configured. Contact support.
        </div>
      )}

      {!loading && subjects && subjects.length === 0 && (
        <div className={styles.empty}>
          <span className={styles.emptyTitle}>No subjects available</span>
          <span className={styles.emptyText}>
            No subjects match your department in the curriculum yet.
          </span>
        </div>
      )}

      {!loading && subjects && subjects.length > 0 && (
        <>
          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <span className={styles.sectionTitle}>
                <Users size={14} className={styles.sectionIcon} aria-hidden="true" />
                Your subjects
              </span>
              <span className={styles.slotCounter}>
                {filledCount} / {TOTAL_SLOTS}
              </span>
            </div>

            <div className={styles.slotList}>
              {slots.map((chosen, index) => {
                const isLocked = index === 0;
                const isOpen = openSlot === index;

                return (
                  <div key={index}>
                    <button
                      type="button"
                      className={`${styles.slot} ${
                        isLocked
                          ? styles.slotLocked
                          : chosen
                            ? styles.slotFilled
                            : ''
                      } ${isOpen ? styles.slotActive : ''}`}
                      onClick={() => handleSlotTap(index)}
                      disabled={isLocked}
                    >
                      <span className={styles.slotIndex}>
                        {isLocked ? <Lock size={11} /> : index + 1}
                      </span>
                      <span
                        className={`${styles.slotText} ${
                          chosen ? '' : styles.slotPlaceholder
                        }`}
                      >
                        {chosen || 'Choose a subject'}
                      </span>
                      {isLocked ? (
                        <span className={styles.slotAction}>Required</span>
                      ) : chosen ? (
                        <span
                          className={styles.slotClear}
                          role="button"
                          tabIndex={0}
                          aria-label={`Remove ${chosen}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSlots((prev) => {
                              const next = [...prev];
                              next[index] = '';
                              return next;
                            });
                            setOpenSlot(-1);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              e.stopPropagation();
                              setSlots((prev) => {
                                const next = [...prev];
                                next[index] = '';
                                return next;
                              });
                              setOpenSlot(-1);
                            }
                          }}
                        >
                          <X size={14} />
                        </span>
                      ) : (
                        <span className={styles.slotAction}>
                          <Plus size={14} />
                        </span>
                      )}
                    </button>

                    {isOpen && subjects && (
                      <div className={styles.pickerWrap}>
                        <div className={styles.chipRow}>
                          {subjects
                            .filter(
                              (s) =>
                                s.subject.toLowerCase().trim() !==
                                COMPULSORY_SUBJECT,
                            )
                            .map((s) => {
                              const isChosenElsewhere = chosenSet.has(s.subject);
                              return (
                                <button
                                  key={s.subject}
                                  type="button"
                                  className={`${styles.chip} ${
                                    isChosenElsewhere ? styles.chipDisabled : ''
                                  }`}
                                  disabled={isChosenElsewhere}
                                  onClick={() => handlePick(index, s.subject)}
                                >
                                  {s.subject}
                                </button>
                              );
                            })}
                        </div>
                        <div className={styles.pickerHint}>
                          Use of English is already locked in slot 1.
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className={styles.section}>
            <div className={styles.sectionHeader}>
              <span className={styles.sectionTitle}>
                <ListChecks
                  size={14}
                  className={styles.sectionIcon}
                  aria-hidden="true"
                />
                Exam setup
              </span>
            </div>
            <div className={styles.fixedRow}>
              <span className={styles.fixedRowLabel}>Questions</span>
              <span className={styles.fixedRowValue}>
                {totalQuestions} / 180
              </span>
            </div>
            <div className={styles.fixedRow}>
              <span className={styles.fixedRowLabel}>Duration</span>
              <span className={styles.fixedRowValue}>120 minutes</span>
            </div>
            <div className={styles.fixedRow}>
              <span className={styles.fixedRowLabel}>
                Distribution (per subject)
              </span>
              <span className={styles.fixedRowValue}>60 + 40 + 40 + 40</span>
            </div>
          </div>

          <div className={styles.summaryBar}>
            <div className={styles.summaryText}>
              <span className={styles.summaryValue}>
                {allFilled
                  ? slots.join(' · ')
                  : `Pick ${TOTAL_SLOTS - filledCount} more subject${TOTAL_SLOTS - filledCount === 1 ? '' : 's'}`}
              </span>
              <span className={styles.summaryMeta}>
                {totalQuestions} questions · 120 minutes
              </span>
            </div>
            <button
              type="button"
              className={styles.startButton}
              disabled={!canContinue}
              onClick={handleContinue}
            >
              Continue
              <ArrowRight size={16} aria-hidden="true" />
            </button>
          </div>
        </>
      )}
    </section>
  );
}
