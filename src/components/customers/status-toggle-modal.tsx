"use client";

/**
 * Customer Account Status Toggle Modal
 *
 * Accessible confirmation dialog for activating or deactivating a customer account.
 */

import { useState, useTransition } from "react";
import { DynamicIcon } from "@/components/ui/icon";
import { toggleCustomerStatusAction } from "@/lib/customers/actions";
import type { Customer } from "@/types";

interface StatusToggleModalProps {
  customer: Customer | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (message: string) => void;
  onError?: (error: string) => void;
}

export function StatusToggleModal({
  customer,
  isOpen,
  onClose,
  onSuccess,
  onError,
}: StatusToggleModalProps) {
  const [isPending, startTransition] = useTransition();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen || !customer) return null;

  const isCurrentlyActive = customer.is_active;
  const nextStatus = !isCurrentlyActive;

  const title = isCurrentlyActive ? "تعطيل حساب العميل؟" : "تفعيل حساب العميل؟";
  const message = isCurrentlyActive
    ? "سيتم تغيير حالة الحساب إلى غير نشط. هل تريد المتابعة؟"
    : "سيتم تفعيل حساب العميل وتمكينه من الوصول. هل تريد المتابعة؟";
  const confirmText = isCurrentlyActive ? "تأكيد التعطيل" : "تأكيد التفعيل";

  const handleConfirm = () => {
    setErrorMessage(null);
    startTransition(async () => {
      const result = await toggleCustomerStatusAction(customer.id, nextStatus);
      if (result.success) {
        onSuccess?.(result.message || "تم تحديث حالة الحساب بنجاح");
        onClose();
      } else {
        const err = result.error || "تعذر تحديث حالة الحساب";
        setErrorMessage(err);
        onError?.(err);
      }
    });
  };

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isPending) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div className="modal-card">
        {/* Header */}
        <div className="modal-header">
          <div
            className={`modal-icon-badge ${
              isCurrentlyActive ? "modal-icon-badge--danger" : ""
            }`}
          >
            <DynamicIcon
              name={isCurrentlyActive ? "AlertTriangle" : "Check"}
              size={20}
            />
          </div>
          <h2 id="modal-title" className="modal-title">
            {title}
          </h2>
        </div>

        {/* Body */}
        <div className="modal-body">
          <p>{message}</p>
          <div
            style={{
              marginTop: "0.75rem",
              padding: "0.75rem",
              backgroundColor: "var(--color-gray-100)",
              borderRadius: "var(--radius-md)",
              fontSize: "var(--font-size-xs)",
              color: "var(--color-text-primary)",
            }}
          >
            <strong>العميل:</strong> {customer.full_name || "بدون اسم"} (
            {customer.email})
          </div>

          {errorMessage && (
            <p
              style={{
                marginTop: "0.75rem",
                color: "#b91c1c",
                fontSize: "var(--font-size-xs)",
              }}
            >
              {errorMessage}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="modal-footer">
          <button
            type="button"
            onClick={onClose}
            disabled={isPending}
            className="customer-action-btn"
          >
            إلغاء
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isPending}
            className={
              isCurrentlyActive
                ? "customer-action-btn customer-action-btn--toggle-danger"
                : "customer-action-btn customer-action-btn--toggle-activate"
            }
            style={{
              fontWeight: 600,
              paddingInline: "1.25rem",
            }}
          >
            {isPending ? "جاري المعالجة..." : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
