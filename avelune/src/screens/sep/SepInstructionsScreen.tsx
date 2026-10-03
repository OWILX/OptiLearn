import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check } from 'lucide-react';
import styles from './SepInstructionsScreen.module.css';

interface SepConfig {
  subjects: string[];
  timeLimitMinutes: number;
}

function parseConfig(params: URLSearchParams): SepConfig | null {
  const subjectsRaw = params.get('subjects');
  const timeRaw = params.get('time');
  if (!subjectsRaw || !timeRaw) return null;

  const subjects = subjectsRaw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const time = Number(timeRaw);

  if (subjects.length !== 4) return null;
  if (!Number.isFinite(time) || time <= 0 || time > 600) return null;

  return { subjects, timeLimitMinutes: time };
}

export function SepInstructionsScreen() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const config = parseConfig(params);

  useEffect(() => {
    if (!config) navigate('/sep', { replace: true });
  }, [config, navigate]);

  if (!config) return null;

  const query = new URLSearchParams({
    subjects: config.subjects.join(','),
    time: String(config.timeLimitMinutes),
  }).toString();

  return (
    <section className={styles.page}>
      <button
        type="button"
        className={styles.backButton}
        onClick={() => navigate(`/sep?${query}`)}
      >
        <ArrowLeft size={16} aria-hidden="true" />
        Edit setup
      </button>

      <div className={styles.header}>
        <h1 className={styles.title}>Ready to begin</h1>
        <p className={styles.subtitle}>
          Review your exam setup and the rules below. The timer starts the
          moment you tap Start exam.
        </p>
      </div>

      <div className={styles.summaryCard}>
        <div className={styles.summaryRow}>
          <span className={styles.summaryRowLabel}>Subjects</span>
          <span className={styles.summaryRowValue}>
            {config.subjects.join(' · ')}
          </span>
        </div>
        <div className={styles.summaryRow}>
          <span className={styles.summaryRowLabel}>Questions</span>
          <span className={styles.summaryRowValue}>180 total</span>
        </div>
        <div className={styles.summaryRow}>
          <span className={styles.summaryRowLabel}>Time limit</span>
          <span className={styles.summaryRowValue}>
            {config.timeLimitMinutes} minutes
          </span>
        </div>
      </div>

      <div className={styles.rulesCard}>
        <span className={styles.rulesTitle}>Before you start</span>
        <ul className={styles.rulesList}>
          <Rule>Answer every question you can — unanswered questions count as wrong.</Rule>
          <Rule>You can move between questions and revisit answers before submitting.</Rule>
          <Rule>Your answers save automatically as you go.</Rule>
          <Rule>When the timer runs out, your exam submits automatically.</Rule>
          <Rule>You'll see a full review with explanations after you submit.</Rule>
        </ul>
      </div>

      <button
        type="button"
        className={styles.startButton}
        onClick={() => navigate(`/sep/exam?${query}`)}
      >
        Start exam
        <ArrowRight size={18} aria-hidden="true" />
      </button>
    </section>
  );
}

interface RuleProps {
  children: React.ReactNode;
}

function Rule({ children }: RuleProps) {
  return (
    <li className={styles.rule}>
      <Check size={16} className={styles.ruleIcon} aria-hidden="true" />
      <span>{children}</span>
    </li>
  );
}
