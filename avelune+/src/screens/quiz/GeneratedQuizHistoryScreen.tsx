import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, Coins, Sparkles } from 'lucide-react';
import { BackButton } from '@/components/ui/BackButton';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { useProfile } from '@/context/ProfileContext';
import {
  generatedQuizService,
  type GeneratedQuizSummary,
} from '@/services/quiz/generatedQuizService';
import { userFacingErrorMessage } from '@/utils/errors';
import styles from './GeneratedQuiz.module.css';

function formatDate(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
  });
}

export function GeneratedQuizHistoryScreen() {
  const navigate = useNavigate();
  const { plan } = useProfile();
  const [quizzes, setQuizzes] = useState<GeneratedQuizSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    generatedQuizService
      .getHistory(50)
      .then((rows) => {
        if (!cancelled) setQuizzes(rows);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(
            userFacingErrorMessage(err, "We couldn't load your quizzes."),
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const limit = plan?.generatedQuestionDailyLimit ?? 0;
  const remaining = Math.max(0, limit - (plan?.generatedQuestionUsed ?? 0));

  return (
    <section className={styles.page}>
      <BackButton label="Quiz" onClick={() => navigate('/quiz')} />

      <header className={styles.header}>
        <span className={styles.eyebrow}>
          <Sparkles size={14} aria-hidden="true" />
          Personalized
        </span>
        <h1 className={styles.title}>My generated quizzes</h1>
        <p className={styles.subtitle}>
          Quizzes you generated from study notes. Reopen any quiz to play or
          review it.
        </p>
      </header>

      <div className={styles.card}>
        <span className={styles.allowance}>
          <Coins size={13} aria-hidden="true" />
          {limit > 0
            ? `${remaining} of ${limit} questions left today`
            : 'Plus and Pro only'}
        </span>
        <Button variant="secondary" onClick={() => navigate('/study')}>
          Generate from a study note
        </Button>
      </div>

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      {!quizzes && !error ? (
        <Skeleton height={200} />
      ) : quizzes && quizzes.length > 0 ? (
        <ul className={styles.historyList}>
          {quizzes.map((quiz) => {
            const done = quiz.completedAt !== null;
            return (
              <li key={quiz.quizId}>
                <button
                  type="button"
                  className={styles.historyItem}
                  onClick={() =>
                    navigate(`/quiz/generated/session/${quiz.quizId}`)
                  }
                >
                  <span className={styles.historyMain}>
                    <span className={styles.historyTitle}>
                      {quiz.noteTitle}
                    </span>
                    <span className={styles.historyMeta}>
                      {quiz.courseName ? `${quiz.courseName} · ` : ''}
                      {quiz.totalQuestions} questions
                      {done
                        ? ` · ${formatDate(quiz.completedAt)}`
                        : ' · not submitted'}
                    </span>
                  </span>
                  <span
                    className={`${styles.historyScore} ${
                      done ? styles.historyScoreDone : ''
                    }`}
                  >
                    {done ? `${Math.round(quiz.score ?? 0)}%` : 'Play'}
                  </span>
                  <ChevronRight
                    size={18}
                    className={styles.historyChevron}
                    aria-hidden="true"
                  />
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState
          icon={<Sparkles size={24} aria-hidden="true" />}
          title="No personalized quizzes yet"
          message="Open any study note and generate a quiz from it. Your quizzes will appear here."
        />
      )}
    </section>
  );
}
