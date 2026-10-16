/**
 * Typed access to build-time environment variables.
 *
 * Fails fast at startup if a required variable is missing or empty —
 * better a clear error during boot than a mysterious `undefined`
 * three screens deep.
 */

function required(name: keyof ImportMetaEnv, value: string | undefined): string {
  if (!value || value.trim() === '') {
    throw new Error(
      `Missing required environment variable: ${name}. ` +
        `Copy .env.example to .env.local and fill it in, then restart the dev server.`,
    );
  }
  return value;
}

export const env = {
  SUPABASE_URL: required('VITE_SUPABASE_URL', import.meta.env.VITE_SUPABASE_URL),
  SUPABASE_ANON_KEY: required(
    'VITE_SUPABASE_ANON_KEY',
    import.meta.env.VITE_SUPABASE_ANON_KEY,
  ),
} as const;
