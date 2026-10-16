import { supabase } from '@/lib/supabase';
import { wrapError } from '@/utils/errors';
import { filterSubjectsByDepartment } from '@/constants/departments';
import type { Department } from '@/services/profile/profileService';

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
    department: Department | null,
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

    const rows = ((data ?? []) as PostRow[]).map(toListItem);
    const allowed = new Set(
      filterSubjectsByDepartment(
        Array.from(new Set(rows.map((r) => r.subject))),
        department,
      ),
    );
    return rows.filter((r) => allowed.has(r.subject));
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
