/**
 * Supabase lib barrel export.
 * Do not export server client here — it would be imported in wrong contexts.
 */

export { createClient as createBrowserSupabaseClient } from "./client";
