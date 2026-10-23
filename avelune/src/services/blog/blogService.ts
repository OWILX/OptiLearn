import { supabase } from '@/lib/supabase';
import { wrapError } from '@/utils/errors';

export interface ConceptPostListItem {
  id: number;
  subject: string;
  title: string;
  slug: string;
  excerpt: string;
  publishedAt: string | null;
}

export interface ConceptPost extends ConceptPostListItem {
  body: string;
}

interface PostRow {
  id: number;
  subject: string;
  title: string;
  slug: string;
  excerpt: string | null;
  body?: string | null;
  published_at: string | null;
}

function toListItem(row: PostRow): ConceptPostListItem {
  return {
    id: row.id,
    subject: row.subject,
    title: row.title,
    slug: row.slug,
    excerpt: (row.excerpt ?? '').trim(),
    publishedAt: row.published_at,
  };
}

export const blogService = {
  async listPublished(
    department?: any, // Kept for compatibility with existing screens, but ignored
    subject?: string | null,
  ): Promise<ConceptPostListItem[]> {
    let query = supabase
      .from('concept_posts')
      .select('id, subject, title, slug, excerpt, published_at')
      .eq('published', true)
      .order('published_at', { ascending: false });

    if (subject) query = query.eq('subject', subject);

    const { data, error } = await query;
    if (error) throw wrapError(error, 'Could not load concept posts.');

    // No department filtering applied
    return ((data ?? []) as PostRow[]).map(toListItem);
  },

  async getBySlug(slug: string): Promise<ConceptPost | null> {
    const { data, error } = await supabase
      .from('concept_posts')
      .select('id, subject, title, slug, excerpt, body, published_at')
      .eq('slug', slug)
      .eq('published', true)
      .maybeSingle();

    if (error) throw wrapError(error, 'Could not load this lesson note.');
    if (!data) return null;
    const row = data as PostRow;
    return { ...toListItem(row), body: (row.body ?? '').trim() };
  },
};
