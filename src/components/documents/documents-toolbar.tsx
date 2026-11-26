"use client";

/**
 * Documents Toolbar Component
 *
 * Search input with debounce and document type filter dropdown.
 * Synchronizes with URL query parameters.
 */

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useState, useTransition, useEffect } from "react";
import { DynamicIcon } from "@/components/ui/icon";

interface DocumentsToolbarProps {
  currentQuery?: string;
  currentType?: string;
  currentStatus?: string;
  availableTypes?: string[];
  showStatusFilter?: boolean;
}

export function DocumentsToolbar({
  currentQuery = "",
  currentType = "all",
  currentStatus = "all",
  availableTypes = [],
  showStatusFilter = true,
}: DocumentsToolbarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const [prevQuery, setPrevQuery] = useState(currentQuery);
  const [searchTerm, setSearchTerm] = useState(currentQuery);

  // Sync internal state if URL parameter changes externally
  if (prevQuery !== currentQuery) {
    setPrevQuery(currentQuery);
    setSearchTerm(currentQuery);
  }

  // Debounced search updater
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

  const handleTypeChange = (type: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (type === "all") {
      params.delete("type");
    } else {
      params.set("type", type);
    }
    params.delete("page");

    startTransition(() => {
      router.replace(`${pathname}?${params.toString()}`);
    });
  };

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

  const handleClearSearch = () => {
    setSearchTerm("");
    const params = new URLSearchParams(searchParams.toString());
    params.delete("q");
    params.delete("page");
    startTransition(() => {
      router.replace(`${pathname}?${params.toString()}`);
    });
  };

  return (
    <div className="customers-toolbar">
      {/* Search Input */}
      <div className="customers-search-box">
        <span className="customers-search-box__icon" aria-hidden="true">
          <DynamicIcon name="Search" size={18} />
        </span>
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="ابحث باسم المستند، العميل، أو رقم الشحنة"
          className="customers-search-box__input"
          aria-label="البحث عن المستندات"
        />
        {searchTerm && (
          <button
            type="button"
            onClick={handleClearSearch}
            className="customers-search-box__clear"
            title="مسح البحث"
            aria-label="مسح البحث"
          >
            <DynamicIcon name="X" size={16} />
          </button>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        {/* Status Filter */}
        {showStatusFilter && (
          <select
            value={currentStatus}
            onChange={(e) => handleStatusChange(e.target.value)}
            className="customers-btn customers-btn--secondary"
            style={{
              padding: "0.5rem 1rem",
              borderRadius: "var(--radius-md)",
              fontSize: "var(--font-size-sm)",
              backgroundColor: "var(--color-surface)",
              color: "var(--color-text-primary)",
              border: "1px solid var(--color-border)",
            }}
            aria-label="تصفية حسب حالة المستند"
          >
            <option value="all">كل الحالات</option>
            <option value="pending">قيد المراجعة</option>
            <option value="approved">معتمد</option>
          </select>
        )}

        {/* Type Filter */}
        {availableTypes.length > 0 && (
          <select
            value={currentType}
            onChange={(e) => handleTypeChange(e.target.value)}
            className="customers-btn customers-btn--secondary"
            style={{
              padding: "0.5rem 1rem",
              borderRadius: "var(--radius-md)",
              fontSize: "var(--font-size-sm)",
              backgroundColor: "var(--color-surface)",
              color: "var(--color-text-primary)",
              border: "1px solid var(--color-border)",
            }}
            aria-label="تصفية حسب نوع المستند"
          >
            <option value="all">جميع أنواع المستندات</option>
            {availableTypes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}
