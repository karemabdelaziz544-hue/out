"use client";

/**
 * My Documents Header Component
 *
 * Header for the customer's /my-documents page with upload action trigger.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DynamicIcon } from "@/components/ui/icon";
import { DocumentUploadModal } from "./document-upload-modal";

export function MyDocumentsHeader() {
  const router = useRouter();
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  return (
    <>
      <div className="customers-header">
        <div>
          <h1 className="customers-title">مستنداتي</h1>
          <p className="customers-subtitle">
            يمكنك من هنا متابعة وإدارة المستندات الخاصة بك.
          </p>
        </div>

        <div className="customers-header-actions">
          <button
            type="button"
            onClick={() => setIsUploadOpen(true)}
            className="customers-btn customers-btn--primary"
            style={{ display: "inline-flex", gap: "0.5rem", alignItems: "center" }}
          >
            <DynamicIcon name="FileText" size={16} />
            <span>رفع مستند</span>
          </button>
        </div>
      </div>

      {/* Upload Modal */}
      <DocumentUploadModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
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
