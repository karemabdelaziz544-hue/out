"use client";

/**
 * Customer Details Actions Component
 *
 * Provides status toggle button with confirmation dialog for the details view.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DynamicIcon } from "@/components/ui/icon";
import { StatusToggleModal } from "./status-toggle-modal";
import type { Customer } from "@/types";

interface CustomerDetailsActionsProps {
  customer: Customer;
}

export function CustomerDetailsActions({ customer }: CustomerDetailsActionsProps) {
  const router = useRouter();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  return (
    <>
      <div className="customer-details-actions">
        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          className={
            customer.is_active
              ? "customer-action-btn customer-action-btn--toggle-danger"
              : "customer-action-btn customer-action-btn--toggle-activate"
          }
          style={{ padding: "0.5rem 1rem", fontSize: "var(--font-size-sm)" }}
        >
          <DynamicIcon
            name={customer.is_active ? "UserX" : "UserCheck"}
            size={18}
          />
          <span>{customer.is_active ? "تعطيل الحساب" : "تفعيل الحساب"}</span>
        </button>
      </div>

      {/* Confirmation Modal */}
      <StatusToggleModal
        customer={customer}
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={(msg) => {
          showToast(msg);
          router.refresh();
        }}
      />

      {/* Toast Feedback */}
      {toastMessage && (
        <div className="feedback-toast feedback-toast--success" role="status">
          <DynamicIcon name="Check" size={18} />
          <span>{toastMessage}</span>
        </div>
      )}
    </>
  );
}
