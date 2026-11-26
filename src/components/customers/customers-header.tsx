"use client";

/**
 * Customers Header Component
 */

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { DynamicIcon } from "@/components/ui/icon";

export function CustomersHeader() {
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
        <h1 className="customers-header__title">العملاء</h1>
        <p className="customers-header__desc">
          إدارة حسابات العملاء ومراجعة بياناتهم وحالة حساباتهم.
        </p>
      </div>

      <div className="customers-header__actions">
        <button
          type="button"
          onClick={handleRefresh}
          disabled={isPending}
          className="customers-refresh-btn"
          title="تحديث بيانات العملاء"
          aria-label="تحديث البيانات"
        >
          <DynamicIcon
            name="RotateCw"
            size={16}
            className={isPending ? "spin" : undefined}
          />
          <span>{isPending ? "جاري التحديث..." : "تحديث البيانات"}</span>
        </button>
      </div>
    </div>
  );
}
