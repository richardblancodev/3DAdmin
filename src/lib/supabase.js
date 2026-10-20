import { createClient } from "@supabase/supabase-js";
const configuredSupabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabaseUrl = configuredSupabaseUrl
  ?.replace(/\/rest\/v1\/?$/, "")
  .replace(/\/+$/, "");
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);
export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;
