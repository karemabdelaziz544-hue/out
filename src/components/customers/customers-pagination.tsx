"use client";

/**
 * Customers Pagination Component
 */

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useTransition } from "react";
import { DynamicIcon } from "@/components/ui/icon";

interface CustomersPaginationProps {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

export function CustomersPagination({
  page,
  pageSize,
  totalCount,
  totalPages,
}: CustomersPaginationProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  if (totalCount === 0) return null;

  const from = Math.min((page - 1) * pageSize + 1, totalCount);
  const to = Math.min(page * pageSize, totalCount);

  const handlePageChange = (newPage: number) => {
    if (newPage < 1 || newPage > totalPages || newPage === page) return;

    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(newPage));

    startTransition(() => {
      router.replace(`${pathname}?${params.toString()}`);
    });
  };

  return (
    <div className="customers-pagination-bar">
      <div>
        عرض <strong style={{ color: "var(--color-text-primary)" }}>{from}</strong> إلى{" "}
        <strong style={{ color: "var(--color-text-primary)" }}>{to}</strong> من إجمالي{" "}
        <strong style={{ color: "var(--color-text-primary)" }}>{totalCount}</strong> عميل
      </div>

      <div className="customers-pagination-nav">
        {/* Previous Page (RTL: right chevron goes to previous) */}
        <button
          type="button"
          onClick={() => handlePageChange(page - 1)}
          disabled={page <= 1}
          className="pagination-btn"
          aria-label="الصفحة السابقة"
        >
          <DynamicIcon name="ChevronRight" size={16} />
          <span>السابق</span>
        </button>

        <span style={{ paddingInline: "0.5rem" }}>
          الصفحة {page} من {totalPages}
        </span>

        {/* Next Page (RTL: left chevron goes to next) */}
        <button
          type="button"
          onClick={() => handlePageChange(page + 1)}
          disabled={page >= totalPages}
          className="pagination-btn"
          aria-label="الصفحة التالية"
        >
          <span>التالي</span>
          <DynamicIcon name="ChevronLeft" size={16} />
        </button>
      </div>
    </div>
  );
}
