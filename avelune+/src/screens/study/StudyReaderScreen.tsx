import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  Flag,
  Sparkles,
  BookOpen,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useProfile } from '@/context/ProfileContext';
import {
  questionService,
  type StudyQuestion,
} from '@/services/questions/questionService';
import {
  getAskAIErrorMessage,
  type AskAIMessage,
} from '@/services/ai/askAi';
import { progressService } from '@/services/progress/progressService';
import { streakService } from '@/services/streaks/streakService';
import {
  syllabusService,
  type SyllabusRow,
} from '@/services/syllabus/syllabusService';
import { BackButton } from '@/components/ui/BackButton';
import { Button } from '@/components/ui/Button';
import { Markdown } from '@/components/ui/Markdown';
import { askAI } from '@/services/ai/askAi';
import {
  questionReportService,
  type QuestionReportType,
} from '@/services/questions/questionReportService';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';
import { DailyPlanQuotaError } from '@/services/plans/planService';
import { userFacingErrorMessage } from '@/utils/errors';
import styles from './StudyReaderScreen.module.css';

const LETTERS = ['A', 'B', 'C', 'D'] as const;

type Stage = 'question' | 'options' | 'explanation';

const REPORT_TYPES: { value: QuestionReportType; label: string }[] = [
  { value: 'question', label: 'Question content' },
  { value: 'answer', label: 'Answer' },
  { value: 'explanation', label: 'Explanation' },
  { value: 'other', label: 'Other feedback' },
];

function AskBox({
  disabled,
  onSend,
}: {
  disabled: boolean;
  onSend: (text: string) => void;
}) {
  const [text, setText] = useState('');
  return (
    <div style={{ marginTop: 12 }}>
      <textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder="Ask something about this question..."
        maxLength={500}
        rows={3}
        disabled={disabled}
        autoCorrect="off"
        spellCheck={false}
        style={{
          width: '100%',
          resize: 'vertical',
          boxSizing: 'border-box',
          padding: 10,
          borderRadius: 10,
          border: '1px solid rgba(128, 128, 128, 0.35)',
          font: 'inherit',
        }}
      />
      <button
        type="button"
        className={styles.aiButton}
        onClick={() => onSend(text)}
        disabled={!text.trim() || disabled}
        style={{ marginTop: 8 }}
      >
        {disabled ? 'Thinking…' : 'Send'}
      </button>
    </div>
  );
}

