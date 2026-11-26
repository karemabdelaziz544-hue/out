/**
 * Customer My Documents Page
 *
 * Route: /my-documents
 * Dedicated document center for the authenticated customer.
 */

import { connection } from "next/server";
import { redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { requireAuth } from "@/lib/auth/guards";
import { getCustomerDocuments } from "@/lib/documents/queries";
import { routes } from "@/config/app";
import type { DocumentStatus } from "@/types";
import {
  MyDocumentsHeader,
  DocumentsToolbar,
  MyDocumentsTable,
} from "@/components/documents";

export const instant = false;

export const metadata: Metadata = {
  title: "مستنداتي | OUT",
};

interface MyDocumentsPageProps {
  searchParams: Promise<{
    q?: string;
    type?: string;
    status?: string;
    page?: string;
  }>;
}

export default async function MyDocumentsPage({
  searchParams,
}: MyDocumentsPageProps) {
  await connection();

  // 1. Enforce authentication server-side
  const currentUser = await requireAuth();

  // 2. Role redirection: Admin accessing customer portal is redirected to Admin Documents Center
  if (currentUser.role === "admin") {
    redirect(routes.documents);
  }

  // 3. Resolve search parameters
  const params = await searchParams;
  const query = params.q || "";
  const documentType = params.type || "all";
  const statusParam = (params.status || "all") as DocumentStatus | "all";
  const page = Math.max(1, Number(params.page) || 1);
  const pageSize = 10;

  let documentsData;
  let hasError = false;

  try {
    documentsData = await getCustomerDocuments(currentUser.id, {
      query,
      documentType,
      status: statusParam,
      page,
      pageSize,
    });
  } catch (err) {
    if (process.env.NODE_ENV === "development") {
      console.error("[MyDocumentsPage] Data fetch error:", err);
    }
    hasError = true;
  }

  // Error State Handling
  if (hasError || !documentsData) {
    return (
      <div className="customers-container">
        <MyDocumentsHeader />
        <div className="customers-table-card">
          <div className="customers-state-box">
            <div
              className="customers-state-box__icon"
              style={{
                color: "var(--color-black)",
                backgroundColor: "var(--color-yellow-light)",
              }}
            >
              ⚠️
            </div>
            <h3 className="customers-state-box__title">
              حدث خطأ أثناء تحميل مستنداتك
            </h3>
            <p className="customers-state-box__desc">
              تعذر الاتصال بقاعدة البيانات لجلب مستنداتك. يرجى المحاولة مرة أخرى.
            </p>
            <Link
              href="/my-documents"
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

  const isFiltered = Boolean(
    query ||
      (documentType && documentType !== "all") ||
      (statusParam && statusParam !== "all"),
  );

  return (
    <div className="customers-container">
      {/* 1. Header with upload trigger */}
      <MyDocumentsHeader />

      {/* 2. Search Toolbar */}
      <DocumentsToolbar
        currentQuery={query}
        currentType={documentType}
        currentStatus={statusParam}
        availableTypes={documentsData.availableTypes}
        showStatusFilter={true}
      />

      {/* 3. Customer Documents Table */}
      <MyDocumentsTable
        documents={documentsData.documents}
        totalCount={documentsData.totalCount}
        isFiltered={isFiltered}
      />
    </div>
  );
}
