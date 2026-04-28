import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const SUPABASE_URL =  'https://jxdllmwdyvhcsdvodnbb.supabase.co/rest/v1/';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imp4ZGxsbXdkeXZoY3Nkdm9kbmJiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMDg2OTgsImV4cCI6MjA5Mjg4NDY5OH0.KlkSqiB_KRT6aQdN-olzIo6sYLZQ0ECA9KBoUs6F44g';
export const client = createClient(SUPABASE_URL, SUPABASE_KEY);
