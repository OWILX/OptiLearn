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
import { StudyReaderScreen } from '@/screens/study/StudyReaderScreen';
import { PracticeScreen } from '@/screens/practice/PracticeScreen';
import { PracticeFilterScreen } from '@/screens/practice/PracticeFilterScreen';
import { PracticeSessionScreen } from '@/screens/practice/PracticeSessionScreen';
import { SepConfigureScreen } from '@/screens/sep/SepConfigureScreen';
import { SepInstructionsScreen } from '@/screens/sep/SepInstructionsScreen';
import { SepExamScreen } from '@/screens/sep/SepExamScreen';
import { SepHistoryScreen } from '@/screens/sep/SepHistoryScreen';
import { SepHistoryDetailScreen } from '@/screens/sep/SepHistoryDetailScreen';
import { ChooseDepartmentScreen } from '@/screens/onboarding/ChooseDepartmentScreen';
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
                path: '/study/topic/:syllabusId',
                element: <StudyReaderScreen />,
              },
              { path: '/practice', element: <PracticeScreen /> },
              { path: '/practice/filter', element: <PracticeFilterScreen /> },
              { path: '/practice/session', element: <PracticeSessionScreen /> },
              { path: '/sep', element: <SepConfigureScreen /> },
              { path: '/sep/instructions', element: <SepInstructionsScreen /> },
              { path: '/sep/exam', element: <SepExamScreen /> },
              { path: '/sep/history', element: <SepHistoryScreen /> },
              {
                path: '/sep/history/:attemptId',
                element: <SepHistoryDetailScreen />,
              },
              { path: '/profile', element: <ProfileScreen /> },
            ],
          },
        ],
      },
    ],
  },

  { path: '*', element: <NotFoundScreen />, errorElement: <RouteError /> },
]);
