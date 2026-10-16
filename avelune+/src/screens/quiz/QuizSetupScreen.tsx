import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  Play,
  Search,
} from 'lucide-react';
import { useProfile } from '@/context/ProfileContext';
import {
  syllabusService,
  type QuizCurriculumRow,
} from '@/services/syllabus/syllabusService';
import { BackButton } from '@/components/ui/BackButton';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';
import {
  DEFAULT_QUESTION_COUNT,
  QUESTION_OPTIONS,
  isQuizType,
  QUIZ_TYPES,
} from './quizConfig';
import {
  QUIZ_SESSION_KEY,
  QUIZ_REVIEW_KEY,
  isLiveQuizSession,
  quizConfigPath,
  quizSessionPath,
  type QuizPersistedSession,
  type QuizSessionConfig,
} from './quizSession';
import { clearSession, readSession } from '@/utils/sessionStorage';
import styles from './QuizSetupScreen.module.css';

const STEPS = [
  { key: 'course', label: 'Course' },
  { key: 'topic', label: 'Topic' },
  { key: 'subtopic', label: 'Subtopic' },
  { key: 'modules', label: 'Modules' },
  { key: 'settings', label: 'Length' },
] as const;

type SetupStep = (typeof STEPS)[number]['key'];

export function QuizSetupScreen() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { profile, loading: profileLoading } = useProfile();
  const typeParam = params.get('type');
  const type = isQuizType(typeParam) ? typeParam : null;
  const selectedType = QUIZ_TYPES.find((quizType) => quizType.key === type);

  const [curriculumResult, setCurriculumResult] = useState<{
    key: string;
    rows: QuizCurriculumRow[] | null;
    error: string | null;
  } | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [step, setStep] = useState<SetupStep>('course');
  const [course, setCourse] = useState('');
  const [topic, setTopic] = useState('');
  const [subtopic, setSubtopic] = useState('');
  const [moduleIds, setModuleIds] = useState<number[]>([]);
  const [questionCount, setQuestionCount] = useState(DEFAULT_QUESTION_COUNT);
  const [searchText, setSearchText] = useState('');
  const [resumable] = useState<QuizPersistedSession | null>(() => {
    const stored = readSession<QuizPersistedSession>(QUIZ_SESSION_KEY);
    return isLiveQuizSession(stored) ? stored : null;
  });

  const department = profile?.department ?? null;
  const curriculumRequestKey = `${department ?? 'all'}:${retryKey}`;
  const isCurriculumLoaded = curriculumResult?.key === curriculumRequestKey;
  const loading = profileLoading || (!!type && !isCurriculumLoaded);
  const curriculum = isCurriculumLoaded ? curriculumResult?.rows ?? null : null;
  const error = isCurriculumLoaded ? curriculumResult?.error ?? null : null;

  useEffect(() => {
    if (!type) navigate('/quiz', { replace: true });
  }, [type, navigate]);

  useEffect(() => {
    if (!type || profileLoading) return;
    let cancelled = false;

    syllabusService
      .getQuizCurriculum(department)
      .then((rows) => {
        if (cancelled) return;
        setCurriculumResult({
          key: curriculumRequestKey,
          rows,
          error: null,
        });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        console.error('[QUIZ] Load curriculum failed:', err);
        setCurriculumResult({
          key: curriculumRequestKey,
          rows: null,
          error:
            "We couldn't load the curriculum. Check your connection and try again.",
        });
      });

    return () => {
      cancelled = true;
    };
  }, [type, profileLoading, department, curriculumRequestKey]);

  const courses = useMemo(
    () => [...new Set((curriculum ?? []).map((row) => row.courseName))],
    [curriculum],
  );
  const topics = useMemo(
    () =>
      [...new Set(
        (curriculum ?? [])
          .filter((row) => row.courseName === course)
          .map((row) => row.topicName),
      )],
    [curriculum, course],
  );
  const subtopics = useMemo(
    () =>
      [...new Set(
        (curriculum ?? [])
          .filter((row) => row.courseName === course && row.topicName === topic)
          .map((row) => row.subtopicName),
      )],
    [curriculum, course, topic],
  );
  const modules = useMemo(
    () =>
      (curriculum ?? []).filter(
        (row) =>
          row.courseName === course &&
          row.topicName === topic &&
          row.subtopicName === subtopic,
      ),
    [curriculum, course, topic, subtopic],
  );
  const stepIndex = STEPS.findIndex((item) => item.key === step);
  const selectedPath = [
    { key: 'course', label: 'Course', value: course },
    { key: 'topic', label: 'Topic', value: topic },
    { key: 'subtopic', label: 'Subtopic', value: subtopic },
  ].filter((item) => item.value);

  const selectableItems = useMemo(() => {
    const query = searchText.trim().toLocaleLowerCase();
    const names =
      step === 'course' ? courses : step === 'topic' ? topics : subtopics;

    return names.filter((name) => name.toLocaleLowerCase().includes(query));
  }, [step, courses, topics, subtopics, searchText]);

  function chooseCourse(value: string) {
    setCourse(value);
    setTopic('');
    setSubtopic('');
    setModuleIds([]);
    setSearchText('');
    setStep('topic');
  }

  function chooseTopic(value: string) {
    setTopic(value);
    setSubtopic('');
    setModuleIds([]);
    setSearchText('');
    setStep('subtopic');
  }

  function chooseSubtopic(value: string) {
    setSubtopic(value);
    setModuleIds([]);
    setSearchText('');
    setStep('modules');
  }

  function toggleModule(moduleId: number) {
    setModuleIds((selected) =>
      selected.includes(moduleId)
        ? selected.filter((id) => id !== moduleId)
        : [...selected, moduleId],
    );
  }

  function goToStep(nextStep: SetupStep) {
    const nextIndex = STEPS.findIndex((item) => item.key === nextStep);
    if (nextIndex <= stepIndex) {
      setSearchText('');
      setStep(nextStep);
    }
  }

  function continueFromModules() {
    if (moduleIds.length === 0) return;
    setStep('settings');
  }

  const canStart =
    !!type &&
    !!course &&
    !!topic &&
    !!subtopic &&
    moduleIds.length >= 1 &&
    questionCount > 0;

  function handleStart() {
    if (!canStart || !type) return;
    const config: QuizSessionConfig = {
      type,
      course,
      topic,
      subtopic,
      moduleIds,
      questionCount,
    };
    clearSession(QUIZ_REVIEW_KEY);
    navigate(quizConfigPath(config));
  }

  function renderSelection() {
    if (step === 'modules') {
      return (
        <>
          <div className={styles.stepHeading}>
            <h2>Select modules</h2>
            <p>Choose one or more modules for your quiz.</p>
          </div>
          <div className={styles.itemList}>
            {modules.map((module) => {
              const selected = moduleIds.includes(module.moduleId);
              return (
                <button
                  key={module.moduleId}
                  type="button"
                  className={`${styles.moduleItem} ${
                    selected ? styles.itemSelected : ''
                  }`}
                  onClick={() => toggleModule(module.moduleId)}
                  aria-pressed={selected}
                >
                  <span
                    className={`${styles.checkBox} ${
                      selected ? styles.checkBoxSelected : ''
                    }`}
                    aria-hidden="true"
                  >
                    {selected && <Check size={14} strokeWidth={3} />}
                  </span>
                  <span className={styles.itemCopy}>
                    <span className={styles.itemName}>{module.moduleName}</span>
                    <span className={styles.itemMeta}>Module</span>
                  </span>
                </button>
              );
            })}
            {modules.length === 0 && (
              <p className={styles.helpText}>
                There are no modules available in this subtopic yet.
              </p>
            )}
          </div>
          <div className={styles.selectionFooter}>
            <span className={styles.selectionCount}>
              {moduleIds.length} selected
            </span>
            <button
              type="button"
              className={styles.continueButton}
              onClick={continueFromModules}
              disabled={moduleIds.length === 0}
            >
              Continue <ArrowRight size={16} aria-hidden="true" />
            </button>
          </div>
        </>
      );
    }

    const currentTitle =
      step === 'course'
        ? 'Choose a course'
        : step === 'topic'
          ? 'Choose a topic'
          : 'Choose a subtopic';
    const currentDescription =
      step === 'course'
        ? 'Start with the course you want to practice.'
        : step === 'topic'
          ? `Topics in ${course}`
          : `Subtopics in ${topic}`;
    const currentSelection =
      step === 'course' ? course : step === 'topic' ? topic : subtopic;
    const countFor = (name: string) => {
      if (step === 'course') {
        return `${new Set(
          (curriculum ?? [])
            .filter((row) => row.courseName === name)
            .map((row) => row.topicName),
        ).size} topics`;
      }
      if (step === 'topic') {
        return `${new Set(
          (curriculum ?? [])
            .filter((row) => row.courseName === course && row.topicName === name)
            .map((row) => row.subtopicName),
        ).size} subtopics`;
      }
      return `${
        (curriculum ?? []).filter(
          (row) =>
            row.courseName === course &&
            row.topicName === topic &&
            row.subtopicName === name,
        ).length
      } modules`;
    };

    return (
      <>
        <div className={styles.stepHeading}>
          <h2>{currentTitle}</h2>
          <p>{currentDescription}</p>
        </div>
        <label className={styles.searchBox}>
          <Search size={17} aria-hidden="true" />
          <span className={styles.srOnly}>Search {step}s</span>
          <input
            type="search"
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder={`Search ${step}s`}
          />
        </label>
        <div className={styles.itemList}>
          {selectableItems.map((name) => (
            <button
              key={name}
              type="button"
              className={`${styles.choiceItem} ${
                currentSelection === name ? styles.itemSelected : ''
              }`}
              onClick={() => {
                if (step === 'course') chooseCourse(name);
                else if (step === 'topic') chooseTopic(name);
                else chooseSubtopic(name);
              }}
            >
              <span className={styles.itemCopy}>
                <span className={styles.itemName}>{name}</span>
                <span className={styles.itemMeta}>{countFor(name)}</span>
              </span>
              <ChevronRight size={18} aria-hidden="true" />
            </button>
          ))}
          {selectableItems.length === 0 && (
            <p className={styles.noResults}>
              {searchText ? 'No matches. Try a different search.' : 'Nothing to show here yet.'}
            </p>
          )}
        </div>
      </>
    );
  }

  return (
    <section className={styles.page}>
      <BackButton label="Quiz types" onClick={() => navigate('/quiz')} />

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

      <header className={styles.header}>
        <span className={styles.eyebrow}>BUILD YOUR QUIZ</span>
        <h1 className={styles.title}>A focused set, your way.</h1>
        <p className={styles.subtitle}>
          Choose what to study. We&apos;ll select the questions and keep your
          progress.
        </p>
      </header>

      {selectedType && (
        <div className={styles.typeSummary}>
          <span className={styles.typeDot} aria-hidden="true" />
          <span>{selectedType.label}</span>
          <span className={styles.typeSummaryDivider} aria-hidden="true" />
          <span className={styles.typeSummaryCaption}>QUIZ TYPE</span>
        </div>
      )}

      <nav className={styles.stepper} aria-label="Quiz setup progress">
        {STEPS.map((item, index) => {
          const complete = index < stepIndex;
          const active = item.key === step;
          return (
            <button
              key={item.key}
              type="button"
              className={`${styles.step} ${active ? styles.stepActive : ''} ${
                complete ? styles.stepComplete : ''
              }`}
              onClick={() => goToStep(item.key)}
              disabled={index > stepIndex}
              aria-current={active ? 'step' : undefined}
              aria-label={`${index + 1}. ${item.label}${complete ? ', completed' : ''}`}
            >
              <span className={styles.stepNumber}>
                {complete ? <Check size={13} strokeWidth={3} /> : index + 1}
              </span>
              <span className={styles.stepLabel}>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {selectedPath.length > 0 && step !== 'course' && (
        <div className={styles.pathBar} aria-label="Selected curriculum">
          {selectedPath.map((item, index) => (
            <span key={item.key} className={styles.pathSegment}>
              {index > 0 && <ChevronRight size={13} aria-hidden="true" />}
              <button
                type="button"
                onClick={() => goToStep(item.key as SetupStep)}
                aria-label={`Change ${item.label.toLowerCase()}: ${item.value}`}
              >
                {item.value}
              </button>
            </span>
          ))}
        </div>
      )}

      {error && (
        <div className={styles.errorBlock}>
          <p>{error}</p>
          <Button
            variant="secondary"
            fullWidth
            onClick={() => setRetryKey((key) => key + 1)}
          >
            Try again
          </Button>
        </div>
      )}

      {loading && <Skeleton height={320} />}

      {!loading && !error && curriculum?.length === 0 && (
        <div className={styles.empty}>
          No courses match your department in the curriculum yet.
        </div>
      )}

      {!loading && !error && curriculum && curriculum.length > 0 && (
        <main className={styles.selectionCard} key={step}>
          {step === 'settings' ? (
            <>
              <div className={styles.stepHeading}>
                <h2>How long should your quiz be?</h2>
                <p>
                  Pick a question count. Time is one minute per question
                  returned.
                </p>
              </div>
              <div className={styles.lengthGrid}>
                {QUESTION_OPTIONS.map((count) => (
                  <button
                    key={count}
                    type="button"
                    className={`${styles.lengthOption} ${
                      questionCount === count ? styles.lengthOptionSelected : ''
                    }`}
                    onClick={() => setQuestionCount(count)}
                    aria-pressed={questionCount === count}
                  >
                    <span className={styles.lengthNumber}>{count}</span>
                    <span className={styles.lengthLabel}>questions</span>
                    {questionCount === count && (
                      <Check size={15} className={styles.lengthCheck} aria-hidden="true" />
                    )}
                  </button>
                ))}
              </div>
              <div className={styles.reviewSummary}>
                <span>Selected modules</span>
                <strong>{moduleIds.length}</strong>
                <span className={styles.reviewSummaryDivider} />
                <span>Requested questions</span>
                <strong>{questionCount}</strong>
              </div>
              <div className={styles.selectionFooter}>
                <button
                  type="button"
                  className={styles.backStepButton}
                  onClick={() => setStep('modules')}
                >
                  <ArrowLeft size={16} aria-hidden="true" /> Back
                </button>
                <button
                  type="button"
                  className={styles.continueButton}
                  onClick={handleStart}
                  disabled={!canStart}
                >
                  Start quiz <ArrowRight size={16} aria-hidden="true" />
                </button>
              </div>
            </>
          ) : (
            renderSelection()
          )}
        </main>
      )}
    </section>
  );
}
