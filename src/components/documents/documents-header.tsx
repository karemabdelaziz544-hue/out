"use client";

/**
 * Documents Header Component
 *
 * Displays the page title, concise description, and refresh action button.
 */

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { DynamicIcon } from "@/components/ui/icon";

export function DocumentsHeader() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleRefresh = () => {
    startTransition(() => {
      router.refresh();
    });
  };

  return (
    <div className="customers-header">
      <div>
        <h1 className="customers-title">المستندات</h1>
        <p className="customers-subtitle">
          إدارة ومتابعة المستندات المرتبطة بالعملاء والشحنات
        </p>
      </div>

      <div className="customers-header-actions">
        <button
          type="button"
          onClick={handleRefresh}
          disabled={isPending}
          className="customers-btn customers-btn--secondary"
          title="تحديث البيانات"
          aria-label="تحديث البيانات"
        >
          <span
            style={{
              display: "inline-flex",
              animation: isPending ? "spin 1s linear infinite" : "none",
            }}
          >
            <DynamicIcon name="RotateCw" size={16} />
          </span>
          <span>تحديث</span>
        </button>
      </div>
    </div>
  );
}
