# Backend Recommendations for a Better UI/UX

This file contains recommendations only. No backend, Supabase, service, router, or data-layer code was changed in this pass.

## 1. Add a unified dashboard summary endpoint

The home screen currently needs several independent pieces of information: progress, streak, recent exam attempts, lesson notes, and resumable sessions. A single authenticated summary query or RPC would reduce request waterfalls and make the home screen feel faster and more stable.

The response should include the user’s display profile, current streak, progress totals, most recent in-progress topic, recent attempts, and a small set of recommended next actions. Return a `generated_at` or `as_of` timestamp so the client can label cached data correctly.

## 2. Provide explicit loading and sync metadata

Every dashboard or study response should expose enough metadata for the UI to distinguish between fresh, cached, stale, and failed data. Useful fields include `updated_at`, `last_synced_at`, and a server-side revision or cursor.

This lets the front end show a lightweight “updated just now” or “offline — showing saved data” message instead of leaving users guessing whether a blank state is still loading.

## 3. Add a review queue for adaptive learning

Create a backend-backed review queue based on question history. Questions answered incorrectly or marked for review should receive a higher priority; questions answered correctly multiple times should receive a lower priority.

Recommended fields include `next_review_at`, `review_interval`, `ease_factor`, `last_answered_at`, `correct_streak`, and `times_seen`. Expose a small review summary for the home screen, such as the number of questions due today and the weakest subjects.

## 4. Support richer result analytics

Return analytics that help the result screens provide useful next steps instead of only a score. At minimum, expose accuracy by subject, difficulty, question type, skipped count, time spent, and weakest topics.

Keep score calculations server-authoritative. The client should receive the final score, but also enough breakdown data to render transparent explanations and recommended study actions.

## 5. Add server-side validation and ownership checks

Validate all quiz and SEP configuration values on the server: allowed department subjects, question counts, difficulty values, time limits, attempt ownership, and score inputs. Do not rely on client-supplied score or completion values.

The backend should also confirm that a question belongs to the selected department and that an attempt belongs to the authenticated user before accepting answers or finalization.

## 6. Add safe idempotency for attempts and progress

Attempt submission and progress updates should accept an idempotency key. A retry caused by a lost connection must not create duplicate attempts, duplicate streak activity, or duplicate progress rows.

The client can generate a session-level submission key and safely retry until it receives a definitive response.

## 7. Add indexes for the UI’s common read paths

Review query plans and add indexes around the most common authenticated reads. Likely candidates are:

```sql
create index if not exists study_progress_user_status_accessed_idx
  on study_progress (user_id, status, last_accessed_at desc);

create index if not exists question_attempts_user_type_question_idx
  on question_attempts (user_id, attempt_type, question_id);

create index if not exists question_bank_syllabus_difficulty_type_idx
  on question_bank (syllabus_id, difficulty, question_type);

create index if not exists exam_attempts_user_completed_idx
  on exam_attempts (user_id, completed_at desc);
```

Confirm the exact table and column names before applying migrations, and validate the impact with `EXPLAIN ANALYZE`.

## 8. Add a server-side adaptive question-selection RPC

Move selection of question sets into a Supabase RPC once the question bank grows. The RPC should filter by department, subject, difficulty, and question type, then weight questions by review priority and previous attempts.

Returning only the selected questions will reduce data transfer and keep selection behavior consistent between devices.

## 9. Add offline sync support

For study progress, quiz attempts, SEP results, and streak activity, provide an outbox-friendly write model. Each write should contain a client event ID, user ID, event type, payload, created time, and processed time.

The UI can then continue reading cached study material and active sessions while offline, queue writes, and reconcile them when connectivity returns.

## 10. Improve notification delivery semantics

Expose notification type, priority, read status, created time, and optional action metadata as stable fields. Add pagination or a cursor for notification history, and support marking individual notifications as read.

If notifications are real-time, use a subscription or change feed rather than forcing a full list reload on every route transition.

## 11. Generate and share database types

Generate Supabase database types and use them throughout the service layer. This reduces drift between the UI expectations and database schema, particularly for optional premium fields, exam attempts, question answers, and progress rows.

## 12. Add runtime response validation

Use a schema validator such as Zod at service boundaries for profiles, syllabus rows, questions, attempts, notifications, and quiz/SEP session payloads. Return a safe, typed error when the database shape changes instead of allowing malformed data to render as a broken card.

## 13. Expose feature capability flags

If premium explanations, AI explanations, offline reading, or review queues are enabled gradually, expose stable capability flags from the backend. The UI can then render disabled, locked, or available states consistently without guessing from missing data.

## 14. Track performance and UI-facing failures

Capture request latency, error codes, retry counts, and sync conflicts for the main UI flows: login, home summary, study reader, quiz start, SEP start, and attempt submission. Avoid logging question content or sensitive user data.

A small set of measurable timings will make it easier to distinguish a front-end rendering issue from a slow or unreliable backend dependency.

## Recommended priority

The highest-impact sequence is: **unified home summary**, **server validation and idempotent submissions**, **review queue**, **result analytics**, **offline outbox**, then **types/runtime validation and observability**. These changes improve perceived speed, reliability, personalization, and the clarity of the UI without requiring the visual layer to carry backend uncertainty.