export function StudyReaderScreen() {
  const { syllabusId: syllabusIdParam } = useParams<{ syllabusId: string }>();
  const syllabusId = Number(syllabusIdParam);
  const navigate = useNavigate();
  const { user } = useAuth();
  const { plan, refreshPlan } = useProfile();

  const [syllabus, setSyllabus] = useState<SyllabusRow | null>(null);
  const [questions, setQuestions] = useState<StudyQuestion[] | null>(null);
  const [hasMoreQuestions, setHasMoreQuestions] = useState(false);
  const [questionsSyllabusId, setQuestionsSyllabusId] = useState<number | null>(
    null,
  );
  const [currentIndex, setCurrentIndex] = useState(0);
  const [stage, setStage] = useState<Stage>('question');
  const [showEnd, setShowEnd] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [studyQuotaExceeded, setStudyQuotaExceeded] = useState(false);
  const [viewedQuestionId, setViewedQuestionId] = useState<number | null>(null);
  const [viewError, setViewError] = useState<{
    questionId: number;
    message: string;
  } | null>(null);
  const [viewRetryKey, setViewRetryKey] = useState(0);
  const [retryKey, setRetryKey] = useState(0);
  const [aiMessages, setAiMessages] = useState<AskAIMessage[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiQuotaExceeded, setAiQuotaExceeded] = useState(false);
  const [showAiInput, setShowAiInput] = useState(false);
  const [showReportDialog, setShowReportDialog] = useState(false);
  const [reportType, setReportType] = useState<QuestionReportType>('question');
  const [reportDescription, setReportDescription] = useState('');
  const [reportError, setReportError] = useState<string | null>(null);
  const [reportSuccess, setReportSuccess] = useState(false);
  const [submittingReport, setSubmittingReport] = useState(false);

  const hasRecordedInitial = useRef(false);
  const aiRequestId = useRef(0);
  const isPremium = plan?.premiumExplanations === true;
  useBodyScrollLock(showReportDialog);

  useEffect(() => {
    if (!showReportDialog) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !submittingReport) {
        setShowReportDialog(false);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showReportDialog, submittingReport]);

  async function handleAskAI(raw: string) {
    const message = raw.trim();
    const question = questions?.[currentIndex];
    if (!question || !message || aiLoading) return;

    const requestId = ++aiRequestId.current;
    const history = aiMessages.slice(-8);
    setAiLoading(true);
    setAiQuotaExceeded(false);
    setAiError('Sending…');
    try {
      const result = await askAI({
        question_id: question.id,
        context: 'study',
        syllabus_id: syllabusId,
        message,
        history,
      });
      if (requestId !== aiRequestId.current) return;
      if (!result.ok) {
        const quotaExceeded = result.reason === 'daily_limit';
        setAiQuotaExceeded(quotaExceeded);
        setAiError(getAskAIErrorMessage(result));
        if (quotaExceeded) void refreshPlan();
        return;
      }
      setAiError(null);
      setAiMessages([
        ...history,
        { role: 'user', content: message },
        {
          role: 'assistant',
          content: result.answer_markdown || 'Empty answer',
        },
      ]);
      void refreshPlan();
    } catch (err) {
      if (requestId !== aiRequestId.current) return;
      setAiError(
        userFacingErrorMessage(
          err,
          "The AI service couldn't respond. Please try again.",
        ),
      );
    } finally {
      if (requestId === aiRequestId.current) setAiLoading(false);
    }
  }

  async function handleSubmitReport() {
    const question = questions?.[currentIndex];
    if (submittingReport) return;
    if (!user) {
      setReportError('Please sign in to send feedback.');
      return;
    }
    if (!question) {
      setReportError('This question could not be identified. Please try again.');
      return;
    }

    setSubmittingReport(true);
    setReportError(null);
    try {
      await questionReportService.create({
        userId: user.id,
        questionId: question.id,
        reportType,
        description: reportDescription,
      });
      setReportSuccess(true);
      setReportDescription('');
    } catch (err) {
      setReportError(
        userFacingErrorMessage(
          err,
          "We couldn't submit your feedback. Please try again.",
        ),
      );
    } finally {
      setSubmittingReport(false);
    }
  }

  useEffect(() => {
    aiRequestId.current += 1;
    setStage('question');
    setAiMessages([]);
    setAiError(null);
    setAiQuotaExceeded(false);
    setAiLoading(false);
    setShowAiInput(false);
    window.scrollTo(0, 0);
  }, [currentIndex]);

  useEffect(() => {
    if (!user || !Number.isFinite(syllabusId)) return;
    let cancelled = false;

    setLoading(true);
    setError(null);
    setStudyQuotaExceeded(false);
    hasRecordedInitial.current = false;

    Promise.all([
      syllabusService.getById(syllabusId),
      questionService.getStudyQuestions(syllabusId),
      progressService.getTopicProgress(user.id, syllabusId),
    ])
      .then(([syl, questionResult, prog]) => {
        if (cancelled) return;
        setSyllabus(syl);

        if (!syl || questionResult.questions.length === 0) {
          setQuestions(questionResult.questions);
          setHasMoreQuestions(questionResult.hasMore);
          return;
        }
        void refreshPlan();

        hasRecordedInitial.current = !prog;
        setQuestions(questionResult.questions);
        setHasMoreQuestions(questionResult.hasMore);
        setQuestionsSyllabusId(syllabusId);
        setCurrentIndex(0);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setStudyQuotaExceeded(err instanceof DailyPlanQuotaError);
        setError(
          userFacingErrorMessage(
            err,
            "We couldn't load this topic. Check your connection and try again.",
          ),
        );
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user, syllabusId, retryKey, refreshPlan]);

  useEffect(() => {
    const question = questions?.[currentIndex];
    if (!user || !question || questionsSyllabusId !== syllabusId) return;
    let cancelled = false;

    questionService
      .markStudyQuestionViewed(syllabusId, question.id)
      .then(() => {
        if (cancelled) return;
        setViewedQuestionId(question.id);
        setViewError(null);
        setStudyQuotaExceeded(false);
        void refreshPlan();

        if (hasRecordedInitial.current) {
          hasRecordedInitial.current = false;
          progressService
            .recordTopicProgress(
              user.id,
              syllabusId,
              currentIndex + 1,
              questions.length + (hasMoreQuestions ? 1 : 0),
            )
            .catch((err) => {
              console.error('[STUDY] Initial progress write failed:', err);
            });
        } else if (
          !hasMoreQuestions &&
          currentIndex === questions.length - 1
        ) {
          progressService
            .recordTopicProgress(user.id, syllabusId, questions.length, questions.length)
            .catch((err) => {
              console.error('[STUDY] Completion write failed:', err);
            });
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const quotaExceeded = err instanceof DailyPlanQuotaError;
        setStudyQuotaExceeded(quotaExceeded);
        setViewError({
          questionId: question.id,
          message: userFacingErrorMessage(
            err,
            "We couldn't record this question view. Please try again.",
          ),
        });
        if (quotaExceeded) void refreshPlan();
      });

    return () => {
      cancelled = true;
    };
  }, [
    user,
    syllabusId,
    questions,
    questionsSyllabusId,
    hasMoreQuestions,
    currentIndex,
    viewRetryKey,
    refreshPlan,
  ]);

  function goNext() {
    if (!user || !questions) return;
    const isLast = currentIndex >= questions.length - 1;

    if (isLast) {
      setShowEnd(true);
      streakService.bumpStreak().catch((err) => {
        console.error('[STUDY] Failed to bump streak:', err);
      });
      return;
    }

    const nextIndex = currentIndex + 1;
    setCurrentIndex(nextIndex);
    progressService
      .recordTopicProgress(
        user.id,
        syllabusId,
        currentIndex + 1,
        questions.length + (hasMoreQuestions ? 1 : 0),
      )
      .catch((err) => {
        console.error('[STUDY] Progress write failed:', err);
      });
  }

  function goPrev() {
    if (currentIndex <= 0) return;
    setCurrentIndex(currentIndex - 1);
  }

  function backToModuleList() {
    if (syllabus) {
      navigate(
        `/study/subtopic/${encodeURIComponent(syllabus.courseName)}/${encodeURIComponent(syllabus.topicName)}/${encodeURIComponent(syllabus.subtopicName)}`,
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
        <BackButton label="Back to Study" onClick={() => navigate('/study')} />
        <div className={styles.error}>{error}</div>
        <Button
          variant="secondary"
          fullWidth
          onClick={() => setRetryKey((k) => k + 1)}
        >
          Try again
        </Button>
        {studyQuotaExceeded && (
          <Button
            variant="primary"
            fullWidth
            onClick={() => navigate('/plans')}
          >
            View plans
          </Button>
        )}
      </section>
    );
  }

  if (!syllabus || !questions || questions.length === 0) {
    return (
      <section className={styles.page}>
        <BackButton
          label={syllabus?.subtopicName ?? 'Back to Study'}
          onClick={backToModuleList}
        />
        {syllabus && (
          <>
            <div className={styles.moduleHeading}>
              <span>{syllabus.courseName} · {syllabus.topicName}</span>
              <h1>{syllabus.moduleName}</h1>
            </div>
            {syllabus.content?.trim() && (
              <article className={styles.moduleContent}>
                <Markdown variant="explanation" className={styles.explanationBody}>
                  {syllabus.content}
                </Markdown>
              </article>
            )}
            {syllabus.objectives?.trim() && (
              <article className={styles.moduleContent}>
                <h2 className={styles.moduleContentTitle}>Learning objectives</h2>
                <Markdown variant="explanation" className={styles.explanationBody}>
                  {syllabus.objectives}
                </Markdown>
              </article>
            )}
          </>
        )}
        {syllabus && !syllabus.content?.trim() && !syllabus.objectives?.trim() ? (
          <EmptyState
            icon={<BookOpen size={24} aria-hidden="true" />}
            title="No module content yet"
            message="This module has no lesson content or practice questions yet."
          />
        ) : syllabus ? (
          <EmptyState
            icon={<BookOpen size={24} aria-hidden="true" />}
            title="No practice questions yet"
            message="This module has lesson content but no practice questions in the bank yet."
          />
        ) : (
          <EmptyState
            icon={<BookOpen size={24} aria-hidden="true" />}
            title="Module not found"
            message="This module is no longer available in the curriculum."
          />
        )}
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
          <h2 className={styles.endTitle}>Study session complete</h2>
          <p className={styles.endText}>
            You&apos;ve reached the end of the questions available in this study
            session for &quot;{syllabus.moduleName}&quot;.
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
              onClick={backToModuleList}
            >
              Back to modules
            </button>
          </div>
        </div>
      </section>
    );
  }

  const current = questions[currentIndex];
  if (viewError?.questionId === current.id) {
    return (
      <section className={styles.page}>
        <BackButton label={syllabus.subtopicName} onClick={backToModuleList} />
        <div className={styles.error} role="alert">
          {viewError.message}
        </div>
        {studyQuotaExceeded ? (
          <Button
            variant="primary"
            fullWidth
            onClick={() => navigate('/plans')}
          >
            View plans
          </Button>
        ) : (
          <Button
            variant="secondary"
            fullWidth
            onClick={() => {
              setViewError(null);
              setViewRetryKey((key) => key + 1);
            }}
          >
            Try again
          </Button>
        )}
      </section>
    );
  }

  if (viewedQuestionId !== current.id) {
    return (
      <section className={styles.page}>
        <BackButton label={syllabus.subtopicName} onClick={backToModuleList} />
        <Skeleton height={300} />
      </section>
    );
  }

  const isFirst = currentIndex === 0;
  const isLast = currentIndex >= questions.length - 1;
  const displayPct = Math.round(((currentIndex + 1) / questions.length) * 100);

  const explanation = current.explanation;

  return (
    <section className={styles.page}>
      <div className={styles.topBar}>
        <BackButton label={syllabus.subtopicName} onClick={backToModuleList} />
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

      {(syllabus.content?.trim() || syllabus.objectives?.trim()) && (
        <article className={styles.moduleContent}>
          <h1 className={styles.moduleTitle}>{syllabus.moduleName}</h1>
          {syllabus.content?.trim() && (
            <Markdown variant="explanation" className={styles.explanationBody}>
              {syllabus.content}
            </Markdown>
          )}
          {syllabus.objectives?.trim() && (
            <div>
              <h2 className={styles.moduleContentTitle}>Learning objectives</h2>
              <Markdown variant="explanation" className={styles.explanationBody}>
                {syllabus.objectives}
              </Markdown>
            </div>
          )}
        </article>
      )}

      <article className={styles.questionCard}>
        <div className={styles.questionHeader}>
          <span className={styles.qBadge}>Q{currentIndex + 1}</span>
          {isPremium && (
            <span className={styles.premiumBadge}>
              <Sparkles size={11} aria-hidden="true" />
              Premium
            </span>
          )}
        </div>
        <Markdown variant="question" className={styles.questionText}>{current.question}</Markdown>
        <button
          type="button"
          className={styles.reportButton}
          onClick={() => {
            setReportType('question');
            setReportDescription('');
            setReportError(null);
            setReportSuccess(false);
            setShowReportDialog(true);
          }}
        >
          <Flag size={15} aria-hidden="true" />
          Report or give feedback
        </button>
      </article>

      <div
        className={`${styles.revealPanel} ${stage !== 'question' ? styles.revealPanelOpen : ''}`}
        aria-hidden={stage === 'question'}
        inert={stage === 'question'}
      >
        <div className={styles.revealPanelInner}>
          <div className={styles.optionsSlide} key={`opts-${currentIndex}`}>
            <div className={styles.options}>
              {current.options.map((opt, i) => {
                const label =
                  current.kind === 'tf'
                    ? opt === 'True'
                      ? 'T'
                      : 'F'
                    : LETTERS[i];
                const isCorrect =
                  stage === 'explanation' &&
                  (current.kind === 'tf'
                    ? opt === current.answer
                    : label === current.answer);
                return (
                  <div
                    key={opt}
                    className={`${styles.option} ${isCorrect ? styles.optionCorrect : ''}`}
                  >
                    <span className={styles.optionLetter}>{label}</span>
                    <Markdown variant="option" className={styles.optionText}>
                      {opt}
                    </Markdown>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div
        className={`${styles.revealPanel} ${stage === 'explanation' ? styles.revealPanelOpen : ''}`}
        aria-hidden={stage !== 'explanation'}
        inert={stage !== 'explanation'}
      >
        <div className={styles.revealPanelInner}>
          <article className={styles.explanationCard} key={`expl-${currentIndex}`}>
            <div className={styles.explanationHeader}>
              <span className={styles.explanationTitle}>
                {isPremium ? 'Premium explanation' : 'Explanation'}
              </span>
            </div>
            {explanation ? (
              <Markdown variant="explanation" className={styles.explanationBody}>
                {explanation}
              </Markdown>
            ) : (
              <p className={styles.explanationEmpty}>
                No explanation is available for this question yet.
              </p>
            )}
            <div className={styles.aiRow}>
              <button
                type="button"
                className={styles.aiButton}
                onClick={() => {
                  setShowAiInput((visible) => !visible);
                  setAiError(null);
                }}
                disabled={aiLoading}
              >
                <Sparkles size={14} aria-hidden="true" />
                {showAiInput ? 'Close' : 'Ask AI'}
              </button>

              {!showAiInput && aiMessages.length === 0 && !aiError && (
                <span className={styles.aiHint}>Ask about this question</span>
              )}
            </div>

            {showAiInput && (
              <AskBox
                key={aiMessages.length}
                disabled={aiLoading || aiQuotaExceeded}
                onSend={handleAskAI}
              />
            )}

            {aiError && (
              <p className={styles.aiHint} role="status" style={{ marginTop: 8 }}>
                {aiError}
              </p>
            )}

            {aiQuotaExceeded && (
              <button
                type="button"
                className={styles.aiButton}
                onClick={() => navigate('/plans')}
              >
                View plans
              </button>
            )}

            {aiMessages.length > 0 && (
              <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
                {aiMessages.map((item, index) => (
                  <div key={`${item.role}-${index}`}>
                    <span className={styles.aiHint}>
                      {item.role === 'user' ? 'You' : 'Avelune AI'}
                    </span>
                    <Markdown
                      variant="explanation"
                      className={styles.explanationBody}
                    >
                      {item.content}
                    </Markdown>
                  </div>
                ))}
              </div>
            )}
          </article>
        </div>
      </div>

      <div className={styles.revealRow}>
        {stage === 'question' && (
          <button
            type="button"
            className={styles.revealButton}
            onClick={() => setStage('options')}
          >
            <Eye size={16} aria-hidden="true" />
            Show options
          </button>
        )}

        {stage === 'options' && (
          <button
            type="button"
            className={styles.revealButton}
            onClick={() => setStage('explanation')}
          >
            <Eye size={16} aria-hidden="true" />
            Reveal answer
          </button>
        )}

        {stage === 'explanation' && (
          <button
            type="button"
            className={styles.revealButtonSecondary}
            onClick={() => setStage('question')}
          >
            <EyeOff size={16} aria-hidden="true" />
            Hide options
          </button>
        )}
      </div>

      {showReportDialog && (
        <div
          className={styles.reportOverlay}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !submittingReport) {
              setShowReportDialog(false);
            }
          }}
        >
          <div
            className={styles.reportDialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="report-title"
          >
            <h2 id="report-title" className={styles.reportTitle}>
              {reportSuccess ? 'Feedback sent' : 'Report this question'}
            </h2>
            {reportSuccess ? (
              <>
                <p className={styles.reportDescription}>
                  Thanks for helping us improve this question.
                </p>
                <button
                  type="button"
                  className={styles.reportSubmit}
                  onClick={() => setShowReportDialog(false)}
                >
                  Done
                </button>
              </>
            ) : (
              <>
                <p className={styles.reportDescription}>
                  What would you like us to review?
                </p>
                <fieldset className={styles.reportTypes}>
                  <legend className={styles.srOnly}>Feedback type</legend>
                  {REPORT_TYPES.map((type) => (
                    <label key={type.value} className={styles.reportType}>
                      <input
                        type="radio"
                        name="reportType"
                        value={type.value}
                        checked={reportType === type.value}
                        onChange={() => setReportType(type.value)}
                        autoFocus={type.value === reportType}
                      />
                      <span>{type.label}</span>
                    </label>
                  ))}
                  </fieldset>
                  <label
                    className={styles.reportFieldLabel}
                    htmlFor="report-details"
                  >
                  Details <span>(optional)</span>
                </label>
                <textarea
                  id="report-details"
                  className={styles.reportTextarea}
                  value={reportDescription}
                  onChange={(event) => setReportDescription(event.target.value)}
                  placeholder="Tell us what seems wrong or how we can improve it."
                  maxLength={2000}
                  rows={4}
                  disabled={submittingReport}
                />
                {reportError && (
                  <p className={styles.reportError} role="alert">
                    {reportError}
                  </p>
                )}
                <div className={styles.reportActions}>
                  <button
                    type="button"
                    className={styles.reportCancel}
                    onClick={() => setShowReportDialog(false)}
                    disabled={submittingReport}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className={styles.reportSubmit}
                    onClick={handleSubmitReport}
                    disabled={submittingReport}
                  >
                    {submittingReport ? 'Sending…' : 'Send feedback'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
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
