import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, BookOpen } from 'lucide-react';
import { blogService, type ConceptPost } from '@/services/blog/blogService';
import { Markdown } from '@/components/ui/Markdown';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageLoader } from '@/components/ui/PageLoader';
import { subjectColor } from '@/utils/subjectColor';
import styles from './BlogPostScreen.module.css';

interface TocItem {
  id: string;
  text: string;
  level: number;
}

const CHUNK_SIZE = 8;

export function BlogPostScreen() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [post, setPost] = useState<ConceptPost | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toc, setToc] = useState<TocItem[]>([]);
  const [visibleChunks, setVisibleChunks] = useState(1);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    blogService
      .getBySlug(slug)
      .then((row) => {
        if (!cancelled) {
          setPost(row);
          if (row?.body) {
            const headers: TocItem[] = [];
            const lines = row.body.split('\n');
            lines.forEach((line) => {
              const match = line.match(/^(#{2,3})\s+(.+)$/);
              if (match) {
                const level = match[1].length;
                const text = match[2].trim();
                const id = text.toLowerCase().replace(/[^a-z0-9]+/g, '-');
                headers.push({ id, text, level });
              }
            });
            setToc(headers);
          }
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load note.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [slug]);

  const paragraphs = useMemo(() => {
    if (!post?.body) return [];
    return post.body.split('\n\n').filter((p) => p.trim().length > 0);
  }, [post?.body]);

  const visibleParagraphs = paragraphs.slice(0, visibleChunks * CHUNK_SIZE);
  const hasMore = visibleParagraphs.length < paragraphs.length;

  useEffect(() => {
    if (loading || !hasMore) return;
    const handleScroll = () => {
      const bottom = window.innerHeight + window.scrollY >= document.body.offsetHeight - 500;
      if (bottom) {
        setVisibleChunks((prev) => prev + 1);
      }
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [loading, hasMore]);

  return (
    <section className={styles.page}>
      <button type="button" className={styles.back} onClick={() => navigate('/notes')}>
        <ArrowLeft size={18} aria-hidden="true" />
        Lesson notes
      </button>

      {loading && <PageLoader text="Loading article..." />}

      {!loading && (error || !post) && (
        <EmptyState
          title={error ? 'Could not load this lesson note' : 'Lesson note not found'}
          message={error ?? 'It may be unpublished or the link is wrong.'}
        />
      )}

      {!loading && post && (
        <div className={styles.articleLayout}>
          {toc.length > 0 && (
            <aside className={styles.toc}>
              <p className={styles.tocLabel}>On this page</p>
              <ol>
                {toc.map((item) => (
                  <li key={item.id} className={item.level === 3 ? styles.tocLevel3 : ''}>
                    {item.text}
                  </li>
                ))}
              </ol>
            </aside>
          )}

          <article className={styles.articleMain}>
            <span className={styles.subject} style={{ color: subjectColor(post.subject).fg }}>
              {post.subject}
            </span>
            <h1 className={styles.title}>{post.title}</h1>
            <div className={styles.rule} />
            
            {visibleParagraphs.map((paragraph, idx) => (
              <Markdown key={idx} variant="article" className={styles.body}>
                {paragraph}
              </Markdown>
            ))}

            {hasMore && (
              <div style={{ padding: '24px 0' }}>
                <PageLoader text="Loading more..." />
              </div>
            )}
            
            {!hasMore && (
              <div className={styles.cta}>
                <h2 className={styles.ctaTitle}>Ready to test your knowledge?</h2>
                <p className={styles.ctaText}>
                  Head over to the Study section to practise questions on {post.subject}.
                </p>
                <button
                  type="button"
                  className={styles.ctaButton}
                  onClick={() => navigate('/study/subject/' + encodeURIComponent(post.subject))}
                >
                  <BookOpen size={18} aria-hidden="true" />
                  Practise {post.subject}
                </button>
              </div>
            )}
          </article>
        </div>
      )}
    </section>
  );
}
