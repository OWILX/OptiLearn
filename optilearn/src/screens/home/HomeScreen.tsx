import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, Target, Timer, ArrowRight, Flame, Play } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useProfile } from '@/context/ProfileContext';
import {
  progressService,
  type ProgressStats,
  type ContinueLearning,
} from '@/services/progress/progressService';
import {
  examService,
  type ExamStats,
  type RecentAttempt,
} from '@/services/exams/examService';
import { streakService, type StreakInfo } from '@/services/streaks/streakService';
import { subjectColor } from '@/utils/subjectColor';
import {
  SEP_SESSION_KEY,
  type SEPPersistedSession,
} from '@/services/exams/sepSession';
import {
  readSession,
  clearSession,
} from '@/utils/sessionStorage';
import { Skeleton } from '@/components/ui/Skeleton';
import styles from './HomeScreen.module.css';

interface DashboardData {
  progress: ProgressStats;
  exams: ExamStats;
  streak: StreakInfo;
  continueLearning: ContinueLearning | null;
  recentAttempts: RecentAttempt[];
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

function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) {
    return `${h}h ${String(m).padStart(2, '0')}m`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}

interface ResumableSep {
  subjects: string[];
  timeLimitMinutes: number;
  endTime: number;
  answered: number;
  total: number;
}

