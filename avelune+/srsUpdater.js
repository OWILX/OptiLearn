import { client } from '../supabase.js';

const QUALITY = { again: 1, hard: 3, good: 4, easy: 5 };

// ── SM-2 algorithm ──────────────────────────────────────────────
function computeNextReview(progress, quality) {
  const ease     = progress?.ease_factor    ?? 2.5;
  const streak   = progress?.correct_streak ?? 0;
  const interval = progress?.interval_days  ?? 1;

  let newStreak, newInterval, newEase;

  if (quality < 3) {
    newStreak   = 0;
    newInterval = 1;
    newEase     = Math.max(1.3, ease - 0.2);
  } else {
    newStreak = streak + 1;

    if (newStreak === 1)      newInterval = 1;
    else if (newStreak === 2) newInterval = 6;
    else                      newInterval = Math.round(interval * ease);

    newEase = Math.min(2.5, Math.max(1.3, ease + (0.1 - (5 - quality) * 0.08)));
  }

  const next = new Date();
  next.setDate(next.getDate() + newInterval);

  return {
    interval_days:    newInterval,
    ease_factor:      newEase,
    correct_streak:   newStreak,
    next_review_date: next.toISOString().split('T')[0],
  };
}

// ── Fetch existing progress (module_id included) ────────────────
async function fetchProgress(userId, questionIds) {
  const { data, error } = await client
    .from('user_question_progress')
    .select('question_id, module_id, interval_days, ease_factor, correct_streak, total_attempts')
    .eq('user_id', userId)
    .in('question_id', questionIds);

  if (error) return { ok: false, error: error.message };

  const map = Object.fromEntries(data.map(r => [r.question_id, r]));
  return { ok: true, map };
}

// ── Main export ─────────────────────────────────────────────────
// qualities: { [questionId]: 'again' | 'hard' | 'good' | 'easy' }
export async function submitSRSUpdate(userId, qualities) {
  const questionIds = Object.keys(qualities).map(Number);
  if (questionIds.length === 0) return { ok: true };

  const { ok, map, error } = await fetchProgress(userId, questionIds);
  if (!ok) return { ok: false, error };

  // NEW: Fetch module_id for any questions that have NO existing progress row yet.
  // This is the missing piece — without it, new rows would get module_id = null,
  // which either fails (if the column is NOT NULL) or leaves the row unlinked from its module.
  const missingQuestionIds = questionIds.filter(qid => !map[qid]);

  let moduleMap = {};
  if (missingQuestionIds.length > 0) {
    const { data: questionData, error: qError } = await client
      .from('questions')                    // ← assumes standard "questions" table with id + module_id
      .select('id, module_id')
      .in('id', missingQuestionIds);

    if (qError) {
      console.error('Failed to fetch module_ids for new questions:', qError.message);
      return { ok: false, error: qError.message };
    }

    moduleMap = Object.fromEntries(
      questionData?.map(q => [q.id, q.module_id]) ?? []
    );
  }
    const today = new Date().toISOString().split('T')[0];
    const records = questionIds.map(qid => {
    const quality   = QUALITY[qualities[qid]] ?? 1;
    const progress  = map[qid] ?? null;

    // Use the module_id from the existing progress row if it exists,
    // otherwise fall back to the one we just fetched from the questions table.
    const moduleId  = progress?.module_id ?? moduleMap[qid] ?? null;

    const next      = computeNextReview(progress, quality);

    return {
      user_id:          userId,
      question_id:      qid,
      module_id:        moduleId,               // ← now correctly populated for brand-new progress rows
      next_review_date: next.next_review_date,
      interval_days:    next.interval_days,
      ease_factor:      next.ease_factor,
      correct_streak:   next.correct_streak,
      total_attempts:   (progress?.total_attempts ?? 0) + 1,
      last_reviewed_date: today
    };
  });

  const { error: upsertError } = await client
    .from('user_question_progress')
    .upsert(records, { onConflict: 'user_id,question_id' });

  if (upsertError) {
    console.error('SRS update failed:', upsertError.message);
    return { ok: false, error: upsertError.message };
  }

  return { ok: true };
}