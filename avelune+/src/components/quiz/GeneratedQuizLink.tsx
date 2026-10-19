import { Link } from 'react-router-dom';
import { ChevronRight, Sparkles } from 'lucide-react';
import styles from './GeneratedQuizLink.module.css';

interface GeneratedQuizLinkProps {
  subtopicId: number | null | undefined;
  /** Label above the title. */
  label?: string;
  /** Headline shown under the label. */
  title?: string;
  /** Compact single-line variant for list rows. */
  compact?: boolean;
}

/**
 * Entry point into personalized-quiz generation for a subtopic's study note.
 *
 * The actual Plus/Pro gate lives on the setup screen and, authoritatively,
 * on the generate-note-quiz edge function.
 */
export function GeneratedQuizLink({
  subtopicId,
  label = 'Personalized quiz',
  title = 'Generate a quiz from this note',
  compact = false,
}: GeneratedQuizLinkProps) {
  if (!subtopicId) return null;

  return (
    <Link
      className={compact ? styles.linkCompact : styles.link}
      to={`/quiz/generated/new?subtopic=${subtopicId}`}
    >
      <span className={styles.iconWrap}>
        <Sparkles size={compact ? 15 : 18} aria-hidden="true" />
      </span>
      <span className={styles.text}>
        <span className={styles.label}>{label}</span>
        <span className={styles.title}>{title}</span>
      </span>
      <ChevronRight
        size={compact ? 14 : 18}
        className={styles.chevron}
        aria-hidden="true"
      />
    </Link>
  );
}
