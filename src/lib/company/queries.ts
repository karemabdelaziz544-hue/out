/**
 * Company Queries — Server Side
 *
 * Secure queries for fetching the current customer's company.
 * Enforces customer isolation via session and Supabase RLS.
 */

import { createClient } from "@/lib/supabase/server";
import { requireAuth } from "@/lib/auth/guards";
import type { Company } from "@/types";

/**
 * Fetch the company belonging to the currently authenticated user.
 * Returns null if the user has no linked company yet.
 */
export async function getCustomerCompany(): Promise<Company | null> {
  const currentUser = await requireAuth();
  const supabase = await createClient();

  // 1. Fetch user's profile to retrieve their company_id
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: profile, error: profileErr } = await (supabase.from("profiles") as any)
    .select("company_id")
    .eq("id", currentUser.id)
    .single();

  if (profileErr || !profile || !profile.company_id) {
    return null;
  }

  // 2. Fetch the company record protected by RLS
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: company, error: compErr } = await (supabase.from("companies") as any)
    .select("*")
    .eq("id", profile.company_id)
    .maybeSingle();

  if (compErr || !company) {
    if (process.env.NODE_ENV === "development" && compErr) {
      console.error("[getCustomerCompany] Query error:", compErr.message);
    }
    return null;
  }

  return company as Company;
}

/**
 * Fetch a company by ID (e.g. for Admin viewing customer's company).
 */
export async function getCompanyById(id: string): Promise<Company | null> {
  if (!id) return null;
  const supabase = await createClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from("companies") as any)
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error || !data) {
    if (process.env.NODE_ENV === "development" && error) {
      console.error("[getCompanyById] Query error:", error.message);
    }
    return null;
  }

  return data as Company;
}

/**
 * Check if the company has all essential clearance information.
 */
export function isCompanyComplete(company: Company | null): boolean {
  if (!company) return false;
  return Boolean(
    company.name?.trim() &&
      company.commercial_registration_number?.trim() &&
      company.tax_card_number?.trim() &&
      company.import_card_number?.trim() &&
      company.vat_number?.trim(),
  );
}

