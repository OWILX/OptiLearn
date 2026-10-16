import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BookOpen,
  ChevronRight,
  CircleHelp,
  Layers,
  Lock,
  Play,
  Sparkles,
} from 'lucide-react';
import { useProfile } from '@/context/ProfileContext';
import { readSession } from '@/utils/sessionStorage';
import {
  QUIZ_TYPES,
  type QuizType,
} from './quizConfig';
import {
  QUIZ_SESSION_KEY,
  isLiveQuizSession,
  quizSessionPath,
  type QuizPersistedSession,
} from './quizSession';
import styles from './QuizScreen.module.css';

const TYPE_ICONS: Record<QuizType, typeof BookOpen> = {
  mcq: CircleHelp,
  tf: BookOpen,
  mcq_tf: Layers,
};

export function QuizScreen() {
  const navigate = useNavigate();
  const { plan } = useProfile();
  const isPremium = plan?.premiumExplanations === true;
  const [resumable] = useState<QuizPersistedSession | null>(() => {
    const stored = readSession<QuizPersistedSession>(QUIZ_SESSION_KEY);
    return isLiveQuizSession(stored) ? stored : null;
  });

  return (
    <section className={styles.page}>
      {resumable && (
        <button
          type="button"
          className={styles.resumeBanner}
          onClick={() => navigate(quizSessionPath(resumable))}
        >
          <span className={styles.resumeIcon}>
            <Play size={16} aria-hidden="true" />
          </span>
          <span className={styles.resumeText}>
            <span className={styles.resumeTitle}>Resume quiz</span>
            <span className={styles.resumeMeta}>
              {resumable.course} · {resumable.topic} ·{' '}
              {Object.keys(resumable.answers).length}/{resumable.questions.length}{' '}
              answered
            </span>
          </span>
        </button>
      )}

      <div className={styles.header}>
        <h1 className={styles.title}>Quiz</h1>
        <p className={styles.subtitle}>
          Choose a question format to begin.
        </p>
      </div>

      <div className={styles.personalizedCard} aria-disabled="true">
        <div className={styles.personalizedIcon}>
          <Sparkles size={22} aria-hidden="true" />
        </div>
        <div className={styles.personalizedBody}>
          <span className={styles.personalizedTitle}>Personalized quiz</span>
          <span className={styles.personalizedMeta}>
            {isPremium ? 'Answer 300 questions to unlock' : 'Premium only'}
          </span>
        </div>
        <Lock size={16} className={styles.personalizedLock} aria-hidden="true" />
      </div>

      <div className={styles.difficultyGrid}>
        <h2 className={styles.typeHeading}>Available question types</h2>
        {QUIZ_TYPES.map(({ key, label, description }) => {
          const Icon = TYPE_ICONS[key];
          return (
            <button
              key={key}
              type="button"
              className={`${styles.difficultyCard} ${styles[key]}`}
              onClick={() => navigate(`/quiz/setup?type=${key}`)}
            >
              <span className={styles.difficultyIcon}>
                <Icon size={20} aria-hidden="true" />
              </span>
              <span className={styles.difficultyBody}>
                <span className={styles.difficultyLabel}>{label}</span>
                <span className={styles.difficultyMeta}>{description}</span>
              </span>
              <ChevronRight
                size={18}
                className={styles.difficultyChevron}
                aria-hidden="true"
              />
            </button>
          );
        })}

        <div
          className={`${styles.difficultyCard} ${styles.comingSoonCard}`}
          aria-disabled="true"
        >
          <span className={styles.difficultyIcon}>
            <Layers size={20} aria-hidden="true" />
          </span>
          <span className={styles.difficultyBody}>
            <span className={styles.difficultyLabel}>EMQs</span>
            <span className={styles.difficultyMeta}>Coming soon</span>
          </span>
          <span className={styles.comingSoonTag}>Coming soon</span>
        </div>

        <div
          className={`${styles.difficultyCard} ${styles.comingSoonCard}`}
          aria-disabled="true"
        >
          <span className={styles.difficultyIcon}>
            <BookOpen size={20} aria-hidden="true" />
          </span>
          <span className={styles.difficultyBody}>
            <span className={styles.difficultyLabel}>Cloze</span>
            <span className={styles.difficultyMeta}>Coming soon</span>
          </span>
          <span className={styles.comingSoonTag}>Coming soon</span>
        </div>
      </div>
    </section>
  );
}
