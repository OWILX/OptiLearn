import { progressService } from '@/services/progress/progressService';
import { quizService } from '@/services/quiz/quizService';
import { streakService } from '@/services/streaks/streakService';

export type NotificationKind = 'continue' | 'quiz_result' | 'streak';

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  to: string;
}

export const notificationService = {
  async getInbox(userId: string): Promise<AppNotification[]> {
    const items: AppNotification[] = [];

    const [continueLearning, recent, streak] = await Promise.all([
      progressService.getContinueLearning(userId).catch(function () { return null; }),
      quizService.getRecentQuizzes(1).catch(function () { return []; }),
      streakService.getMyStreak().catch(function () { return null; }),
    ]);

    if (continueLearning && continueLearning.progress.status !== 'completed') {
      const topic = continueLearning.syllabus.moduleName;
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
      const pct = Math.round(last.score);
      items.push({
        id: 'quiz-result-' + String(last.id),
        kind: 'quiz_result',
        title: 'Last quiz - ' + String(pct) + '%',
        body:
          pct >= 70
            ? 'Solid score. Review the questions while they are fresh.'
            : 'Review the questions before your next quiz.',
        to: '/quiz/history/' + String(last.id),
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
