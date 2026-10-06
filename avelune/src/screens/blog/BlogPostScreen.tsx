import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, BookOpen } from 'lucide-react';
import { blogService, type ConceptPost } from '@/services/blog/blogService';
import { Markdown } from '@/components/ui/Markdown';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { subjectColor } from '@/utils/subjectColor';
import styles from './BlogPostScreen.module.css';

export function BlogPostScreen() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [post, setPost] = useState<ConceptPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    blogService
      .getBySlug(slug)
      .then((row) => {
        if (!cancelled) setPost(row);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(
          err instanceof Error ? err.message : 'Could not load this lesson note.',
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  return (
    <section className={styles.page}>
      <button
        type="button"
        className={styles.back}
        onClick={() => navigate('/notes')}
      >
        <ArrowLeft size={18} aria-hidden="true" />
        Lesson notes
      </button>

      {loading && (
        <>
          <Skeleton height={28} />
          <Skeleton height={240} />
        </>
      )}

      {!loading && (error || !post) && (
        <EmptyState
          title={error ? 'Could not load this lesson note' : 'Lesson note not found'}
          message={error ?? 'It may be unpublished or the link is wrong.'}
        />
      )}

      {!loading && post && (
        <article className={styles.article}>
          <span
            className={styles.subject}
            style={{ color: subjectColor(post.subject).fg }}
          >
            {post.subject}
          </span>
          <h1 className={styles.title}>{post.title}</h1>
          <Markdown variant="article" className={styles.body}>{post.body}</Markdown>
          <button
            type="button"
            className={styles.practise}
            onClick={() =>
              navigate('/study/subject/' + encodeURIComponent(post.subject))
            }
          >
            <BookOpen size={18} aria-hidden="true" />
            Practise {post.subject}
          </button>
        </article>
      )}
    </section>
  );
}
