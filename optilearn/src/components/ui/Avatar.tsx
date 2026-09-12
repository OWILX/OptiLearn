import type { User } from '@supabase/supabase-js';
import styles from './Avatar.module.css';

interface AvatarProps {
  user: User | null;
  size?: number;
}

interface GoogleMetadata {
  full_name?: string;
  name?: string;
  avatar_url?: string;
  picture?: string;
}

function readInitials(name: string | undefined, email: string | undefined): string {
  if (name?.trim()) {
    const parts = name.trim().split(/\s+/);
    const first = parts[0]?.[0] ?? '';
    const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
    const combined = (first + last).toUpperCase();
    if (combined) return combined;
  }
  if (email) return email[0].toUpperCase();
  return '?';
}

export function Avatar({ user, size = 34 }: AvatarProps) {
  const meta = (user?.user_metadata ?? {}) as GoogleMetadata;
  const name = meta.full_name || meta.name;
  const avatarUrl = meta.avatar_url || meta.picture;

  const boxStyle = { width: size, height: size };
  const fontSize = Math.round(size * 0.38);

  if (avatarUrl) {
    return (
      <div className={styles.avatar} style={boxStyle}>
        <img
          src={avatarUrl}
          alt=""
          className={styles.img}
          style={boxStyle}
          referrerPolicy="no-referrer"
        />
      </div>
    );
  }

  return (
    <div
      className={`${styles.avatar} ${styles.initials}`}
      style={{ ...boxStyle, fontSize }}
      aria-hidden="true"
    >
      {readInitials(name, user?.email ?? undefined)}
    </div>
  );
}
