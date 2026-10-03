/**
 * Subject accent colors.
 *
 * Known UTME subjects get an explicit, hand-picked color so the same
 * subject always looks the same across the app. Anything unknown falls
 * back to a deterministic hash into a balanced palette — so a new
 * subject added tomorrow still gets a stable, distinguishable color.
 */

export interface SubjectAccent {
  fg: string;
  bg: string;
}

/** Palette used for the hash-based fallback. */
const FALLBACK_PALETTE = [
  '#3B82F6', // blue
  '#14B8A6', // teal
  '#8B5CF6', // purple
  '#F97316', // orange
  '#EC4899', // pink
  '#EF4444', // red
  '#10B981', // emerald
  '#F59E0B', // amber
  '#6366F1', // indigo
  '#06B6D4', // cyan
  '#84CC16', // lime
  '#C026D3', // fuchsia
];

/** Explicit colors for known subjects. Key = lowercased, trimmed. */
const EXPLICIT: Record<string, string> = {
  // Brand-grouped core subjects
  'use of english': '#0F766E',
  english: '#0F766E',
  'english language': '#0F766E',
  mathematics: '#3B82F6',
  maths: '#3B82F6',
  math: '#3B82F6',
  'further mathematics': '#0EA5E9',
  'further maths': '#0EA5E9',
  physics: '#14B8A6',
  chemistry: '#8B5CF6',
  biology: '#10B981',
  'agricultural science': '#65A30D',
  agriculture: '#65A30D',
  'computer studies': '#475569',
  'computer science': '#475569',
  ict: '#475569',

  // Arts
  'literature in english': '#D97706',
  literature: '#D97706',
  'english literature': '#D97706',
  government: '#6366F1',
  history: '#DC2626',
  'christian religious studies': '#7C3AED',
  crs: '#7C3AED',
  'christian religious knowledge': '#7C3AED',
  'islamic religious studies': '#0891B2',
  irs: '#0891B2',
  'islamic religious knowledge': '#0891B2',
  french: '#2563EB',
  arabic: '#0D9488',
  yoruba: '#EA580C',
  igbo: '#059669',
  hausa: '#E11D48',
  music: '#DB2777',
  art: '#C026D3',
  'visual arts': '#C026D3',
  'fine arts': '#C026D3',
  'home economics': '#F43F5E',

  // Commercial
  economics: '#EC4899',
  commerce: '#B45309',
  'principles of accounts': '#92400E',
  accounts: '#92400E',

  // Shared
  geography: '#06B6D4',

  // Legacy / extra
  'current affairs': '#EC4899',
};

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function subjectColor(subject: string): SubjectAccent {
  const key = subject.toLowerCase().trim();
  const explicit = EXPLICIT[key];

  const fg =
    explicit ??
    FALLBACK_PALETTE[hashString(key) % FALLBACK_PALETTE.length];

  return {
    fg,
    bg: hexToRgba(fg, 0.12),
  };
}
