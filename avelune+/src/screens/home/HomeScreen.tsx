import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, Target, ArrowRight, Flame } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useProfile } from '@/context/ProfileContext';
import { planService, type PlanOption } from '@/services/plans/planService';
import {
  progressService,
  type ProgressStats,
  type ContinueLearning,
} from '@/services/progress/progressService';
import { streakService, type StreakInfo } from '@/services/streaks/streakService';
import {
  quizService,
  type QuizHistorySummary,
} from '@/services/quiz/quizService';
import { subjectColor } from '@/utils/subjectColor';
import { userFacingErrorMessage } from '@/utils/errors';
import {
  blogService,
  type ConceptPostListItem,
} from '@/services/blog/blogService';
import { Skeleton } from '@/components/ui/Skeleton';
import styles from './HomeScreen.module.css';

interface DashboardData {
  progress: ProgressStats;
  quizCount: number;
  streak: StreakInfo;
  continueLearning: ContinueLearning | null;
  recentQuizzes: QuizHistorySummary[];
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function getLongDate(): string {
  return new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diffMs = Date.now() - then;
  const min = Math.floor(diffMs / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day === 1) return 'yesterday';
  if (day < 7) return `${day}d ago`;
  return new Date(iso).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
  });
}

function scoreClass(pct: number, styles: Record<string, string>): string {
  if (pct >= 70) return styles.recentScoreGood;
  if (pct >= 40) return styles.recentScoreMid;
  return styles.recentScoreBad;
}

function quizTypeLabel(type: string): string {
  if (type === 'mcq_tf') return 'MCQ + True/False';
  if (type === 'mcq') return 'MCQ';
  if (type === 'tf') return 'True/False';
  return type;
}

