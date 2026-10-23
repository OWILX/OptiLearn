import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, Search } from 'lucide-react';
import { useProfile } from '@/context/ProfileContext';
import { blogService, type ConceptPostListItem } from '@/services/blog/blogService';
import { subjectColor } from '@/utils/subjectColor';
import { EmptyState } from '@/components/ui/EmptyState';
import { PageLoader } from '@/components/ui/PageLoader';
import { Button } from '@/components/ui/Button';
import styles from './BlogListScreen.module.css';

const BATCH_SIZE = 12;

export function BlogListScreen() {
  const navigate = useNavigate();
  const { profile, loading: profileLoading } = useProfile();
  
  const [posts, setPosts] = useState<ConceptPostListItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [visibleCount, setVisibleCount] = useState(BATCH_SIZE);
  const [retryKey, setRetryKey] = useState(0);

  const department = profile?.department ?? null;

  useEffect(() => {
    setVisibleCount(BATCH_SIZE);
  }, [search]);

  useEffect(() => {
    if (profileLoading) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    blogService
      .listPublished(department)
      .then((rows) => {
        if (!cancelled) setPosts(rows);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Could not load notes.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [department, profileLoading, retryKey]);

  const filtered = (posts ?? []).filter((p) => {
    if (!search) return true;
    const term = search.toLowerCase();
    return (p.title || '').toLowerCase().includes(term) || (p.subject || '').toLowerCase().includes(term);
  });

  const visiblePosts = filtered.slice(0, visibleCount);
  const hasMore = visibleCount < filtered.length;

  const grouped = useMemo(() => {
    const map = new Map<string, ConceptPostListItem[]>();
    for (const post of visiblePosts) {
      const list = map.get(post.subject) ?? [];
      list.push(post);
      map.set(post.subject, list);
    }
    return Array.from(map.entries());
  }, [visiblePosts]);

  // Infinite scroll safely using window listener
  useEffect(() => {
    if (loading || !hasMore) return;
    const handleScroll = () => {
      const bottom = window.innerHeight + window.scrollY >= document.body.offsetHeight - 500;
      if (bottom) {
        setVisibleCount((prev) => prev + BATCH_SIZE);
      }
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [loading, hasMore]);

  return (
    <section className={styles.page}>
      <div className={styles.indexHead}>
        <div>
          <h1 className={styles.title}>Lesson notes</h1>
          <p className={styles.subtitle}>Short notes on one idea at a time — not the whole topic.</p>
        </div>
        <div className={styles.searchWrap}>
          <Search size={16} className={styles.searchIcon} />
          <input
            type="search"
            placeholder="Search notes..."
            className={styles.searchInput}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {error && (
        <>
          <div className={styles.error}>{error}</div>
          <Button variant="secondary" fullWidth onClick={() => setRetryKey((k) => k + 1)}>Try again</Button>
        </>
      )}

      {loading && <PageLoader text="Loading notes..." />}

      {!loading && filtered.length === 0 && (
        <EmptyState
          icon={<BookOpen size={22} />}
          title={search ? "No results found" : "No lesson notes yet"}
          message={search ? "Try a different search term." : "Notes will appear here when they are published."}
        />
      )}

      {!loading && filtered.length > 0 && (
        <div className={styles.content}>
          {grouped.map(([subject, subjectPosts]) => (
            <div key={subject} className={styles.group}>
              <h2 className={styles.groupTitle}>
                <span className={styles.groupCount}>{subjectPosts.length}</span>
                {subject}
              </h2>
              <div className={styles.articleList}>
                {subjectPosts.map((post) => (
                  <button
                    key={post.id}
                    type="button"
                    className={styles.card}
                    onClick={() => navigate('/notes/' + post.slug)}
                  >
                    <span className={styles.cardSubject} style={{ color: subjectColor(post.subject).fg }}>
                      {post.subject}
                    </span>
                    <h3 className={styles.cardTitle}>{post.title}</h3>
                    {post.excerpt ? <p className={styles.cardExcerpt}>{post.excerpt}</p> : null}
                  </button>
                ))}
              </div>
            </div>
          ))}

          {hasMore && (
            <div style={{ padding: '32px 0' }}>
              <PageLoader text="Loading more..." />
            </div>
          )}
        </div>
      )}
    </section>
  );
}
