import { createClient } from '@supabase/supabase-js';
import { env } from './env';

/**
 * Single shared Supabase client for the whole app.
 *
 * Rules:
 *  - Screens/components NEVER import this directly. They go through
 *    a service in src/services/* which uses this client.
 *  - The anon key is public (RLS enforces authorization). Never put
 *    a service-role key here.
 *  - Session persistence is via localStorage; autoRefreshToken keeps
 *    the session alive across tab closures.
 *  - flowType: 'pkce' is required for the Google OAuth redirect flow.
 */
export const supabase = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_ANON_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
      storageKey: 'optilearn.auth',
    },
  },
);
