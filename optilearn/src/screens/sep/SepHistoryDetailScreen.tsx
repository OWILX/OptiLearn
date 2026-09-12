import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, Check, ChevronDown } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import {
  examService,
  type AttemptDetail,
  type AttemptReviewQuestion,
} from '@/services/exams/examService';
import { BackButton } from '@/components/ui/BackButton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import styles from './SepHistoryDetailScreen.module.css';

const LETTERS = ['A', 'B', 'C', 'D'] as const;

interface SubjectGroup {
  subject: string;
  rows: AttemptReviewQuestion[];
  correct: number;
  total: number;
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function SepHistoryDetailScreen() {
  const { attemptId: attemptIdParam } = useParams<{ attemptId: string }>();
  const attemptId = Number(attemptIdParam);
  const navigate = useNavigate();
  const { user } = useAuth();

  const [detail, setDetail] = useState<AttemptDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openSubjects, setOpenSubjects] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user || !Number.isFinite(attemptId)) return;
    let cancelled = false;

    setLoading(true);
    setError(null);

    examService
      .getAttemptDetail(user.id, attemptId)
      .then((d) => {
        if (cancelled) return;
        setDetail(d);
        // Auto-open the first subject so users see content immediately.
        if (d && d.questions.length > 0) {
          setOpenSubjects(new Set([d.questions[0].subject]));
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Could not load attempt.');
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user, attemptId]);

  const groups: SubjectGroup[] = useMemo(() => {
    if (!detail) return [];
    const map = new Map<string, SubjectGroup>();
    for (const q of detail.questions) {
      let g = map.get(q.subject);
      if (!g) {
        g = { subject: q.subject, rows: [], correct: 0, total: 0 };
        map.set(q.subject, g);
      }
      g.rows.push(q);
      g.total += 1;
      if (q.verdict === 'correct') g.correct += 1;
    }
    return Array.from(map.values());
  }, [detail]);

  function toggleSubject(s: string) {
    setOpenSubjects((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  }

  if (loading) {
    return (
      <section className={styles.page}>
        <Skeleton height={280} />
      </section>
    );
  }

  if (error) {
    return (
      <section className={styles.page}>
        <BackButton label="History" onClick={() => navigate('/sep/history')} />
        <div className={styles.error}>{error}</div>
      </section>
    );
  }

  if (!detail) {
    return (
      <section className={styles.page}>
        <BackButton label="History" onClick={() => navigate('/sep/history')} />
        <EmptyState
          icon={<AlertTriangle size={24} aria-hidden="true" />}
          title="Attempt not found"
          message="This attempt doesn't exist or isn't available."
        />
      </section>
    );
  }

  const { attempt, questions } = detail;
  const total = questions.length;
  const correct = questions.filter((q) => q.verdict === 'correct').length;
  const wrong = questions.filter((q) => q.verdict === 'wrong').length;
  const skipped = questions.filter((q) => q.verdict === 'skipped').length;
  const pct = total > 0 ? Math.round((correct / total) * 100) : 0;

  const iconClass =
    pct >= 70
      ? styles.iconGood
      : pct >= 40
        ? styles.iconMid
        : styles.iconBad;

  return (
    <section className={styles.page}>
      <BackButton label="History" onClick={() => navigate('/sep/history')} />

      <div className={styles.header}>
        <div className={`${styles.icon} ${iconClass}`}>
          {pct >= 70 ? (
            <Check size={28} strokeWidth={3} />
          ) : (
            <AlertTriangle size={26} />
          )}
        </div>
        <div className={styles.score}>
          {correct} / {total}
        </div>
        <span className={styles.scoreSub}>{pct}% correct</span>
        <h1 className={styles.title}>Exam review</h1>
        <span className={styles.dateLine}>
          {formatDateTime(attempt.completedAt)}
        </span>

        <div className={styles.stats}>
          <div className={styles.stat}>
            <span className={styles.statValue}>{correct}</span>
            <span className={styles.statLabel}>Correct</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statValue}>{wrong}</span>
            <span className={styles.statLabel}>Wrong</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statValue}>{skipped}</span>
            <span className={styles.statLabel}>Skipped</span>
          </div>
        </div>
      </div>

      <div className={styles.subjectList}>
        {groups.map((g) => {
          const open = openSubjects.has(g.subject);
          const gPct =
            g.total > 0 ? Math.round((g.correct / g.total) * 100) : 0;
          return (
            <div key={g.subject} className={styles.subjectSection}>
              <button
                type="button"
                className={styles.subjectHeader}
                onClick={() => toggleSubject(g.subject)}
                aria-expanded={open}
              >
                <div className={styles.subjectLeft}>
                  <ChevronDown
                    size={18}
                    className={`${styles.chevron} ${
                      open ? styles.chevronOpen : ''
                    }`}
                    aria-hidden="true"
                  />
                  <span className={styles.subjectName}>{g.subject}</span>
                </div>
                <span className={styles.subjectScore}>
                  {g.correct}/{g.total}{' '}
                  <span className={styles.subjectPct}>{gPct}%</span>
                </span>
              </button>

              {open && (
                <div className={styles.subjectBody}>
                  {g.rows.map((q) => {
                    const verdictClass =
                      q.verdict === 'correct'
                        ? styles.verdictCorrect
                        : q.verdict === 'wrong'
                          ? styles.verdictWrong
                          : styles.verdictSkipped;

                    return (
                      <div key={q.questionId} className={styles.questionCard}>
                        <div className={styles.questionHeader}>
                          <span className={styles.qBadge}>
                            Q{q.questionNumber}
                          </span>
                          <span
                            className={`${styles.verdict} ${verdictClass}`}
                          >
                            {q.verdict === 'correct'
                              ? 'Correct'
                              : q.verdict === 'wrong'
                                ? 'Wrong'
                                : 'Skipped'}
                          </span>
                        </div>

                        <p className={styles.questionText}>{q.question}</p>

                        <div className={styles.options}>
                          {q.options.map((opt, i) => {
                            const letter = LETTERS[i];
                            const isUser = q.userAnswer === letter;
                            const isCorrect = q.answer === letter;

                            let cls = styles.option;
                            if (isUser && isCorrect) {
                              cls += ` ${styles.optionUserCorrect}`;
                            } else if (isUser && !isCorrect) {
                              cls += ` ${styles.optionUserWrong}`;
                            } else if (!isUser && isCorrect) {
                              cls += ` ${styles.optionShowCorrect}`;
                            }

                            return (
                              <div key={letter} className={cls}>
                                <span className={styles.optionLetter}>
                                  {letter}
                                </span>
                                <span className={styles.optionText}>
                                  {opt}
                                </span>
                              </div>
                            );
                          })}
                        </div>

                        <div className={styles.explanation}>
                          {q.explanation || (
                            <span className={styles.explanationEmpty}>
                              No explanation available for this question yet.
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