export function HomeScreen() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const {
    profile,
    refresh: refreshProfile,
    plan,
    planLoading,
    planError,
    refreshPlan,
  } = useProfile();

  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [notes, setNotes] = useState<ConceptPostListItem[]>([]);
  const [plans, setPlans] = useState<PlanOption[]>([]);
  const [plansLoadError, setPlansLoadError] = useState<string | null>(null);
  const [introDismissed, setIntroDismissed] = useState(false);
  const [introSaving, setIntroSaving] = useState(false);
  const [introError, setIntroError] = useState<string | null>(null);


  // Ticks once a minute so the greeting and date roll over correctly
  // if the user leaves the tab open across noon, evening, or midnight.
  const [, setMinuteTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(
      () => setMinuteTick((t) => t + 1),
      60_000,
    );
    return () => window.clearInterval(id);
  }, []);

  // Prefer the profile name (editable) over Google metadata.
  const displayName =
    profile?.full_name?.trim() ||
    user?.user_metadata?.full_name ||
    user?.user_metadata?.name ||
    user?.email?.split('@')[0] ||
    'student';

  useEffect(() => {
    let cancelled = false;
    blogService
      .listPublished(profile?.department ?? null)
      .then((rows) => {
        if (!cancelled) setNotes(rows.slice(0, 2));
      })
      .catch((err: unknown) => {
        console.error('[HOME] Lesson notes failed:', err);
      });
    return () => {
      cancelled = true;
    };
  }, [profile?.department]);

  useEffect(() => {
    if (planLoading || !plan || plan.planIntroSeenAt) return;
    let cancelled = false;
    planService
      .getPlans()
      .then((rows) => {
        if (!cancelled) setPlans(rows);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setPlansLoadError(
            userFacingErrorMessage(
              err,
              "We couldn't load plan details. Please try again.",
            ),
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [plan, planLoading]);

  const load = useCallback(
    async (signal: { cancelled: boolean }) => {
      if (!user) return;
      setLoading(true);
      setError(null);
      try {
        const [progress, quizCount, streak, continueLearning, recentQuizzes] =
          await Promise.all([
            progressService.getMyStats(user.id),
            quizService.getQuizCount(),
            streakService.getMyStreak(),
            progressService.getContinueLearning(user.id),
            quizService.getRecentQuizzes(3),
          ]);
        if (signal.cancelled) return;
        setData({
          progress,
          quizCount,
          streak,
          continueLearning,
          recentQuizzes,
        });
      } catch (err) {
        if (signal.cancelled) return;
        setError(
          userFacingErrorMessage(
            err,
            "We couldn't load your dashboard. Check your connection and try again.",
          ),
        );
      } finally {
        if (!signal.cancelled) setLoading(false);
      }
    },
    [user],
  );

  useEffect(() => {
    const signal = { cancelled: false };
    void Promise.resolve().then(() => {
      if (!signal.cancelled) void load(signal);
    });
    return () => {
      signal.cancelled = true;
    };
  }, [load]);

  const progress = data?.progress;
  const quizCount = data?.quizCount;
  const streak = data?.streak;
  const continueLearning = data?.continueLearning ?? null;
  const recentQuizzes = data?.recentQuizzes ?? [];
  const streakDays = streak?.currentStreak ?? 0;
  const shouldShowPlansIntro =
    !planLoading && !!plan && !plan.planIntroSeenAt && !introDismissed;

  async function closePlansIntro(goToPlans: boolean) {
    if (introSaving) return;
    setIntroSaving(true);
    setIntroError(null);
    try {
      await planService.markPlansIntroSeen();
      setIntroDismissed(true);
      await refreshPlan();
      if (goToPlans) navigate('/plans');
    } catch (err) {
      setIntroError(
        userFacingErrorMessage(
          err,
          "We couldn't save your choice. Please try again.",
        ),
      );
    } finally {
      setIntroSaving(false);
    }
  }

  return (
    <section className={styles.page}>
      <div className={styles.greeting}>
        <span className={styles.greetingDate}>{getLongDate()}</span>
        <span className={styles.greetingLine}>{getGreeting()},</span>
        <span className={styles.greetingName}>{displayName}</span>
        {!loading && streakDays > 0 && (
          <span className={styles.streakChip}>
            <Flame size={13} aria-hidden="true" />
            {streakDays}-day streak
          </span>
        )}
      </div>
      {error && (
        <div className={styles.errorBanner}>
          <span className={styles.errorBannerText}>{error}</span>
          <button
            type="button"
            className={styles.errorRetry}
            onClick={() => {
              void load({ cancelled: false });
              void refreshProfile();
            }}
          >
            Retry
          </button>
        </div>
      )}

      {planError && (
        <div className={styles.errorBanner} role="alert">
          Your plan details could not be loaded. Refresh to retry.
          <button
            type="button"
            className={styles.errorRetry}
            onClick={() => void refreshPlan()}
          >
            Retry
          </button>
        </div>
      )}

      {!planLoading && plan && (
        <button
          type="button"
          className={styles.planSummary}
          onClick={() => navigate('/plans')}
          aria-label={`You are on the ${plan.displayName} plan. View plans.`}
        >
          <span className={styles.planSummaryTop}>
            <span className={styles.planSummaryName}>
              {plan.displayName} plan
            </span>
            <span className={styles.planSummaryLink}>
              View plans <ArrowRight size={14} aria-hidden="true" />
            </span>
          </span>
          <span className={styles.planSummaryUsage}>
            New quiz questions: {plan.quizNewDailyLimit - plan.quizNewUsed}/
            {plan.quizNewDailyLimit} · Study: {plan.studyNewDailyLimit - plan.studyNewUsed}/
            {plan.studyNewDailyLimit} · AI: {plan.aiDailyLimit - plan.aiUsed}/
            {plan.aiDailyLimit} today
          </span>
        </button>
      )}

      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Continue learning</h2>
        </div>
        {loading ? (
          <div className={styles.continueSkeleton} aria-hidden="true" />
        ) : continueLearning ? (
          <ContinueCard
            data={continueLearning}
            onOpen={() =>
              navigate(`/study/topic/${continueLearning.syllabus.id}`)
            }
          />
        ) : (
          <div className={styles.continueEmpty}>
            <span className={styles.continueEmptyText}>
              You haven't started any topic yet. Pick a subject and begin.
            </span>
            <button
              type="button"
              className={styles.continueButton}
              onClick={() => navigate('/study')}
            >
              Start studying
              <ArrowRight size={16} aria-hidden="true" />
            </button>
          </div>
        )}
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Progress at a glance</h2>
        </div>
        <div className={styles.statsGrid}>
          <StatCard
            label="Topics studied"
            value={
              progress
                ? progress.topicsCompleted + progress.topicsInProgress
                : undefined
            }
            secondary={
              progress && progress.topicsInProgress > 0
                ? `${progress.topicsInProgress} in progress`
                : undefined
            }
            loading={loading}
          />
          <StatCard
            label="Quiz attempts"
            value={quizCount}
            loading={loading}
          />
          <StatCard
            label="Day streak"
            value={streak?.currentStreak}
            loading={loading}
          />
        </div>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Quick actions</h2>
        </div>
        <div className={styles.actionsGrid}>
          <button
            type="button"
            className={styles.actionButton}
            onClick={() => navigate('/study')}
          >
            <div className={`${styles.actionIcon} ${styles.actionIconStudy}`}>
              <BookOpen size={20} aria-hidden="true" />
            </div>
            <span className={styles.actionLabel}>Study</span>
            <span className={styles.actionSub}>Learn a topic</span>
          </button>

          <button
            type="button"
            className={styles.actionButton}
            onClick={() => navigate('/quiz')}
          >
            <div className={`${styles.actionIcon} ${styles.actionIconPractice}`}>
              <Target size={20} aria-hidden="true" />
            </div>
            <span className={styles.actionLabel}>Quiz</span>
            <span className={styles.actionSub}>Timed practice</span>
          </button>

        </div>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Lesson notes</h2>
          <button
            type="button"
            className={styles.sectionLink}
            onClick={() => navigate('/notes')}
          >
            View all
          </button>
        </div>
        {notes.length === 0 ? (
          <button
            type="button"
            className={styles.actionButton}
            onClick={() => navigate('/notes')}
          >
            <div className={`${styles.actionIcon} ${styles.actionIconStudy}`}>
              <BookOpen size={20} aria-hidden="true" />
            </div>
            <span className={styles.actionLabel}>Lesson notes</span>
            <span className={styles.actionSub}>One idea at a time</span>
          </button>
        ) : (
          notes.map((note) => (
            <button
              key={note.id}
              type="button"
              className={styles.actionButton}
              onClick={() => navigate('/notes/' + note.slug)}
            >
              <div className={`${styles.actionIcon} ${styles.actionIconStudy}`}>
                <BookOpen size={20} aria-hidden="true" />
              </div>
              <span className={styles.actionLabel}>{note.title}</span>
              <span className={styles.actionSub}>{note.subject}</span>
            </button>
          ))
        )}
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Recent performance</h2>
        </div>
        {loading ? (
          <Skeleton height={80} />
        ) : recentQuizzes.length === 0 ? (
          <div className={styles.recentEmpty}>
            No quizzes taken yet. Complete a quiz to see it here.
          </div>
        ) : (
          <div className={styles.recentList}>
            {recentQuizzes.map((quiz) => {
              const pct = Math.round(quiz.score);

              return (
                <button
                  key={quiz.id}
                  type="button"
                  className={styles.recentRow}
                  onClick={() => navigate(`/quiz/history/${quiz.id}`)}
                  aria-label={`Review ${quizTypeLabel(quiz.type)} quiz, ${pct}% score`}
                >
                  <div className={styles.recentLeft}>
                    <span className={styles.recentSubjects}>
                      {quizTypeLabel(quiz.type)} quiz
                    </span>
                    <span className={styles.recentMeta}>
                      {relativeTime(quiz.completedAt)} · {quiz.correctAnswers}/
                      {quiz.totalQuestions} correct · {quiz.totalQuestions}{' '}
                      questions
                    </span>
                  </div>
                  <div className={styles.recentScoreWrap}>
                    <span
                      className={`${styles.recentScore} ${scoreClass(pct, styles)}`}
                    >
                      {pct}%
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {shouldShowPlansIntro && (
        <div className={styles.planIntroOverlay}>
          <section
            className={styles.planIntroDialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="plan-intro-title"
          >
            <span className={styles.planIntroEyebrow}>WELCOME TO AVELUNE+</span>
            <h2 id="plan-intro-title">Choose how far you want to go</h2>
            <p>
              Your plan sets your daily new-question and AI allowances, premium
              explanations, and how long quiz history stays available.
            </p>
            {plansLoadError ? (
              <div className={styles.planIntroError} role="alert">
                {plansLoadError}
              </div>
            ) : (
              <div className={styles.planIntroOptions}>
                {plans.map((item) => (
                  <div key={item.tier}>
                    <strong>{item.displayName}</strong>
                    <span>
                      {item.monthlyPriceNgn === 0
                        ? 'Free'
                        : `₦${item.monthlyPriceNgn.toLocaleString()}/month`}
                    </span>
                    <small>
                      {item.quizNewDailyLimit} quiz + {item.studyNewDailyLimit}{' '}
                      study questions daily · {item.aiDailyLimit} AI messages
                    </small>
                  </div>
                ))}
              </div>
            )}
            {introError && (
              <div className={styles.planIntroError} role="alert">
                {introError}
              </div>
            )}
            <div className={styles.planIntroActions}>
              <button
                type="button"
                onClick={() => void closePlansIntro(false)}
                disabled={introSaving}
              >
                Not now
              </button>
              <button
                type="button"
                className={styles.planIntroPrimary}
                onClick={() => void closePlansIntro(true)}
                disabled={introSaving}
              >
                {introSaving ? 'Saving…' : 'View plans'}
              </button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}
interface ContinueCardProps {
  data: ContinueLearning;
  onOpen: () => void;
}

function ContinueCard({ data, onOpen }: ContinueCardProps) {
  const { syllabus, progress } = data;
  const color = subjectColor(syllabus.courseName);
  const pct = Math.max(0, Math.min(100, Math.round(progress.progress)));
  const isComplete = pct >= 100;

  return (
    <div className={styles.continueCard}>
      <span
        className={styles.continueChip}
        style={{ color: color.fg, background: color.bg }}
      >
        {syllabus.courseName}
      </span>

      <div>
        <div className={styles.continueTitle}>{syllabus.moduleName}</div>
        <div className={styles.continueSubtopic}>
          {syllabus.topicName} · {syllabus.subtopicName}
        </div>
      </div>

      <div className={styles.continueProgressRow}>
        <div className={styles.continueProgressTrack}>
          <div
            className={styles.continueProgressFill}
            style={{ width: `${pct}%`, background: color.fg }}
          />
        </div>
        <span className={styles.continueProgressPct}>{pct}%</span>
      </div>

      <button type="button" className={styles.continueButton} onClick={onOpen}>
        {isComplete ? 'Review' : 'Continue'}
        <ArrowRight size={16} aria-hidden="true" />
      </button>
    </div>
  );
}

interface StatCardProps {
  label: string;
  value: number | string | undefined;
  loading: boolean;
  hideZero?: boolean;
  secondary?: string;
}

function StatCard({
  label,
  value,
  loading,
  hideZero,
  secondary,
}: StatCardProps) {
  let display: string;
  let muted = false;

  if (loading) {
    display = '';
  } else if (value === undefined || value === null) {
    display = '—';
    muted = true;
  } else if (hideZero && value === 0) {
    display = '—';
    muted = true;
  } else {
    display = String(value);
  }

  return (
    <div className={styles.statCard}>
      <span className={styles.statLabel}>{label}</span>
      {loading ? (
        <span className={styles.statSkeleton} aria-hidden="true" />
      ) : (
        <>
          <span
            className={`${styles.statValue} ${muted ? styles.statValueMuted : ''}`}
          >
            {display}
          </span>
          {secondary && (
            <span className={styles.statSecondary}>{secondary}</span>
          )}
        </>
      )}
    </div>
  );
}
