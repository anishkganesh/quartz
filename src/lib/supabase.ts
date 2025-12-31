import { createBrowserClient } from "@supabase/ssr";
import { SupabaseClient } from "@supabase/supabase-js";

// Check if Supabase env vars are available
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export function createClient(): SupabaseClient | null {
  if (!supabaseUrl || !supabaseAnonKey) {
    // Return null during build or when env vars are missing
    return null;
  }
  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}

// Singleton for client-side usage
let client: SupabaseClient | null = null;
let clientInitialized = false;

export function getSupabaseClient(): SupabaseClient | null {
  if (!clientInitialized) {
    client = createClient();
    clientInitialized = true;
  }
  return client;
}

