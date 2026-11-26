/**
 * Supabase Browser Client
 *
 * Use this client in Client Components ("use client").
 * Handles session refresh automatically via cookies.
 *
 * DO NOT use server-only imports here.
 */

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database";
import { appConfig } from "@/config/app";

export function createClient() {
  return createBrowserClient<Database>(
    appConfig.supabaseUrl,
    appConfig.supabaseAnonKey,
  );
}
