import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Coins, Sparkles, Wand2 } from 'lucide-react';
import { BackButton } from '@/components/ui/BackButton';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { useProfile } from '@/context/ProfileContext';
import {
  generatedQuizService,
  type GeneratedQuestionType,
  type GeneratedQuizContext,
} from '@/services/quiz/generatedQuizService';
import { userFacingErrorMessage } from '@/utils/errors';
import { QUIZ_TYPES } from './quizConfig';
import styles from './GeneratedQuiz.module.css';

const COUNT_OPTIONS = [5, 10, 15, 20];

export function GeneratedQuizSetupScreen() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const subtopicId = Number(params.get('subtopic'));
  const { plan, planLoading, refreshPlan } = useProfile();

  const [context, setContext] = useState<GeneratedQuizContext | null>(null);
  const [contextError, setContextError] = useState<string | null>(null);
  const [count, setCount] = useState(10);
  const [questionType, setQuestionType] =
    useState<GeneratedQuestionType>('mcq');
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const invalidSubtopic =
    !Number.isSafeInteger(subtopicId) || subtopicId <= 0;

  useEffect(() => {
    if (invalidSubtopic) return;
    let cancelled = false;
    generatedQuizService
      .getContext(subtopicId)
      .then((row) => {
        if (cancelled) return;
        if (!row) {
          setContextError('This subtopic is not available yet.');
          return;
        }
        setContext(row);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setContextError(
            userFacingErrorMessage(err, "We couldn't load this note."),
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [subtopicId, invalidSubtopic]);

  const limit = plan?.generatedQuestionDailyLimit ?? 0;
  const used = plan?.generatedQuestionUsed ?? 0;
  const remaining = Math.max(0, limit - used);
  const eligible = limit > 0;
  const allowedCounts = COUNT_OPTIONS.filter((option) => option <= remaining);
  const counts = allowedCounts.length > 0
    ? allowedCounts
    : remaining > 0
    ? [remaining]
    : [];
  const selectedCount = counts.includes(count) ? count : counts[0] ?? 0;

  async function generate() {
    if (!context || selectedCount <= 0) return;
    setGenerating(true);
    setGenerateError(null);
    try {
      const result = await generatedQuizService.generate({
        subtopicId: context.subtopicId,
        count: selectedCount,
        questionType,
      });
      await refreshPlan();
      navigate(`/quiz/generated/session/${result.quizId}`, { replace: true });
    } catch (err) {
      setGenerateError(
        userFacingErrorMessage(
          err,
          "We couldn't generate this quiz. Please try again.",
        ),
      );
      void refreshPlan();
    } finally {
      setGenerating(false);
    }
  }

  return (
    <section className={styles.page}>
      <BackButton
        label="Personalized quizzes"
        onClick={() => navigate('/quiz/generated')}
      />

      <header className={styles.header}>
        <span className={styles.eyebrow}>
          <Sparkles size={14} aria-hidden="true" />
          Personalized quiz
        </span>
        <h1 className={styles.title}>Generate from this note</h1>
        <p className={styles.subtitle}>
          Questions are written from this subtopic&apos;s study note and
          curriculum content.
        </p>
      </header>

      {invalidSubtopic || contextError ? (
        <>
          <EmptyState
            icon={<Wand2 size={24} aria-hidden="true" />}
            title="Note not available"
            message={contextError ?? 'No study note was selected.'}
          />
          <Button variant="secondary" fullWidth onClick={() => navigate('/study')}>
            Browse study notes
          </Button>
        </>
      ) : !context ? (
        <div className={styles.loading} role="status">
          Loading note…
        </div>
      ) : (
        <>
          <div className={styles.card}>
            <div>
              <div className={styles.sourceTitle}>
                {context.noteTitle ?? context.subtopicName}
              </div>
              <div className={styles.sourceMeta}>
                {context.courseName} · {context.topicName} ·{' '}
                {context.subtopicName}
              </div>
            </div>
            <span className={styles.allowance}>
              <Coins size={13} aria-hidden="true" />
              {planLoading
                ? 'Checking allowance…'
                : eligible
                ? `${remaining} of ${limit} questions left today`
                : 'Plus and Pro only'}
            </span>
          </div>

          {planLoading ? (
            <div className={styles.loading} role="status">
              Checking your allowance…
            </div>
          ) : !eligible ? (
            <div className={styles.locked}>
              <span className={styles.lockedTitle}>
                Personalized quizzes are a Plus and Pro feature
              </span>
              <p className={styles.lockedText}>
                Upgrade to generate exam-style questions from any study note,
                then play them as a timed-style quiz with full explanations.
              </p>
              <Button variant="primary" onClick={() => navigate('/plans')}>
                View plans
              </Button>
            </div>
          ) : remaining === 0 ? (
            <div className={styles.card}>
              <span className={styles.sourceTitle}>
                You&apos;ve used today&apos;s personalized questions
              </span>
              <p className={styles.subtitle}>
                Your allowance resets tomorrow. You can still replay every quiz
                you have already generated.
              </p>
              <Button
                variant="secondary"
                onClick={() => navigate('/quiz/generated')}
              >
                View my quizzes
              </Button>
            </div>
          ) : (
            <>
              <div className={styles.card}>
                <span className={styles.fieldLabel}>Number of questions</span>
                <div className={styles.choiceRow}>
                  {counts.map((option) => (
                    <button
                      key={option}
                      type="button"
                      className={`${styles.choice} ${
                        selectedCount === option ? styles.choiceActive : ''
                      }`}
                      onClick={() => setCount(option)}
                      disabled={generating}
                    >
                      {option}
                    </button>
                  ))}
                </div>

                <span className={styles.fieldLabel}>Format</span>
                <div className={styles.choiceRow}>
                  {QUIZ_TYPES.map((type) => (
                    <button
                      key={type.key}
                      type="button"
                      className={`${styles.choice} ${
                        questionType === type.key ? styles.choiceActive : ''
                      }`}
                      onClick={() => setQuestionType(type.key)}
                      disabled={generating}
                    >
                      {type.label}
                    </button>
                  ))}
                </div>
              </div>

              {generateError && (
                <p className={styles.error} role="alert">
                  {generateError}
                </p>
              )}

              <div className={styles.actions}>
                <Button
                  variant="primary"
                  fullWidth
                  loading={generating}
                  disabled={generating || selectedCount <= 0}
                  onClick={() => void generate()}
                >
                  <Wand2 size={16} aria-hidden="true" />
                  {generating ? 'Writing your questions…' : 'Generate quiz'}
                </Button>
              </div>
              <p className={styles.subtitle}>
                Each generated question uses one of your daily personalized
                questions. Generating may take a few seconds.
              </p>
            </>
          )}
        </>
      )}
    </section>
  );
}
