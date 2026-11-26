/**
 * Customer Data Queries — Server Side
 *
 * Secure database queries for customer management.
 * All queries are executed with the authenticated session and subject to Supabase RLS.
 */

import { createClient } from "@/lib/supabase/server";
import type {
  Customer,
  CustomerStats,
  CustomersFilterParams,
  CustomersListResult,
} from "@/types";

/**
 * Fetch paginated list of customers with optional search and status filtering.
 */
export async function getCustomers({
  query,
  status = "all",
  page = 1,
  pageSize = 10,
}: CustomersFilterParams = {}): Promise<CustomersListResult> {
  const supabase = await createClient();

  const safePage = Math.max(1, Number(page) || 1);
  const safePageSize = Math.min(50, Math.max(1, Number(pageSize) || 10));
  const from = (safePage - 1) * safePageSize;
  const to = from + safePageSize - 1;

  let dbQuery = supabase
    .from("profiles")
    .select("*", { count: "exact" })
    .eq("role", "customer");

  // Status Filter
  if (status === "active") {
    dbQuery = dbQuery.eq("is_active", true);
  } else if (status === "inactive") {
    dbQuery = dbQuery.eq("is_active", false);
  }

  // Search Filter (clean & trim query)
  if (query && query.trim()) {
    const cleanQ = query.trim().replace(/[%_]/g, ""); // prevent sql wildcard injection
    if (cleanQ.length > 0) {
      dbQuery = dbQuery.or(
        `full_name.ilike.%${cleanQ}%,email.ilike.%${cleanQ}%,phone.ilike.%${cleanQ}%`,
      );
    }
  }

  // Order & Pagination
  dbQuery = dbQuery
    .order("created_at", { ascending: false })
    .range(from, to);

  const { data, count, error } = await dbQuery;

  if (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("[getCustomers] Query error:", error.message);
    }
    throw new Error("فشل في استرجاع بيانات العملاء");
  }

  const totalCount = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / safePageSize));

  return {
    customers: (data as Customer[]) || [],
    totalCount,
    page: safePage,
    pageSize: safePageSize,
    totalPages,
  };
}

/**
 * Fetch customer statistics (total, active, inactive).
 */
export async function getCustomerStats(): Promise<CustomerStats> {
  const supabase = await createClient();

  const [totalRes, activeRes, inactiveRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .eq("role", "customer"),
    supabase
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .eq("role", "customer")
      .eq("is_active", true),
    supabase
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .eq("role", "customer")
      .eq("is_active", false),
  ]);

  if (totalRes.error || activeRes.error || inactiveRes.error) {
    if (process.env.NODE_ENV === "development") {
      console.error("[getCustomerStats] Stats query error:", {
        totalErr: totalRes.error?.message,
        activeErr: activeRes.error?.message,
        inactiveErr: inactiveRes.error?.message,
      });
    }
    throw new Error("فشل في استرجاع إحصائيات العملاء");
  }

  return {
    total: totalRes.count ?? 0,
    active: activeRes.count ?? 0,
    inactive: inactiveRes.count ?? 0,
  };
}

/**
 * Fetch a single customer by id.
 */
export async function getCustomerById(id: string): Promise<Customer | null> {
  if (!id || typeof id !== "string") return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", id)
    .eq("role", "customer")
    .maybeSingle();

  if (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("[getCustomerById] Query error:", error.message);
    }
    return null;
  }

  return data ? (data as Customer) : null;
}
