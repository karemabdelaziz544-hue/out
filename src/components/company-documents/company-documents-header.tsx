"use client";

/**
 * Admin Company Documents Header
 */

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { DynamicIcon } from "@/components/ui/icon";

export function CompanyDocumentsHeader() {
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
        <h1 className="customers-header__title">مستندات الشركات</h1>
        <p className="customers-header__desc">
          إدارة ومراجعة المستندات الرسمية للشركات المسجلة (السجل التجاري، البطاقة الضريبية، البطاقة الاستيرادية، القيمة المضافة).
        </p>
      </div>

      <div className="customers-header__actions">
        <button
          type="button"
          onClick={handleRefresh}
          disabled={isPending}
          className="customer-action-btn customer-action-btn--secondary"
          title="تحديث البيانات"
        >
          <DynamicIcon
            name="RefreshCw"
            size={16}
            className={isPending ? "animate-spin" : ""}
          />
          <span>تحديث</span>
        </button>
      </div>
    </div>
  );
}
