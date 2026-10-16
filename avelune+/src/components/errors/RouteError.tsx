import { useRouteError } from 'react-router-dom';
import { ErrorFallback } from './ErrorFallback';

/**
 * Error element for React Router routes. RR v7 with createBrowserRouter
 * catches load/action/render errors and routes them here, bypassing
 * any wrapping class ErrorBoundary.
 */
export function RouteError() {
  const error = useRouteError();
  console.error('[ROUTER] Route failed:', error);
  return <ErrorFallback />;
}
