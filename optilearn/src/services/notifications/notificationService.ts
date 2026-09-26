import { examService } from '@/services/exams/examService';
import {
  SEP_SESSION_KEY,
  type SEPPersistedSession,
} from '@/services/exams/sepSession';
import { progressService } from '@/services/progress/progressService';
import { streakService } from '@/services/streaks/streakService';
import { readSession } from '@/utils/sessionStorage';

export type NotificationKind = 'sep_resume' | 'continue' | 'sep_result' | 'streak';

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  to: string;
}

function remainingLabel(endTime: number): string {
  const ms = Math.max(0, endTime - Date.now());
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    return String(h) + 'h ' + String(m % 60) + 'm left';
  }
  return String(m) + ':' + String(s).padStart(2, '0') + ' left';
}

export const notificationService = {
  async getInbox(userId: string): Promise<AppNotification[]> {
    const items: AppNotification[] = [];

    const stored = readSession<SEPPersistedSession>(SEP_SESSION_KEY);
    if (stored && stored.endTime > Date.now() && stored.questions.length > 0) {
      const answered = Object.keys(stored.answers).length;
      const total = stored.questions.length;
      const params = new URLSearchParams();
      params.set('subjects', stored.subjects.join(','));
      params.set('time', String(stored.timeLimitMinutes));
      items.push({
        id: 'sep-resume',
        kind: 'sep_resume',
        title: 'Exam in progress',
        body: String(answered) + '/' + String(total) + ' answered - ' + remainingLabel(stored.endTime),
        to: '/sep/exam?' + params.toString(),
      });
    }

    const [continueLearning, recent, streak] = await Promise.all([
      progressService.getContinueLearning(userId).catch(function () { return null; }),
      examService.getRecentAttempts(userId, 1).catch(function () { return []; }),
      streakService.getMyStreak().catch(function () { return null; }),
    ]);

    if (continueLearning && continueLearning.progress.status !== 'completed') {
      const topic = continueLearning.syllabus.topic;
      const pct = Math.round(continueLearning.progress.progress);
      items.push({
        id: 'continue-' + String(continueLearning.progress.syllabusId),
        kind: 'continue',
        title: 'Continue learning',
        body: topic + ' - ' + String(pct) + '% through',
        to: '/study/topic/' + String(continueLearning.progress.syllabusId),
      });
    }

    const last = recent[0];
    if (last) {
      const pct = last.score != null ? Math.round(last.score) : null;
      items.push({
        id: 'sep-result-' + String(last.id),
        kind: 'sep_result',
        title: pct != null ? 'Last SEP - ' + String(pct) + '%' : 'Last SEP result',
        body:
          pct == null
            ? 'Open the review to see how you did.'
            : pct >= 70
              ? 'Solid score. Review the misses while they are fresh.'
              : 'Review the missed questions before your next attempt.',
        to: '/sep/history/' + String(last.id),
      });
    }

    if (streak && streak.currentStreak > 0) {
      const n = streak.currentStreak;
      items.push({
        id: 'streak-keep',
        kind: 'streak',
        title: n === 1 ? '1-day streak' : String(n) + '-day streak',
        body: 'Study, quiz, or finish a topic today to keep it going.',
        to: '/study',
      });
    } else if (streak && streak.longestStreak > 0) {
      const best = streak.longestStreak;
      items.push({
        id: 'streak-restart',
        kind: 'streak',
        title: 'Streak reset',
        body: 'Your best was ' + String(best) + (best === 1 ? ' day' : ' days') + '. Start a new one today.',
        to: '/study',
      });
    } else if (items.length === 0) {
      items.push({
        id: 'streak-start',
        kind: 'streak',
        title: 'Start a streak',
        body: 'Open a topic in Study and work through a few questions.',
        to: '/study',
      });
    }

    return items;
  },
};
