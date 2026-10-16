export class UserFacingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UserFacingError';
  }
}

export function userFacingErrorMessage(
  error: unknown,
  fallback: string,
): string {
  if (error instanceof UserFacingError) return error.message;
  console.error('[APP] Unexpected error:', error);
  return fallback;
}

/** Log diagnostic details while exposing only a safe fallback to the UI. */
export function wrapError(error: unknown, fallback: string): Error {
  console.error('[APP] Request failed:', error);
  return new UserFacingError(fallback);
}
