"use client";

/**
 * Customers Toolbar Component
 *
 * Search input with debounce and status filter tabs.
 * Synchronizes with URL query parameters.
 */

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useState, useTransition, useEffect } from "react";
import { DynamicIcon } from "@/components/ui/icon";

interface CustomersToolbarProps {
  currentQuery?: string;
  currentStatus?: "all" | "active" | "inactive";
}

export function CustomersToolbar({
  currentQuery = "",
  currentStatus = "all",
}: CustomersToolbarProps) {
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
        // Reset page to 1 on search change
        params.delete("page");

        startTransition(() => {
          router.replace(`${pathname}?${params.toString()}`);
        });
      }
    }, 350);

    return () => clearTimeout(handler);
  }, [searchTerm, pathname, router, searchParams]);

  // Handle status filter tab change
  const handleStatusChange = (status: "all" | "active" | "inactive") => {
    const params = new URLSearchParams(searchParams.toString());
    if (status === "all") {
      params.delete("status");
    } else {
      params.set("status", status);
    }
    // Reset page to 1 on filter change
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
          placeholder="ابحث بالاسم أو البريد الإلكتروني أو رقم الموبايل"
          className="customers-search-box__input"
          aria-label="البحث عن العملاء"
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

      {/* Status Filter Tabs */}
      <div className="customers-filters" role="tablist" aria-label="تصفية حسب حالة الحساب">
        <button
          type="button"
          role="tab"
          aria-selected={currentStatus === "all"}
          onClick={() => handleStatusChange("all")}
          className={`customers-filter-btn ${
            currentStatus === "all" ? "customers-filter-btn--active" : ""
          }`}
        >
          كل العملاء
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={currentStatus === "active"}
          onClick={() => handleStatusChange("active")}
          className={`customers-filter-btn ${
            currentStatus === "active" ? "customers-filter-btn--active" : ""
          }`}
        >
          نشط
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={currentStatus === "inactive"}
          onClick={() => handleStatusChange("inactive")}
          className={`customers-filter-btn ${
            currentStatus === "inactive" ? "customers-filter-btn--active" : ""
          }`}
        >
          غير نشط
        </button>
      </div>
    </div>
  );
}
