import { useRouteError } from 'react-router-dom';
import { ErrorFallback } from './ErrorFallback';

/**
 * Error element for React Router routes. RR v7 with createBrowserRouter
 * catches load/action/render errors and routes them here, bypassing
 * any wrapping class ErrorBoundary.
 */
export function RouteError() {
  const error = useRouteError();

  let normalized: Error | null = null;
  if (error instanceof Error) {
    normalized = error;
  } else if (typeof error === 'string') {
    normalized = new Error(error);
  } else if (error && typeof error === 'object' && 'message' in error) {
    normalized = new Error(String((error as { message: unknown }).message));
  }

  return <ErrorFallback error={normalized} />;
}
