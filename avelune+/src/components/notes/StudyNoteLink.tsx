import { useEffect, useState } from 'react';
import { BookOpen, ExternalLink } from 'lucide-react';
import {
  notesLinkService,
  studyNoteUrl,
  type StudyNoteLink as StudyNoteLinkData,
} from '@/services/notes/notesLinkService';
import styles from './StudyNoteLink.module.css';

interface StudyNoteLinkProps {
  subtopicId: number | null | undefined;
  /** Label above the link. */
  label?: string;
  /** Shown when no note exists yet, if set. */
  emptyMessage?: string;
  /** Compact single-line variant for list rows. */
  compact?: boolean;
}

/**
 * Links a curriculum subtopic to its published study note.
 *
 * The note lives on the same origin under /study-notes, so this is a plain
 * anchor (full page navigation) rather than a router link.
 */
export function StudyNoteLink({
  subtopicId,
  label = 'Study note',
  emptyMessage,
  compact = false,
}: StudyNoteLinkProps) {
  // Track which subtopic the result belongs to so "loading" is derived
  // rather than set synchronously inside the effect.
  const [result, setResult] = useState<{
    subtopicId: number;
    note: StudyNoteLinkData | null;
  } | null>(null);

  useEffect(() => {
    if (!subtopicId) return;
    let cancelled = false;
    notesLinkService
      .getNoteForSubtopic(subtopicId)
      .then((row) => {
        if (!cancelled) setResult({ subtopicId, note: row });
      })
      .catch((err: unknown) => {
        // The link is an extra: never block the reader on it.
        console.error('[NOTES] Note lookup failed:', err);
        if (!cancelled) setResult({ subtopicId, note: null });
      });
    return () => {
      cancelled = true;
    };
  }, [subtopicId]);

  const loading = !!subtopicId && result?.subtopicId !== subtopicId;
  const note = result?.subtopicId === subtopicId ? result.note : null;

  if (loading || !note) {
    if (!emptyMessage) return null;
    return (
      <p className={compact ? styles.emptyCompact : styles.empty}>
        {loading ? 'Checking for a study note…' : emptyMessage}
      </p>
    );
  }

  return (
    <a
      className={compact ? styles.linkCompact : styles.link}
      href={studyNoteUrl(note.slug)}
    >
      <span className={styles.iconWrap}>
        <BookOpen size={compact ? 15 : 18} aria-hidden="true" />
      </span>
      <span className={styles.text}>
        <span className={styles.label}>{label}</span>
        <span className={styles.title}>{note.title}</span>
      </span>
      <ExternalLink
        size={compact ? 13 : 15}
        className={styles.external}
        aria-hidden="true"
      />
    </a>
  );
}
