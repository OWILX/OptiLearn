import { type FormEvent, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, Sparkles, X } from 'lucide-react';
import { quizService, type QuizHistoryReview } from '@/services/quiz/quizService';
import { useProfile } from '@/context/ProfileContext';
import {
  askAI,
  getAskAIErrorMessage,
  type AskAIMessage,
} from '@/services/ai/askAi';
import { BackButton } from '@/components/ui/BackButton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Markdown } from '@/components/ui/Markdown';
import { Skeleton } from '@/components/ui/Skeleton';
import styles from './QuizSessionScreen.module.css';
import { userFacingErrorMessage } from '@/utils/errors';

const LETTERS = ['A', 'B', 'C', 'D'] as const;

function formatQuizType(type: string): string {
  if (type === 'mcq_tf') return 'MCQ + True/False';
  if (type === 'mcq') return 'MCQ';
  if (type === 'tf') return 'True/False';
  return type;
}

export function QuizHistoryDetailScreen() {
  const navigate = useNavigate();
  const { plan } = useProfile();
  const { quizId: quizIdParam } = useParams<{ quizId: string }>();
  const quizId = Number(quizIdParam);
  const validQuizId = Number.isSafeInteger(quizId) && quizId > 0;
  const [loadState, setLoadState] = useState<{
    quizId: number;
    status: 'loading' | 'success' | 'error';
    review?: QuizHistoryReview;
    error?: string;
  }>({ quizId: Number.NaN, status: 'loading' });
  const [currentIndex, setCurrentIndex] = useState(0);
  const [conversations, setConversations] = useState<
    Record<number, AskAIMessage[]>
  >({});

  useEffect(() => {
    if (!validQuizId) return;

    let cancelled = false;
    quizService
      .getQuizReview(quizId)
      .then((result) => {
        if (cancelled) return;
        setLoadState({ quizId, status: 'success', review: result });
        setCurrentIndex(0);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLoadState({
          quizId,
          status: 'error',
          error: userFacingErrorMessage(
            err,
            "We couldn't load this quiz review. Please try again.",
          ),
        });
      });

    return () => {
      cancelled = true;
    };
  }, [quizId, validQuizId]);

  const currentLoad = loadState.quizId === quizId ? loadState : null;
  const loading =
    validQuizId && (!currentLoad || currentLoad.status === 'loading');
  const review =
    currentLoad?.status === 'success' ? currentLoad.review ?? null : null;
  const visibleError = !validQuizId
    ? 'This quiz review could not be found.'
    : currentLoad?.status === 'error'
      ? currentLoad.error ?? 'Could not load this quiz review.'
      : null;

  if (loading) {
    return (
      <section className={styles.page}>
        <Skeleton height={300} />
      </section>
    );
  }

  if (visibleError || !review || review.questions.length === 0) {
    return (
      <section className={styles.page}>
        <BackButton label="Dashboard" onClick={() => navigate('/home')} />
        <EmptyState
          title="Quiz review unavailable"
          message={visibleError ?? 'This quiz has no questions to review.'}
        />
      </section>
    );
  }

  const question = review.questions[currentIndex];
  const isLast = currentIndex === review.questions.length - 1;
  const verdictClass =
    question.verdict === 'correct'
      ? styles.reviewVerdictCorrect
      : question.verdict === 'wrong'
        ? styles.reviewVerdictWrong
        : styles.reviewVerdictSkipped;

  return (
    <section className={styles.page}>
      <BackButton label="Dashboard" onClick={() => navigate('/home')} />

      <header className={styles.historyHeader}>
        <span className={styles.historyEyebrow}>
          {formatQuizType(review.quiz.type)} ·{' '}
          {new Date(review.quiz.completedAt).toLocaleDateString()}
        </span>
        <h1 className={styles.historyTitle}>Quiz review</h1>
        <p className={styles.historySummary}>
          {review.quiz.correctAnswers} of {review.quiz.totalQuestions} correct
          {' · '}
          {Math.round(review.quiz.score)}%
        </p>
      </header>

      <div
        className={styles.progressTrack}
        role="progressbar"
        aria-label="Quiz review progress"
        aria-valuemin={0}
        aria-valuemax={review.questions.length}
        aria-valuenow={currentIndex + 1}
      >
        <div
          className={styles.progressFill}
          style={{
            width: `${((currentIndex + 1) / review.questions.length) * 100}%`,
          }}
        />
      </div>

      <div className={styles.reviewPager}>
        <button
          type="button"
          className={styles.reviewPagerButton}
          onClick={() => setCurrentIndex((index) => Math.max(0, index - 1))}
          disabled={currentIndex === 0}
        >
          <ArrowLeft size={16} aria-hidden="true" />
          Previous
        </button>
        <span className={styles.reviewPagerCount}>
          Question {currentIndex + 1} of {review.questions.length}
        </span>
        <button
          type="button"
          className={styles.reviewPagerButton}
          onClick={() =>
            setCurrentIndex((index) =>
              Math.min(review.questions.length - 1, index + 1),
            )
          }
          disabled={isLast}
        >
          Next
          <ArrowRight size={16} aria-hidden="true" />
        </button>
      </div>

      <article className={styles.reviewCard}>
        <div className={styles.reviewCardHeader}>
          <span className={styles.qBadge}>Q{currentIndex + 1}</span>
          <span className={`${styles.reviewVerdict} ${verdictClass}`}>
            {question.verdict}
          </span>
        </div>

        <Markdown variant="review-question" className={styles.reviewQuestion}>
          {question.question}
        </Markdown>

        <div className={styles.reviewOptions}>
          {question.options.map((option, optionIndex) => {
            const value =
              question.kind === 'tf' ? option : LETTERS[optionIndex];
            const isSelected = question.userAnswer === value;
            const isCorrect = question.answer === value;
            let className = styles.reviewOption;
            if (isSelected && isCorrect) {
              className += ` ${styles.reviewOptionUserCorrect}`;
            } else if (isSelected) {
              className += ` ${styles.reviewOptionUserWrong}`;
            } else if (isCorrect) {
              className += ` ${styles.reviewOptionShowCorrect}`;
            }

            return (
              <div key={value} className={className}>
                <span className={styles.reviewOptionLetter}>{value}</span>
                <Markdown
                  variant="review-option"
                  className={styles.reviewOptionText}
                >
                  {option}
                </Markdown>
                {isSelected && (
                  <span className={styles.historyAnswerLabel}>
                    Your answer
                  </span>
                )}
              </div>
            );
          })}
        </div>

        <div className={styles.reviewExplanation}>
          {(plan?.premiumExplanations
            ? question.premiumExplanation || question.standardExplanation
            : question.standardExplanation) ? (
            <Markdown variant="explanation">
              {plan?.premiumExplanations
                ? question.premiumExplanation || question.standardExplanation
                : question.standardExplanation}
            </Markdown>
          ) : (
            <span className={styles.reviewExplanationEmpty}>
              No explanation is available for this question yet.
            </span>
          )}
        </div>
        {question.userAnswer === null && (
          <p className={styles.historySkipped}>
            <X size={15} aria-hidden="true" />
            You skipped this question.
          </p>
        )}
        {question.verdict === 'correct' && (
          <p className={styles.historyCorrect}>
            <Check size={15} aria-hidden="true" />
            Your answer was correct.
          </p>
        )}

        <QuizHistoryDiscussion
          key={question.id}
          questionId={question.id}
          quizId={review.quiz.id}
          messages={conversations[question.id] ?? []}
          onMessagesChange={(messages) =>
            setConversations((previous) => ({
              ...previous,
              [question.id]: messages,
            }))
          }
        />
      </article>
    </section>
  );
}

