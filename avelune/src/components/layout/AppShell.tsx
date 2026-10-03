import { useCallback, useEffect, useRef, useState } from 'react';
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
  const lastInboxLoad = useRef(0);

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

  const refreshInbox = useCallback(async () => {
    if (!user) {
      setInbox([]);
      return;
    }
    setInboxLoading(true);
    try {
      const rows = await notificationService.getInbox(user.id);
      setInbox(rows);
      lastInboxLoad.current = Date.now();
    } catch (err: unknown) {
      if (import.meta.env.DEV) console.warn('[INBOX] Load failed:', err);
    } finally {
      setInboxLoading(false);
    }
  }, [user]);
  useEffect(() => {
    void refreshInbox();
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastInboxLoad.current > 60_000) {
        void refreshInbox();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refreshInbox]);
  useEffect(() => {
    if (notificationsOpen && Date.now() - lastInboxLoad.current > 60_000) void refreshInbox();
  }, [notificationsOpen, refreshInbox]);

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
                <span className={styles.brandName}>Avelune</span>
                <span
                  className={styles.brandTagline}
                  aria-hidden={scrolled}
                >
                  Learn with Clarity
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
