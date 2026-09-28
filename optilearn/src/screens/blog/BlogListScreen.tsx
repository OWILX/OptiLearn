import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen } from 'lucide-react';
import { useProfile } from '@/context/ProfileContext';
import { filterSubjectsByDepartment } from '@/constants/departments';
import {
  blogService,
  type ConceptPostListItem,
} from '@/services/blog/blogService';
import { subjectColor } from '@/utils/subjectColor';
import { EmptyState } from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/Skeleton';
import { Button } from '@/components/ui/Button';
import styles from './BlogListScreen.module.css';

export function BlogListScreen() {
  const navigate = useNavigate();
  const { profile, loading: profileLoading } = useProfile();
  const [posts, setPosts] = useState<ConceptPostListItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [subject, setSubject] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  const department = profile?.department ?? null;
  const subjects = useMemo(() => {
    const unique = Array.from(new Set((posts ?? []).map((p) => p.subject)));
    return filterSubjectsByDepartment(unique, department);
  }, [posts, department]);

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
        setError(err instanceof Error ? err.message : 'Could not load lesson notes.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [department, profileLoading, retryKey]);

  const visible = (posts ?? []).filter((p) => !subject || p.subject === subject);

  return (
    <section className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Lesson notes</h1>
        <p className={styles.subtitle}>
          Short notes on one idea at a time — not the whole topic.
        </p>
      </div>

      {error && (
        <>
          <div className={styles.error}>{error}</div>
          <Button variant="secondary" fullWidth onClick={() => setRetryKey((k) => k + 1)}>
            Try again
          </Button>
        </>
      )}

      {loading && (
        <div className={styles.list}>
          <Skeleton height={96} />
          <Skeleton height={96} />
        </div>
      )}

      {!loading && !error && posts && posts.length === 0 && (
        <EmptyState
          icon={<BookOpen size={22} />}
          title="No lesson notes yet"
          message="Notes will appear here by subject when they are published."
        />
      )}

      {!loading && posts && posts.length > 0 && (
        <>
          <div className={styles.chips} role="tablist" aria-label="Subject">
            <button
              type="button"
              className={subject === null ? styles.chip + ' ' + styles.chipOn : styles.chip}
              onClick={() => setSubject(null)}
            >
              All
            </button>
            {subjects.map((name) => (
              <button
                key={name}
                type="button"
                className={subject === name ? styles.chip + ' ' + styles.chipOn : styles.chip}
                onClick={() => setSubject(name)}
              >
                {name}
              </button>
            ))}
          </div>
          {visible.length === 0 ? (
            <EmptyState icon={<BookOpen size={22} />} title="No notes in this subject" message="Try another subject chip." />
          ) : (
            <div className={styles.list}>
              {visible.map((post) => (
                <button
                  key={post.id}
                  type="button"
                  className={styles.card}
                  onClick={() => navigate('/notes/' + post.slug)}
                >
                  <span className={styles.subject} style={{ color: subjectColor(post.subject) }}>
                    {post.subject}
                  </span>
                  <span className={styles.cardTitle}>{post.title}</span>
                  {post.excerpt ? <span className={styles.excerpt}>{post.excerpt}</span> : null}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
