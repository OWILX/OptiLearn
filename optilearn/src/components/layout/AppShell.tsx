import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Home, BookOpen, Target, User, Bell } from 'lucide-react';
import { Logo } from '@/components/brand/Logo';
import { Avatar } from '@/components/ui/Avatar';
import { NotificationPanel } from '@/components/notifications/NotificationPanel';
import { useAuth } from '@/context/AuthContext';
import {
  notificationService,
  type AppNotification,
} from '@/services/notifications/notificationService';
import styles from './AppShell.module.css';

const NAV = [
  { to: '/home', label: 'Home', Icon: Home },
  { to: '/study', label: 'Study', Icon: BookOpen },
  { to: '/quiz', label: 'Quiz', Icon: Target },
  { to: '/profile', label: 'Profile', Icon: User },
] as const;

const ENTER_SCROLLED = 48;
const EXIT_SCROLLED = 4;

/** Routes that hide the AppShell header and bottom nav. */
const FOCUS_ROUTE_PREFIXES = ['/study/topic/', '/quiz/session', '/sep/exam', '/notes/'];

export function AppShell() {
  const { user } = useAuth();
  const location = useLocation();
  const [scrolled, setScrolled] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [inbox, setInbox] = useState<AppNotification[]>([]);
  const [inboxLoading, setInboxLoading] = useState(false);

  const isFocusMode = FOCUS_ROUTE_PREFIXES.some((p) =>
    location.pathname.startsWith(p),
  );

  useEffect(() => {
    if (isFocusMode) return;
    const onScroll = () => {
      const y = window.scrollY;
      setScrolled((prev) => (prev ? y > EXIT_SCROLLED : y > ENTER_SCROLLED));
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [isFocusMode]);

  // Reset scroll on every route change. Mobile users expect to land
  // at the top of a new screen, not halfway down it.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  useEffect(() => {
    if (!user) {
      setInbox([]);
      return;
    }
    let cancelled = false;
    setInboxLoading(true);
    notificationService
      .getInbox(user.id)
      .then((rows) => {
        if (!cancelled) setInbox(rows);
      })
      .catch((err: unknown) => {
        if (import.meta.env.DEV) {
          console.warn('[INBOX] Load failed:', err);
        }
        if (!cancelled) setInbox([]);
      })
      .finally(() => {
        if (!cancelled) setInboxLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user, location.pathname]);

  return (
    <div className={styles.shell}>
      {!isFocusMode && (
        <header
          className={`${styles.header} ${scrolled ? styles.headerScrolled : ''}`}
        >
          <div className={styles.headerInner}>
            <div className={styles.brand}>
              <Logo size={30} />
              <div className={styles.brandText}>
                <span className={styles.brandName}>OptiLearn</span>
                <span
                  className={styles.brandTagline}
                  aria-hidden={scrolled}
                >
                  When Preparation Meets Excellence.
                </span>
              </div>
            </div>
            <div className={styles.spacer} />
            <button
              type="button"
              className={styles.iconButton}
              onClick={() => setNotificationsOpen(true)}
              aria-label={
                inbox.length > 0
                  ? `Notifications, ${inbox.length} items`
                  : 'Notifications'
              }
            >
              <Bell size={20} aria-hidden="true" />
              {inbox.length > 0 && (
                <span className={styles.badge} aria-hidden="true" />
              )}
            </button>
            <Avatar user={user} size={34} />
          </div>
        </header>
      )}

      <main className={isFocusMode ? styles.mainFocus : styles.main}>
        <Outlet />
      </main>

      {!isFocusMode && (
        <nav className={styles.nav} aria-label="Primary">
          {NAV.map(({ to, label, Icon }) => (
            <NavLink key={to} to={to} className={styles.navItem}>
              <Icon aria-hidden="true" />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
      )}

      <NotificationPanel
        open={notificationsOpen}
        items={inbox}
        loading={inboxLoading}
        onClose={() => setNotificationsOpen(false)}
      />
    </div>
  );
}
