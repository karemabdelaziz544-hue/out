"use client";

/**
 * Company Documents Toolbar
 *
 * Search input + Status filter tabs/dropdown.
 * Synchronizes with URL query parameters.
 */

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useState, useTransition, useEffect } from "react";
import { DynamicIcon } from "@/components/ui/icon";

interface CompanyDocumentsToolbarProps {
  currentQuery?: string;
  currentStatus?: string;
}

export function CompanyDocumentsToolbar({
  currentQuery = "",
  currentStatus = "all",
}: CompanyDocumentsToolbarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const [prevQuery, setPrevQuery] = useState(currentQuery);
  const [searchTerm, setSearchTerm] = useState(currentQuery);

  if (prevQuery !== currentQuery) {
    setPrevQuery(currentQuery);
    setSearchTerm(currentQuery);
  }

  useEffect(() => {
    const handler = setTimeout(() => {
      const trimmed = searchTerm.trim();
      const currentParam = searchParams.get("q") || "";

      if (trimmed !== currentParam) {
        const params = new URLSearchParams(searchParams.toString());
        if (trimmed) {
          params.set("q", trimmed);
        } else {
          params.delete("q");
        }
        params.delete("page");

        startTransition(() => {
          router.replace(`${pathname}?${params.toString()}`);
        });
      }
    }, 350);

    return () => clearTimeout(handler);
  }, [searchTerm, pathname, router, searchParams]);

  const handleStatusChange = (status: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (status === "all") {
      params.delete("status");
    } else {
      params.set("status", status);
    }
    params.delete("page");

    startTransition(() => {
      router.replace(`${pathname}?${params.toString()}`);
    });
  };

  const handleResetFilters = () => {
    setSearchTerm("");
    startTransition(() => {
      router.replace(pathname);
    });
  };

  const isFiltered = Boolean(currentQuery || currentStatus !== "all");

  const statusOptions = [
    { value: "all", label: "جميع الحالات" },
    { value: "pending", label: "قيد المراجعة" },
    { value: "approved", label: "معتمد" },
  ];

  return (
    <div className="customers-toolbar" style={{ marginBottom: "1.25rem" }}>
      {/* ─── Search Input ─────────────────────────────────────────────────── */}
      <div className="customers-search">
        <DynamicIcon
          name="Search"
          size={18}
          className="customers-search__icon"
        />
        <input
          type="search"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="ابحث باسم الشركة، العميل، البريد، أو الملف..."
          className="customers-search__input"
          aria-label="البحث في مستندات الشركات"
        />
        {searchTerm && (
          <button
            type="button"
            onClick={() => setSearchTerm("")}
            className="customers-search__clear"
            aria-label="مسح البحث"
          >
            <DynamicIcon name="X" size={14} />
          </button>
        )}
      </div>

      {/* ─── Filters & Actions ────────────────────────────────────────────── */}
      <div className="customers-filters">
        {/* Status Dropdown */}
        <div className="customers-filter-group">
          <label htmlFor="company-doc-status-select" className="customers-filter-label">
            الحالة:
          </label>
          <select
            id="company-doc-status-select"
            value={currentStatus}
            onChange={(e) => handleStatusChange(e.target.value)}
            className="customers-filter-select"
          >
            {statusOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Reset Filters Button */}
        {isFiltered && (
          <button
            type="button"
            onClick={handleResetFilters}
            className="customer-action-btn customer-action-btn--secondary"
            title="إعادة تعيين الفلاتر"
            style={{ fontSize: "var(--font-size-xs)" }}
          >
            <DynamicIcon name="RotateCcw" size={14} />
            <span>إعادة تعيين</span>
          </button>
        )}
      </div>
    </div>
  );
}
