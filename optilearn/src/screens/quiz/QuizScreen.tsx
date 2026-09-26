import { useNavigate } from 'react-router-dom';
import { Lock, Sparkles, Zap, Target, Flame, ChevronRight } from 'lucide-react';
import { useProfile } from '@/context/ProfileContext';
import { DIFFICULTIES, type Difficulty } from './quizConfig';
import styles from './QuizScreen.module.css';

const DIFFICULTY_META: Record<
  Difficulty,
  { Icon: typeof Zap; tagline: string; tone: string }
> = {
  easy: { Icon: Zap, tagline: 'Gentle pace', tone: 'easy' },
  medium: { Icon: Target, tagline: 'Balanced set', tone: 'medium' },
  hard: { Icon: Flame, tagline: 'Push yourself', tone: 'hard' },
};

export function QuizScreen() {
  const navigate = useNavigate();
  const { profile } = useProfile();
  const isPremium = profile?.premium === true;

  return (
    <section className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Quiz</h1>
        <p className={styles.subtitle}>
          Timed practice by subject and difficulty.
        </p>
      </div>

      {/* Personalized card — deferred. Locked until the study-plan model exists. */}
      <div className={styles.personalizedCard} aria-disabled="true">
        <div className={styles.personalizedIcon}>
          <Sparkles size={22} aria-hidden="true" />
        </div>
        <div className={styles.personalizedBody}>
          <span className={styles.personalizedTitle}>Personalized quiz</span>
          <span className={styles.personalizedMeta}>
            {isPremium
              ? 'Answer 300 questions to unlock'
              : 'Premium only'}
          </span>
        </div>
        <Lock size={16} className={styles.personalizedLock} aria-hidden="true" />
      </div>

      <div className={styles.difficultyGrid}>
        {DIFFICULTIES.map(({ key, label }) => {
          const { Icon, tagline, tone } = DIFFICULTY_META[key];
          return (
            <button
              key={key}
              type="button"
              className={`${styles.difficultyCard} ${styles[tone]}`}
              onClick={() => navigate(`/quiz/setup?difficulty=${key}`)}
            >
              <div className={styles.difficultyIcon}>
                <Icon size={20} aria-hidden="true" />
              </div>
              <div className={styles.difficultyBody}>
                <span className={styles.difficultyLabel}>{label}</span>
                <span className={styles.difficultyMeta}>{tagline}</span>
              </div>
              <ChevronRight
                size={18}
                className={styles.difficultyChevron}
                aria-hidden="true"
              />
            </button>
          );
        })}
      </div>
    </section>
  );
}
