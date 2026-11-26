/**
 * Admin Documents Management Center
 *
 * Route: /documents
 * Strictly requires admin role.
 */

import { connection } from "next/server";
import Link from "next/link";
import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/guards";
import { getDocuments, getDocumentStats } from "@/lib/documents/queries";
import type { DocumentStatus } from "@/types";
import {
  DocumentsHeader,
  DocumentsStats,
  DocumentsToolbar,
  DocumentsTable,
} from "@/components/documents";

export const instant = false;

export const metadata: Metadata = {
  title: "المستندات | OUT",
};

interface DocumentsPageProps {
  searchParams: Promise<{
    q?: string;
    type?: string;
    status?: string;
    page?: string;
  }>;
}

export default async function DocumentsPage({
  searchParams,
}: DocumentsPageProps) {
  await connection();

  // 1. Strictly enforce admin role server-side
  await requireRole(["admin"]);

  // 2. Resolve search parameters
  const params = await searchParams;
  const query = params.q || "";
  const documentType = params.type || "all";
  const statusParam = (params.status || "all") as DocumentStatus | "all";
  const page = Math.max(1, Number(params.page) || 1);
  const pageSize = 10;

  let statsData;
  let documentsData;
  let hasError = false;

  try {
    [statsData, documentsData] = await Promise.all([
      getDocumentStats(),
      getDocuments({
        query,
        documentType,
        status: statusParam,
        page,
        pageSize,
      }),
    ]);
  } catch (err) {
    if (process.env.NODE_ENV === "development") {
      console.error("[DocumentsPage] Data load failure:", err);
    }
    hasError = true;
  }

  // 3. Error State Handling
  if (hasError || !statsData || !documentsData) {
    return (
      <div className="customers-container">
        <DocumentsHeader />
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
              حدث خطأ أثناء تحميل المستندات
            </h3>
            <p className="customers-state-box__desc">
              تعذر الاتصال بقاعدة البيانات لجلب المستندات. يُرجى التحقق من الاتصال والمحاولة مجددًا.
            </p>
            <Link
              href="/documents"
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
      {/* 1. Header with title & refresh button */}
      <DocumentsHeader />

      {/* 2. Documents Summary Cards */}
      <DocumentsStats stats={statsData} />

      {/* 3. Toolbar: Search Input + Status Filter + Type Filter */}
      <DocumentsToolbar
        currentQuery={query}
        currentType={documentType}
        currentStatus={statusParam}
        availableTypes={documentsData.availableTypes}
        showStatusFilter={true}
      />

      {/* 4. Documents Table */}
      <DocumentsTable
        documents={documentsData.documents}
        totalCount={documentsData.totalCount}
        isFiltered={isFiltered}
      />
    </div>
  );
}
