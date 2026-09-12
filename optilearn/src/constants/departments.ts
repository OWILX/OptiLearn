import type { Department } from '@/services/profile/profileService';

/**
 * Subject groupings per UTME department.
 *
 * These are the canonical JAMB UTME subject names. Where common aliases
 * exist (e.g. "Maths" for "Mathematics", "CRS" for "Christian Religious
 * Studies"), they are listed in ALIASES below so that a syllabus using
 * either form is recognised.
 *
 * Use of English is required by every department — it appears in all
 * three lists, and SEP treats it as the compulsory subject.
 */

const SCIENCE: readonly string[] = [
  'Use of English',
  'Mathematics',
  'Physics',
  'Chemistry',
  'Biology',
  'Agricultural Science',
  'Geography',
  'Further Mathematics',
  'Computer Studies',
];

const ARTS: readonly string[] = [
  'Use of English',
  'Literature in English',
  'Government',
  'History',
  'Christian Religious Studies',
  'Islamic Religious Studies',
  'French',
  'Arabic',
  'Yoruba',
  'Igbo',
  'Hausa',
  'Music',
  'Art',
  'Home Economics',
  'Economics',
  'Geography',
];

const COMMERCIAL: readonly string[] = [
  'Use of English',
  'Mathematics',
  'Economics',
  'Commerce',
  'Government',
  'Geography',
  'Principles of Accounts',
  'Computer Studies',
];

const SUBJECTS_BY_DEPARTMENT: Record<Department, readonly string[]> = {
  science: SCIENCE,
  arts: ARTS,
  commercial: COMMERCIAL,
};

/**
 * Aliases map lowercase-normalized alternative names to the canonical
 * form used above. Keeps the department lists readable.
 */
const ALIASES: Record<string, string> = {
  english: 'use of english',
  'english language': 'use of english',
  maths: 'mathematics',
  math: 'mathematics',
  'further maths': 'further mathematics',
  agriculture: 'agricultural science',
  crs: 'christian religious studies',
  'christian religious knowledge': 'christian religious studies',
  irs: 'islamic religious studies',
  'islamic religious knowledge': 'islamic religious studies',
  literature: 'literature in english',
  'english literature': 'literature in english',
  'visual arts': 'art',
  'fine arts': 'art',
  'principles of accounting': 'principles of accounts',
  accounts: 'principles of accounts',
  'computer science': 'computer studies',
  ict: 'computer studies',
};

/**
 * Normalize a subject name: lowercase, strip periods, collapse whitespace,
 * then resolve aliases.
 */
function normalizeSubject(raw: string): string {
  const base = raw
    .toLowerCase()
    .replace(/\./g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return ALIASES[base] ?? base;
}

/** Precomputed lookup sets per department, keyed by normalized name. */
const NORMALIZED_SETS: Record<Department, Set<string>> = {
  science: new Set(SCIENCE.map(normalizeSubject)),
  arts: new Set(ARTS.map(normalizeSubject)),
  commercial: new Set(COMMERCIAL.map(normalizeSubject)),
};

/** Canonical display order per department. */
export const DEPARTMENT_SUBJECTS: Record<Department, readonly string[]> = {
  science: SCIENCE,
  arts: ARTS,
  commercial: COMMERCIAL,
};

/** True when `subject` belongs to `department` (case/alias-aware). */
export function isSubjectInDepartment(
  subject: string,
  department: Department,
): boolean {
  return NORMALIZED_SETS[department].has(normalizeSubject(subject));
}

/**
 * Filter a list of subject names by department, preserving the original
 * order. Pass a null/undefined department to return everything unchanged.
 */
export function filterSubjectsByDepartment<T extends string>(
  subjects: readonly T[],
  department: Department | null | undefined,
): T[] {
  if (!department) return [...subjects];
  const allowed = NORMALIZED_SETS[department];
  return subjects.filter((s) => allowed.has(normalizeSubject(s)));
}

/** Human-readable department label. */
export const DEPARTMENT_LABELS: Record<Department, string> = {
  science: 'Science',
  arts: 'Arts',
  commercial: 'Commercial',
};
