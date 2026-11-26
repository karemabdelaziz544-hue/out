"use client";

import React from "react";
import { DynamicIcon } from "@/components/ui/icon";
import { formatDateAr } from "@/lib/utils";
import type { CustomerCustomsStage } from "@/types";
import { CUSTOMS_STAGE_STATUS_CONFIG } from "@/types/journey";

interface CustomerStageModalProps {
  isOpen: boolean;
  onClose: () => void;
  stage: CustomerCustomsStage | null;
  onActionClick?: (tab: "documents" | "pricing" | "specs") => void;
}

export function CustomerStageModal({
  isOpen,
  onClose,
  stage,
  onActionClick,
}: CustomerStageModalProps) {
  if (!isOpen || !stage) return null;

  const statusCfg = CUSTOMS_STAGE_STATUS_CONFIG[stage.status];

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0, 0, 0, 0.65)",
        backdropFilter: "blur(4px)",
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: "var(--color-surface)",
          border: "2px solid var(--color-black)",
          borderRadius: "var(--radius-lg)",
          width: "100%",
          maxWidth: "540px",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 20px 40px -10px rgba(0, 0, 0, 0.3)",
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: "1.25rem 1.5rem",
            backgroundColor: "var(--color-black)",
            color: "var(--color-white)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "0.75rem",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <span
              style={{
                width: "32px",
                height: "32px",
                borderRadius: "50%",
                backgroundColor: "var(--color-yellow)",
                color: "var(--color-black)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: "bold",
                fontSize: "var(--font-size-sm)",
              }}
            >
              {stage.order}
            </span>
            <h2 style={{ fontSize: "var(--font-size-base)", fontWeight: "bold", margin: 0 }}>
              {stage.title}
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              color: "var(--color-gray-300)",
              cursor: "pointer",
              padding: "0.25rem",
              display: "flex",
              alignItems: "center",
            }}
            title="إغلاق"
          >
            <DynamicIcon name="X" size={20} />
          </button>
        </div>

        {/* Modal Body */}
        <div
          style={{
            padding: "1.5rem",
            display: "flex",
            flexDirection: "column",
            gap: "1.25rem",
          }}
        >
          {/* Status Pill & Summary */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "0.5rem",
              padding: "0.75rem 1rem",
              borderRadius: "var(--radius-md)",
              backgroundColor: "var(--color-surface-raised)",
              border: "1px solid var(--color-border)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span
                style={{
                  fontSize: "11px",
                  padding: "0.25rem 0.6rem",
                  borderRadius: "var(--radius-full)",
                  backgroundColor: statusCfg.bg,
                  color: statusCfg.color,
                  border: `1px solid ${statusCfg.borderColor}`,
                  fontWeight: "bold",
                }}
              >
                {stage.status === "completed"
                  ? "مكتملة ومعتمدة ✓"
                  : stage.isWaitingForCustomer
                  ? "بانتظار إجراء منك"
                  : stage.isCurrentActive
                  ? "قيد التنفيذ حالياً"
                  : "مرحلة قادمة"}
              </span>

              {stage.regulatoryAuthority && (
                <span style={{ fontSize: "11px", color: "var(--color-gray-600)" }}>
                  الجهة: {stage.regulatoryAuthority}
                </span>
              )}
            </div>

            {stage.completedAt && (
              <span style={{ fontSize: "11px", color: "#047857", fontWeight: "bold" }}>
                تاريخ الإنجاز: {formatDateAr(stage.completedAt)}
              </span>
            )}
          </div>

          {/* Description */}
          <div>
            <h3 style={{ fontSize: "var(--font-size-xs)", color: "var(--color-gray-500)", margin: "0 0 0.35rem" }}>
              ماذا يحدث في هذه المرحلة؟
            </h3>
            <p
              style={{
                fontSize: "var(--font-size-sm)",
                color: "var(--color-gray-800)",
                lineHeight: "1.6",
                margin: 0,
              }}
            >
              {stage.customerDescription}
            </p>
          </div>

          {/* Approved Milestone Info if available */}
          {stage.approvedPublicReference && (
            <div
              style={{
                padding: "0.875rem 1rem",
                borderRadius: "var(--radius-md)",
                backgroundColor: "#ecfdf5",
                border: "1px solid #a7f3d0",
                color: "#065f46",
                fontSize: "var(--font-size-sm)",
                display: "flex",
                alignItems: "center",
                gap: "0.625rem",
              }}
            >
              <DynamicIcon name="CheckCircle" size={20} style={{ flexShrink: 0 }} />
              <div>
                <strong>البيان المعتمد للمرحلة: </strong>
                <span dir="ltr" style={{ fontWeight: "bold", fontFamily: "var(--font-family-mono)" }}>
                  {stage.approvedPublicReference}
                </span>
              </div>
            </div>
          )}

          {/* Customer Action Required Banner */}
          {stage.isWaitingForCustomer && stage.customerActionRequired && (
            <div
              style={{
                padding: "1rem",
                borderRadius: "var(--radius-md)",
                backgroundColor: "var(--color-yellow-light)",
                border: "2px solid var(--color-yellow)",
                display: "flex",
                flexDirection: "column",
                gap: "0.75rem",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <DynamicIcon name="AlertCircle" size={18} style={{ color: "#92400e" }} />
                <strong style={{ fontSize: "var(--font-size-sm)", color: "#92400e" }}>
                  الإجراء المطلوب منك حالياً:
                </strong>
              </div>
              <p style={{ fontSize: "var(--font-size-xs)", color: "var(--color-black)", margin: 0 }}>
                {stage.customerActionRequired}
              </p>

              {onActionClick && (
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      if (stage.key === "stage_2_pricing") {
                        onActionClick("pricing");
                      } else {
                        onActionClick("documents");
                      }
                    }}
                    className="btn btn--primary"
                    style={{
                      fontSize: "var(--font-size-xs)",
                      padding: "0.4rem 0.875rem",
                      backgroundColor: "var(--color-black)",
                      color: "var(--color-white)",
                    }}
                  >
                    تنفيذ الإجراء المطلوب الآن
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "0.875rem 1.5rem",
            backgroundColor: "var(--color-gray-50)",
            borderTop: "1px solid var(--color-border)",
            display: "flex",
            justifyContent: "flex-end",
          }}
        >
          <button
            type="button"
            onClick={onClose}
            className="btn btn--outline"
            style={{ fontSize: "var(--font-size-xs)", padding: "0.4rem 1rem" }}
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
}
