import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const hasSupabaseConfig = !!(supabaseUrl && supabaseAnonKey && supabaseUrl !== 'YOUR_SUPABASE_URL');

// Fallback to a valid format URL to prevent createClient from crashing immediately, 
// but we won't actually make requests if hasSupabaseConfig is false.
export const supabase = createClient(
  hasSupabaseConfig ? supabaseUrl : 'https://xyz.supabase.co',
  hasSupabaseConfig ? supabaseAnonKey : 'public-anon-key'
);