export function HomeScreen() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { profile, refresh: refreshProfile } = useProfile();

  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [resumableSep, setResumableSep] = useState<ResumableSep | null>(null);
  const [sepCountdown, setSepCountdown] = useState(0);

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

  // Load any in-progress SEP session from localStorage on mount.
  // Home remounts on every navigation, so this runs after leaving
  // an exam too — the banner appears the moment the user comes back.
  useEffect(() => {
    const stored = readSession<SEPPersistedSession>(SEP_SESSION_KEY);
    if (!stored || stored.endTime <= Date.now()) {
      if (stored) clearSession(SEP_SESSION_KEY);
      setResumableSep(null);
      return;
    }
    setResumableSep({
      subjects: stored.subjects,
      timeLimitMinutes: stored.timeLimitMinutes,
      endTime: stored.endTime,
      answered: Object.keys(stored.answers).length,
      total: stored.questions.length,
    });
    setSepCountdown(stored.endTime - Date.now());
  }, []);

  // Tick the SEP countdown once a second. Clears the banner when the
  // timer hits zero — the session is expired and unusable.
  useEffect(() => {
    if (!resumableSep) return;
    const tick = () => {
      const remaining = resumableSep.endTime - Date.now();
      if (remaining <= 0) {
        clearSession(SEP_SESSION_KEY);
        setResumableSep(null);
        return;
      }
      setSepCountdown(remaining);
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [resumableSep]);

  function handleResumeSep() {
    if (!resumableSep) return;
    const p = new URLSearchParams();
    p.set('subjects', resumableSep.subjects.join(','));
    p.set('time', String(resumableSep.timeLimitMinutes));
    navigate(`/sep/exam?${p.toString()}`);
  }

  const load = useCallback(
    async (signal: { cancelled: boolean }) => {
      if (!user) return;
      setLoading(true);
      setError(null);
      try {
        const [
          progress,
          exams,
          streak,
          continueLearning,
          recentAttempts,
        ] = await Promise.all([
          progressService.getMyStats(user.id),
          examService.getMyStats(user.id),
          streakService.getMyStreak(),
          progressService.getContinueLearning(user.id),
          examService.getRecentAttempts(user.id, 3),
        ]);
        if (signal.cancelled) return;
        setData({
          progress,
          exams,
          streak,
          continueLearning,
          recentAttempts,
        });
      } catch (err) {
        if (signal.cancelled) return;
        setError(
          err instanceof Error ? err.message : 'Could not load your dashboard.',
        );
      } finally {
        if (signal.cancelled) return;
        setLoading(false);
      }
    },
    [user],
  );

  useEffect(() => {
    const signal = { cancelled: false };
    void load(signal);
    return () => {
      signal.cancelled = true;
    };
  }, [load]);

  const progress = data?.progress;
  const exams = data?.exams;
  const streak = data?.streak;
  const continueLearning = data?.continueLearning ?? null;
  const recentAttempts = data?.recentAttempts ?? [];
  const streakDays = streak?.currentStreak ?? 0;

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

      {resumableSep && (
        <button
          type="button"
          className={styles.resumeSepCard}
          onClick={handleResumeSep}
        >
          <div className={styles.resumeSepIcon}>
            <Play size={18} aria-hidden="true" />
          </div>
          <div className={styles.resumeSepBody}>
            <span className={styles.resumeSepTitle}>
              Exam in progress
            </span>
            <span className={styles.resumeSepMeta}>
              {resumableSep.subjects.join(' · ')}
            </span>
            <span className={styles.resumeSepMeta}>
              {resumableSep.answered}/{resumableSep.total} answered
            </span>
          </div>
          <span className={styles.resumeSepTimer}>
            {formatCountdown(sepCountdown)}
          </span>
        </button>
      )}

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
            label="SEP attempts"
            value={exams?.attemptsCount}
            loading={loading}
          />
          <StatCard
            label="Avg score"
            value={
              exams?.averageScore != null
                ? `${Math.round(exams.averageScore)}%`
                : undefined
            }
            loading={loading}
            hideZero
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
            onClick={() => navigate('/practice')}
          >
            <div className={`${styles.actionIcon} ${styles.actionIconPractice}`}>
              <Target size={20} aria-hidden="true" />
            </div>
            <span className={styles.actionLabel}>Practice</span>
            <span className={styles.actionSub}>Past questions</span>
          </button>

          <button
            type="button"
            className={styles.actionButton}
            onClick={() => navigate('/sep')}
          >
            <div className={`${styles.actionIcon} ${styles.actionIconSep}`}>
              <Timer size={20} aria-hidden="true" />
            </div>
            <span className={styles.actionLabel}>SEP</span>
            <span className={styles.actionSub}>Simulated exam</span>
          </button>
        </div>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Question of the day</h2>
        </div>
        <div className={styles.placeholder}>
          Coming soon — will load from the daily challenges source.
        </div>
      </div>

      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>Recent performance</h2>
          {!loading && recentAttempts.length > 0 && (
            <button
              type="button"
              className={styles.sectionLink}
              onClick={() => navigate('/sep/history')}
            >
              View all
            </button>
          )}
        </div>
        {loading ? (
          <Skeleton height={80} />
        ) : recentAttempts.length === 0 ? (
          <div className={styles.recentEmpty}>
            No SEP attempts yet. Take one to see your scores here.
          </div>
        ) : (
          <div className={styles.recentList}>
            {recentAttempts.map((a) => {
              const pct =
                a.score !== null
                  ? Math.round(a.score)
                  : a.totalQuestions > 0
                    ? Math.round((a.correctAnswers / a.totalQuestions) * 100)
                    : 0;
              const subjects = a.subject
                ? a.subject.split(',').map((s) => s.trim()).filter(Boolean)
                : [];
              const primary = subjects[0] ?? 'SEP exam';
              const extra = subjects.length > 1 ? subjects.length - 1 : 0;

              return (
                <div key={a.id} className={styles.recentRow}>
                  <div className={styles.recentLeft}>
                    <span className={styles.recentSubjects}>
                      {primary}
                      {extra > 0 && (
                        <span className={styles.recentExtra}>
                          {' '}+{extra} more
                        </span>
                      )}
                    </span>
                    <span className={styles.recentMeta}>
                      {relativeTime(a.completedAt)} · {a.correctAnswers}/
                      {a.totalQuestions} correct
                    </span>
                  </div>
                  <div className={styles.recentScoreWrap}>
                    <span
                      className={`${styles.recentScore} ${scoreClass(pct, styles)}`}
                    >
                      {pct}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

interface ContinueCardProps {
  data: ContinueLearning;
  onOpen: () => void;
}

function ContinueCard({ data, onOpen }: ContinueCardProps) {
  const { syllabus, progress } = data;
  const color = subjectColor(syllabus.subject);
  const pct = Math.max(0, Math.min(100, Math.round(progress.progress)));
  const isComplete = pct >= 100;

  return (
    <div className={styles.continueCard}>
      <span
        className={styles.continueChip}
        style={{ color: color.fg, background: color.bg }}
      >
        {syllabus.subject}
      </span>

      <div>
        <div className={styles.continueTitle}>{syllabus.section}</div>
        <div className={styles.continueSubtopic}>{syllabus.topic}</div>
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
