# OptiLearn Optimization Plan

## Important clarification: departments were not removed

The department system is still active and unchanged in behavior.

The removed item was only an unused duplicate constant named `SUBJECTS_BY_DEPARTMENT`. It duplicated the same lists that are already used by the live filtering system.

The active department functionality remains in:

- `src/services/profile/profileService.ts` — stores the user's department.
- `src/context/ProfileContext.tsx` — exposes and updates the department.
- `src/router/RequireDepartment.tsx` — prevents users without a department from entering the main app.
- `src/constants/departments.ts` — contains the canonical Science, Arts, and Commercial subject lists, aliases, and filtering functions.
- `src/services/syllabus/syllabusService.ts` — filters syllabus subjects by department.
- `src/services/blog/blogService.ts` — filters lesson notes by department.
- `src/screens/study/StudyScreen.tsx` — loads department-specific subjects.
- `src/screens/quiz/QuizSetupScreen.tsx` — loads department-specific quiz subjects.
- `src/screens/sep/SepConfigureScreen.tsx` — loads department-specific SEP subjects.

The active exports still include:

```ts
DEPARTMENT_SUBJECTS
isSubjectInDepartment()
filterSubjectsByDepartment()
DEPARTMENT_LABELS
```

The department separation therefore remains intact.

---

## Completed optimizations

### 1. Authentication rendering stability

- Memoized the authentication action functions.
- Memoized the authentication context value.
- Reduces avoidable re-renders across the authenticated application tree.

### 2. Profile request safety

- Added request identity protection to the profile loader.
- Prevents a slower, older Supabase response from overwriting the profile of a newer signed-in user.

### 3. Notification loading efficiency

- Removed notification reloads on every route transition.
- Notifications refresh when:
  - The app becomes visible again.
  - The notification panel is opened after the cache interval.
  - The authenticated user changes.

### 4. Quiz and SEP reload persistence

- Quiz persistence remains immediate.
- SEP persistence remains immediate.
- Reload recovery was intentionally preserved.
- Saved data includes:
  - Questions
  - Answers
  - Current question index
  - Session configuration
  - Start/expiry time
  - Remaining exam validity

### 5. Mobile foundation

- Added 44px minimum button hit areas.
- Added standalone mobile-app metadata.
- Added web-app manifest metadata.
- Added theme color and Apple mobile-web-app metadata.
- Improved light-mode rendering consistency.
- Added stable scrollbar layout behavior.
- Added selection styling.

### 6. TypeScript and build reliability

- Added TypeScript 6 compatibility configuration.
- Removed an unused duplicate department constant.
- Fixed subject accent typing in lesson-note screens.
- Rebuilt the dependency tree because the uploaded archive contained incomplete tool binaries.

---

## Recommended next changes

These are planned improvements, not changes that have already been applied.

### Phase 1 — Highest user-experience impact

#### A. Spaced repetition

Add a review queue based on question history:

- Questions answered incorrectly appear sooner.
- Questions answered correctly repeatedly are shown less often.
- Add a Home card such as `3 reviews due today`.
- Add a `Review missed questions` action after every quiz and SEP attempt.

#### B. Better result feedback

After quiz or SEP completion, show:

- Accuracy by subject.
- Accuracy by difficulty.
- Weakest topics.
- Time spent per question.
- Skipped-question count.
- Recommended next study action.

#### C. Flag questions for review

During quiz and SEP sessions:

- Let students flag difficult questions.
- Show flagged counts in the question navigator.
- Add a final review filter for unanswered and flagged questions.

#### D. Daily study plan

Create a lightweight plan based on:

- Department.
- Exam date.
- Weak subjects.
- Recent quiz results.
- Streak status.
- Topics already completed.

Keep the plan adjustable and avoid making it feel like a punishment.

---

### Phase 2 — Reliability and offline experience

#### A. Offline-first study cache

Cache:

- Recently opened topics.
- Recently loaded question sets.
- Active quiz and SEP sessions.
- Basic profile and department data.

When offline:

- Continue reading cached material.
- Continue active sessions.
- Queue progress and attempts for later sync.

#### B. Sync queue

Add an outbox table or local queue for:

- Topic progress.
- Question attempts.
- Exam results.
- Streak activity.

Retry safely when the connection returns.

#### C. Better error recovery

Add a shared retry pattern with:

- Clear error messages.
- Retry buttons.
- Offline indication.
- Last successful sync time.
- No loss of active session state.

---

### Phase 3 — Backend and Supabase improvements

#### A. Move adaptive question selection server-side

The current client-side question selection can eventually be moved into a Supabase RPC to reduce data transfer and make selection more consistent.

The RPC should:

- Filter by department and subject.
- Filter by difficulty.
- Consider prior attempts.
- Weight missed questions appropriately.
- Return only the selected questions.

#### B. Add indexes

Recommended indexes:

```sql
study_progress(user_id, status, last_accessed_at)
question_attempts(user_id, attempt_type, question_id)
question_bank(syllabus_id, difficulty, question_type)
exam_attempts(user_id, completed_at)
```

#### C. Add server-side validation

Validate on the server:

- Exam time limits.
- Question counts.
- Valid subject combinations.
- Attempt ownership.
- Score calculations.
- Department-appropriate subject access.

#### D. Generated database types

Generate Supabase types and use them throughout the services instead of manually maintained database row interfaces.

---

### Phase 4 — TypeScript and architecture improvements

#### A. Add a shared query/cache layer

Consider TanStack Query or an equivalent solution for:

- Request deduplication.
- Cache invalidation.
- Background refresh.
- Retry handling.
- Consistent loading states.

#### B. Runtime response validation

Use Zod or an equivalent validator for Supabase responses, especially for:

- Profiles.
- Syllabus rows.
- Questions.
- Attempts.
- Notifications.

#### C. Extract reusable exam hooks

Create shared hooks such as:

- `useExamTimer`
- `usePersistedExamSession`
- `useQuestionNavigator`
- `useExamSubmission`

This would reduce duplication between Quiz and SEP while preserving their different product behavior.

#### D. Route-level code splitting

Lazy-load Study, Quiz, SEP, Notes, and Profile routes to reduce the initial JavaScript bundle and improve first launch performance on mobile networks.

#### E. Automated tests

Add tests for:

- Quiz scoring.
- SEP scoring.
- Weighted question sampling.
- Session restoration.
- Expired-session cleanup.
- Department subject filtering.
- Streak calculations.
- Profile race protection.

---

## Recommended implementation order

1. Spaced repetition and missed-question review.
2. Result feedback and flagged questions.
3. Offline cache and sync queue.
4. Server-side validation and indexes.
5. Route-level code splitting.
6. Shared query/cache layer.
7. Automated tests and generated database types.

This order improves the student experience first, then strengthens reliability and maintainability without changing the OptiLearn brand or core learning concept.
