/**
 * Normalize any thrown value into an Error with a user-safe `.message`.
 * Supabase errors already have a `.message`; native errors pass through.
 */
export function wrapError(error: unknown, fallback: string): Error {
  if (error && typeof error === 'object' && 'message' in error) {
    const msg = String((error as { message: unknown }).message);
    if (msg.trim()) return new Error(msg);
  }
  return new Error(fallback);
}