function QuizHistoryDiscussion({
  questionId,
  quizId,
  messages,
  onMessagesChange,
}: {
  questionId: number;
  quizId: number;
  messages: AskAIMessage[];
  onMessagesChange: (messages: AskAIMessage[]) => void;
}) {
  const navigate = useNavigate();
  const { refreshPlan } = useProfile();
  const [showDiscussion, setShowDiscussion] = useState(false);
  const [draft, setDraft] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiQuotaExceeded, setAiQuotaExceeded] = useState(false);

  async function handleAskAI(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const message = draft.trim();
    if (!message || aiLoading) return;

    setAiLoading(true);
    setAiError(null);
    setAiQuotaExceeded(false);
    try {
      const response = await askAI({
        question_id: questionId,
        context: 'quiz_review',
        quiz_id: quizId,
        message,
        history: messages.slice(-8),
      });
      if (!response.ok) {
        const quotaExceeded = response.reason === 'daily_limit';
        setAiQuotaExceeded(quotaExceeded);
        setAiError(getAskAIErrorMessage(response));
        if (quotaExceeded) void refreshPlan();
        return;
      }
      onMessagesChange([
        ...messages,
        { role: 'user', content: message },
        {
          role: 'assistant',
          content: response.answer_markdown || 'Empty answer',
        },
      ]);
      setDraft('');
      void refreshPlan();
    } catch (error) {
      setAiError(
        userFacingErrorMessage(
          error,
          "The AI service couldn't respond. Please try again.",
        ),
      );
    } finally {
      setAiLoading(false);
    }
  }

  return (
    <div className={styles.reviewDiscussion}>
      <button
        type="button"
        className={styles.reviewDiscussionToggle}
        onClick={() => setShowDiscussion((visible) => !visible)}
        aria-expanded={showDiscussion}
      >
        <Sparkles size={16} aria-hidden="true" />
        {showDiscussion ? 'Close discussion' : 'Discuss this question with AI'}
      </button>

      {showDiscussion && (
        <div className={styles.reviewDiscussionPanel}>
          <p className={styles.reviewDiscussionHint}>
            Ask a question or request a deeper explanation. You can follow up in
            this discussion.
          </p>
          {messages.length > 0 && (
            <div className={styles.reviewChat}>
              {messages.map((message, index) => (
                <div
                  key={`${message.role}-${index}`}
                  className={
                    message.role === 'user'
                      ? styles.reviewChatUser
                      : styles.reviewChatAssistant
                  }
                >
                  {message.role === 'assistant' ? (
                    <Markdown variant="explanation">
                      {message.content}
                    </Markdown>
                  ) : (
                    message.content
                  )}
                </div>
              ))}
            </div>
          )}
          {aiError && (
            <p className={styles.reviewDiscussionError} role="alert">
              {aiError}
            </p>
          )}
          {aiQuotaExceeded && (
            <button
              type="button"
              className={styles.reviewDiscussionToggle}
              onClick={() => navigate('/plans')}
            >
              View plans
            </button>
          )}
          <form className={styles.reviewAskForm} onSubmit={handleAskAI}>
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Ask a follow-up about this question..."
              rows={3}
              disabled={aiLoading || aiQuotaExceeded}
              maxLength={500}
            />
            <button
              type="submit"
              className={styles.reviewDiscussionToggle}
              disabled={!draft.trim() || aiLoading || aiQuotaExceeded}
            >
              {aiLoading ? 'Thinking…' : 'Send to AI'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
