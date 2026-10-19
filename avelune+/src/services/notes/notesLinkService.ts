import { supabase } from '@/lib/supabase';
import { wrapError } from '@/utils/errors';

/**
 * Bridge between the curriculum (`public.syllabus`) and the static study
 * notes (`public.pages` -> /study-notes).
 *
 * Each generated page belongs to exactly one subtopic, so a module row in
 * the app can always be traced back to its published note.
 */

/** Path the notes site is built under (see `npm run build:notes`). */
export const STUDY_NOTES_BASE_PATH = '/study-notes';

export interface StudyNoteLink {
  slug: string;
  title: string;
  subtopicId: number;
}

/** Absolute path to a note on this origin. */
export function studyNoteUrl(slug: string): string {
  return `${STUDY_NOTES_BASE_PATH}/articles/${encodeURIComponent(slug)}/`;
}

/** Index page of the notes site. */
export const STUDY_NOTES_INDEX_URL = `${STUDY_NOTES_BASE_PATH}/`;

interface PageRow {
  slug: string;
  title: string;
  subtopic_id: number;
}

export const notesLinkService = {
  /**
   * The published note for a subtopic, or null when none exists yet.
   *
   * Only `status = 'published'` rows are readable through RLS, so a draft
   * page simply looks like "no note" here.
   */
  async getNoteForSubtopic(subtopicId: number): Promise<StudyNoteLink | null> {
    const { data, error } = await supabase
      .from('pages')
      .select('slug, title, subtopic_id')
      .eq('subtopic_id', subtopicId)
      .eq('status', 'published')
      .maybeSingle();

    if (error) throw wrapError(error, 'Could not look up the study note.');
    if (!data) return null;

    const row = data as PageRow;
    return {
      slug: row.slug,
      title: row.title,
      subtopicId: row.subtopic_id,
    };
  },
};
