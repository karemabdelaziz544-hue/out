/**
 * Admin Customers Management Page
 *
 * Route: /customers
 * Strictly requires admin role.
 */

import { connection } from "next/server";
import Link from "next/link";
import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/guards";
import { getCustomers, getCustomerStats } from "@/lib/customers/queries";
import {
  CustomersHeader,
  CustomersStats,
  CustomersToolbar,
  CustomersTable,
  CustomersPagination,
} from "@/components/customers";

export const instant = false;

export const metadata: Metadata = {
  title: "العملاء | OUT",
};

interface CustomersPageProps {
  searchParams: Promise<{
    q?: string;
    status?: "all" | "active" | "inactive";
    page?: string;
  }>;
}

export default async function CustomersPage({
  searchParams,
}: CustomersPageProps) {
  await connection();

  // 1. Enforce admin role server-side
  await requireRole(["admin"]);

  // 2. Resolve search parameters
  const params = await searchParams;
  const query = params.q || "";
  const status = params.status || "all";
  const page = Math.max(1, Number(params.page) || 1);
  const pageSize = 10;

  let statsData;
  let customersData;
  let hasError = false;

  try {
    [statsData, customersData] = await Promise.all([
      getCustomerStats(),
      getCustomers({ query, status, page, pageSize }),
    ]);
  } catch (err) {
    if (process.env.NODE_ENV === "development") {
      console.error("[CustomersPage] Data load failure:", err);
    }
    hasError = true;
  }

  // Error State Handling
  if (hasError || !statsData || !customersData) {
    return (
      <div className="customers-container">
        <CustomersHeader />
        <div className="customers-table-card">
          <div className="customers-state-box">
            <div
              className="customers-state-box__icon"
              style={{ color: "var(--color-black)", backgroundColor: "var(--color-yellow-light)" }}
            >
              ⚠️
            </div>
            <h3 className="customers-state-box__title">تعذر تحميل بيانات العملاء</h3>
            <p className="customers-state-box__desc">
              حدث خطأ أثناء الاتصال بقاعدة البيانات. يُرجى التحقق من الاتصال والمحاولة مجددًا.
            </p>
            <Link
              href="/customers"
              className="customer-action-btn"
              style={{ marginTop: "0.5rem", padding: "0.5rem 1.5rem" }}
            >
              إعادة المحاولة
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const isFiltered = Boolean(query || (status && status !== "all"));

  return (
    <div className="customers-container">
      {/* 1. Header with title & refresh button */}
      <CustomersHeader />

      {/* 2. Customer Summary Stats (Total, Active, Inactive) */}
      <CustomersStats stats={statsData} />

      {/* 3. Toolbar: Search Input + Status Filter */}
      <CustomersToolbar currentQuery={query} currentStatus={status} />

      {/* 4. Customers Table */}
      <CustomersTable
        customers={customersData.customers}
        totalCount={customersData.totalCount}
        isFiltered={isFiltered}
      />

      {/* 5. Pagination */}
      <CustomersPagination
        page={customersData.page}
        pageSize={customersData.pageSize}
        totalCount={customersData.totalCount}
        totalPages={customersData.totalPages}
      />
    </div>
  );
}
