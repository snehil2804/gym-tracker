"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_KEY, SUPABASE_URL, assertSupabaseEnv } from "./env";

let client: SupabaseClient | undefined;

/** Browser client. Uses the publishable key; Row Level Security does the access control. */
export function getSupabase(): SupabaseClient {
  if (!client) {
    assertSupabaseEnv();
    client = createBrowserClient(SUPABASE_URL, SUPABASE_KEY);
  }
  return client;
}
