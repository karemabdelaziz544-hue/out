/**
 * Supabase Server Client
 *
 * Use this client in Server Components, Server Actions, and Route Handlers.
 * Reads the session from cookies via the Next.js `cookies()` API.
 *
 * This file is server-only — do NOT import in Client Components.
 */

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/types/database";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: {
        fetch: (url, options = {}) =>
          fetch(url, {
            ...options,
            cache: "no-store",
          }),
      },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // setAll called from a Server Component — safe to ignore.
            // Session refresh is handled by middleware.
          }
        },
      },
    },
  );
}
