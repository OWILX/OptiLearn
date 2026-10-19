import { createBrowserRouter } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { SplashScreen } from '@/screens/SplashScreen';
import { NotFoundScreen } from '@/screens/NotFoundScreen';
import { RouteError } from '@/components/errors/RouteError';
import { HomeScreen } from '@/screens/home/HomeScreen';
import { LoginScreen } from '@/screens/auth/LoginScreen';
import { ProfileScreen } from '@/screens/profile/ProfileScreen';
import { StudyScreen } from '@/screens/study/StudyScreen';
import { SubjectDetailScreen } from '@/screens/study/SubjectDetailScreen';
import { SectionDetailScreen } from '@/screens/study/SectionDetailScreen';
import { SubtopicDetailScreen } from '@/screens/study/SubtopicDetailScreen';
import { StudyReaderScreen } from '@/screens/study/StudyReaderScreen';
import { QuizScreen } from '@/screens/quiz/QuizScreen';
import { QuizSetupScreen } from '@/screens/quiz/QuizSetupScreen';
import { QuizSessionScreen } from '@/screens/quiz/QuizSessionScreen';
import { QuizHistoryDetailScreen } from '@/screens/quiz/QuizHistoryDetailScreen';
import { GeneratedQuizHistoryScreen } from '@/screens/quiz/GeneratedQuizHistoryScreen';
import { GeneratedQuizSetupScreen } from '@/screens/quiz/GeneratedQuizSetupScreen';
import { GeneratedQuizSessionScreen } from '@/screens/quiz/GeneratedQuizSessionScreen';
import { ChooseDepartmentScreen } from '@/screens/onboarding/ChooseDepartmentScreen';
import { BlogListScreen } from '@/screens/blog/BlogListScreen';
import { BlogPostScreen } from '@/screens/blog/BlogPostScreen';
import { PlansScreen } from '@/screens/plans/PlansScreen';
import { ProtectedRoute } from './ProtectedRoute';
import { PublicOnlyRoute } from './PublicOnlyRoute';
import { RequireDepartment } from './RequireDepartment';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <SplashScreen />,
    errorElement: <RouteError />,
  },

  {
    element: <PublicOnlyRoute />,
    children: [{ path: '/login', element: <LoginScreen /> }],
  },

  {
    element: <ProtectedRoute />,
    children: [
      { path: '/choose-department', element: <ChooseDepartmentScreen /> },

      {
        element: <RequireDepartment />,
        children: [
          {
            element: <AppShell />,
            children: [
              { path: '/home', element: <HomeScreen /> },
              { path: '/study', element: <StudyScreen /> },
              {
                path: '/study/subject/:subject',
                element: <SubjectDetailScreen />,
              },
              {
                path: '/study/section/:subject/:section',
                element: <SectionDetailScreen />,
              },
              {
                path: '/study/subtopic/:subject/:section/:subtopic',
                element: <SubtopicDetailScreen />,
              },
              {
                path: '/study/topic/:syllabusId',
                element: <StudyReaderScreen />,
              },
              { path: '/quiz', element: <QuizScreen /> },
              { path: '/quiz/setup', element: <QuizSetupScreen /> },
              { path: '/quiz/session', element: <QuizSessionScreen /> },
              {
                path: '/quiz/history/:quizId',
                element: <QuizHistoryDetailScreen />,
              },
              {
                path: '/quiz/generated',
                element: <GeneratedQuizHistoryScreen />,
              },
              {
                path: '/quiz/generated/new',
                element: <GeneratedQuizSetupScreen />,
              },
              {
                path: '/quiz/generated/session/:quizId',
                element: <GeneratedQuizSessionScreen />,
              },
              { path: '/profile', element: <ProfileScreen /> },
              { path: '/plans', element: <PlansScreen /> },
              { path: '/notes', element: <BlogListScreen /> },
              { path: '/notes/:slug', element: <BlogPostScreen /> },
            ],
          },
        ],
      },
    ],
  },

  { path: '*', element: <NotFoundScreen />, errorElement: <RouteError /> },
]);
