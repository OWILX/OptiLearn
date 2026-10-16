import type { Department } from '@/services/profile/profileService';

/**
 * Legacy UTME groups and course groupings for the university departments.
 * Common aliases are listed below so course names with alternate spellings
 * are matched consistently.
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

const ENGINEERING: readonly string[] = [
  'Engineering',
  'Mechanical',
  'Electrical',
  'Civil',
  'Chemical',
  'Mechanical Engineering',
  'Electrical Engineering',
  'Civil Engineering',
  'Computer Science',
  'Chemical Engineering',
];

const NATURAL_SCIENCES: readonly string[] = [
  'Natural Sciences',
  'Physics',
  'Chemistry',
  'Biology',
  'Mathematics',
  'Earth Science',
  'Earth Sciences',
];

const BASIC_MEDICAL_SCIENCE: readonly string[] = [
  'Basic Medical Science',
  'Anatomy',
  'Gross Anatomy',
  'Physiology',
  'Biochemistry',
  'Medical Biochemistry',
  'Embryology',
  'Histology',
  'Pathology',
  'Pharmacology',
];

const MEDICINE: readonly string[] = [
  'Medicine',
  'Anatomy',
  'Gross Anatomy',
  'Physiology',
  'Biochemistry',
  'Medical Biochemistry',
  'Embryology',
  'Histology',
  'Pathology',
  'Pharmacology',
  'Internal Medicine',
  'Surgery',
  'Pediatrics',
  'Obstetrics',
  'Psychiatry',
];

const PHARMACY: readonly string[] = [
  'Pharmacy',
  'Pharmaceutics',
  'Pharmacology',
  'Medicinal Chemistry',
  'Pharmacognosy',
];



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
  'earth science': 'earth sciences',
  paediatrics: 'pediatrics',
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
  engineering: new Set(ENGINEERING.map(normalizeSubject)),
  'natural-sciences': new Set(NATURAL_SCIENCES.map(normalizeSubject)),
  'basic-medical-science': new Set(
    BASIC_MEDICAL_SCIENCE.map(normalizeSubject),
  ),
  medicine: new Set(MEDICINE.map(normalizeSubject)),
  pharmacy: new Set(PHARMACY.map(normalizeSubject)),
};

/** Canonical display order per department. */
export const DEPARTMENT_SUBJECTS: Record<Department, readonly string[]> = {
  science: SCIENCE,
  arts: ARTS,
  commercial: COMMERCIAL,
  engineering: ENGINEERING,
  'natural-sciences': NATURAL_SCIENCES,
  'basic-medical-science': BASIC_MEDICAL_SCIENCE,
  medicine: MEDICINE,
  pharmacy: PHARMACY,
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
  engineering: 'Engineering',
  'natural-sciences': 'Natural Sciences',
  'basic-medical-science': 'Basic Medical Science',
  medicine: 'Medicine',
  pharmacy: 'Pharmacy',
};
