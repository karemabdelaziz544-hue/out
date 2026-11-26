"use client";

/**
 * Admin External Operations Section (Phase 3 — Manual Nafeza & CargoX Log)
 *
 * Dedicated back-office component for recording, tracking, and auditing manual
 * operations performed outside OUT on Nafeza and CargoX.
 *
 * Features:
 * - Clear distinction of actual operation time vs system record creation time.
 * - Distinct outcome badges: pending, successful, failed, rejected, requires_follow_up.
 * - Manual recording modal with platform-specific operation catalog.
 * - Authenticated creator attribution.
 * - Platform & outcome filtering.
 * - Linkage to related documents and ACID records without duplicating truth.
 */

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DynamicIcon } from "@/components/ui/icon";
import { formatDateAr } from "@/lib/utils";
import { recordExternalOperationAction } from "@/lib/shipments/external-operations-actions";
import {
  EXTERNAL_OPERATION_TYPES,
  OUTCOME_LABELS,
  type ShipmentExternalOperation,
  type ExternalPlatform,
  type ExternalOperationOutcome,
  type Shipment,
  type DocumentItem,
} from "@/types";

interface AdminExternalOperationsSectionProps {
  shipment: Shipment;
  documents: DocumentItem[];
  externalOperations?: ShipmentExternalOperation[];
  onPreviewDocument?: (doc: DocumentItem) => void;
}

export function AdminExternalOperationsSection({
  shipment,
  documents,
  externalOperations = [],
  onPreviewDocument,
}: AdminExternalOperationsSectionProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Filter States
  const [selectedPlatform, setSelectedPlatform] = useState<string>("all");
  const [selectedOutcome, setSelectedOutcome] = useState<string>("all");

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [copiedRefId, setCopiedRefId] = useState<string | null>(null);

  // Form State
  const [formPlatform, setFormPlatform] = useState<ExternalPlatform>("nafeza");
  const [formOperationType, setFormOperationType] = useState<string>("nafeza_document_submission");
  const [formTitle, setFormTitle] = useState<string>("تقديم مستندات الشحنة على نافذة");
  const [formDescription, setFormDescription] = useState<string>("");
  const [formOperationDate, setFormOperationDate] = useState<string>(() => {
    const now = new Date();
    // format as YYYY-MM-DDTHH:mm for datetime-local
    const pad = (n: number) => (n < 10 ? `0${n}` : n);
    return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
  });
  const [formExternalRef, setFormExternalRef] = useState<string>("");
  const [formAcidNumber, setFormAcidNumber] = useState<string>(shipment.acid?.acid_number || "");
  const [formOutcome, setFormOutcome] = useState<ExternalOperationOutcome>("successful");
  const [formExternalResponse, setFormExternalResponse] = useState<string>("");
  const [formDocumentId, setFormDocumentId] = useState<string>("");

  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  // Filtered operations
  const filteredOperations = externalOperations.filter((op) => {
    if (selectedPlatform !== "all" && op.platform !== selectedPlatform) return false;
    if (selectedOutcome !== "all") {
      if (selectedOutcome === "issues") {
        if (!["failed", "rejected", "requires_follow_up"].includes(op.outcome)) return false;
      } else if (op.outcome !== selectedOutcome) {
        return false;
      }
    }
    return true;
  });

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedRefId(id);
    setTimeout(() => setCopiedRefId(null), 2000);
  };

  const handlePlatformChange = (p: ExternalPlatform) => {
    setFormPlatform(p);
    const availableTypes = EXTERNAL_OPERATION_TYPES.filter(
      (t) => t.platform === p || t.platform === "both",
    );
    if (availableTypes.length > 0) {
      setFormOperationType(availableTypes[0].value);
      setFormTitle(availableTypes[0].defaultTitle);
    }
  };

  const handleOperationTypeChange = (typeVal: string) => {
    setFormOperationType(typeVal);
    const found = EXTERNAL_OPERATION_TYPES.find((t) => t.value === typeVal);
    if (found) {
      setFormTitle(found.defaultTitle);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(null);

    const formData = new FormData();
    formData.append("shipment_id", shipment.id);
    formData.append("platform", formPlatform);
    formData.append("operation_type", formOperationType);
    formData.append("title", formTitle);
    formData.append("description", formDescription);
    formData.append("operation_date", formOperationDate);
    formData.append("outcome", formOutcome);
    if (formExternalRef) formData.append("external_reference", formExternalRef);
    if (formAcidNumber) formData.append("acid_number", formAcidNumber);
    if (formExternalResponse) formData.append("external_response", formExternalResponse);
    if (formDocumentId) formData.append("document_id", formDocumentId);

    startTransition(async () => {
      const res = await recordExternalOperationAction(formData);
      if (res.success) {
        setFormSuccess(res.message || "تم تسجيل الإجراء الخارجي بنجاح.");
        setTimeout(() => {
          setIsModalOpen(false);
          setFormSuccess(null);
          setFormDescription("");
          setFormExternalRef("");
          setFormExternalResponse("");
          router.refresh();
        }, 800);
      } else {
        setFormError(res.error || "تعذر حفظ الإجراء الخارجي.");
      }
    });
  };

  const getOutcomeBadgeStyle = (outcome: ExternalOperationOutcome) => {
    switch (outcome) {
      case "successful":
        return {
          bg: "#ecfdf5",
          border: "#10b981",
          color: "#065f46",
          icon: "CheckCircle2",
        };
      case "pending":
        return {
          bg: "var(--color-yellow-light)",
          border: "var(--color-yellow-dark)",
          color: "var(--color-black)",
          icon: "Clock",
        };
      case "requires_follow_up":
        return {
          bg: "#fffbeb",
          border: "#f59e0b",
          color: "#92400e",
          icon: "AlertCircle",
        };
      case "failed":
        return {
          bg: "#fef2f2",
          border: "#ef4444",
          color: "#991b1b",
          icon: "XCircle",
        };
      case "rejected":
        return {
          bg: "#fff1f2",
          border: "#e11d48",
          color: "#9f1239",
          icon: "Ban",
        };
      default:
        return {
          bg: "var(--color-gray-100)",
          border: "var(--color-border)",
          color: "var(--color-gray-700)",
          icon: "Info",
        };
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      {/* Action Bar & Summary Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "0.75rem",
          paddingBottom: "0.75rem",
          borderBottom: "1px solid var(--color-border)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
          <span style={{ fontSize: "var(--font-size-sm)", color: "var(--color-gray-600)" }}>
            إجمالي الإجراءات المسجلة:{" "}
            <strong style={{ color: "var(--color-black)" }}>{externalOperations.length}</strong>
          </span>
        </div>

        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          className="btn btn--primary"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.5rem",
            padding: "0.5rem 1rem",
            fontSize: "var(--font-size-sm)",
          }}
        >
          <DynamicIcon name="PlusCircle" size={16} />
          <span>تسجيل إجراء خارجي جديد</span>
        </button>
      </div>

      {/* Filter Tabs */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "0.75rem",
        }}
      >
        {/* Platform Filter */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
          <span style={{ fontSize: "var(--font-size-xs)", color: "var(--color-gray-500)", marginLeft: "0.25rem" }}>
            المنصة:
          </span>
          {[
            { id: "all", label: "الكل" },
            { id: "nafeza", label: "منظومة نافذة (Nafeza)" },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSelectedPlatform(tab.id)}
              style={{
                padding: "0.3rem 0.625rem",
                borderRadius: "var(--radius-sm)",
                border: selectedPlatform === tab.id ? "1px solid var(--color-black)" : "1px solid var(--color-border)",
                backgroundColor: selectedPlatform === tab.id ? "var(--color-black)" : "var(--color-surface)",
                color: selectedPlatform === tab.id ? "var(--color-white)" : "var(--color-gray-700)",
                fontSize: "var(--font-size-xs)",
                fontWeight: selectedPlatform === tab.id ? "var(--font-weight-semibold)" : "normal",
                cursor: "pointer",
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Outcome Filter */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
          <span style={{ fontSize: "var(--font-size-xs)", color: "var(--color-gray-500)", marginLeft: "0.25rem" }}>
            الحالة:
          </span>
          {[
            { id: "all", label: "الكل" },
            { id: "successful", label: "ناجح" },
            { id: "pending", label: "معلق" },
            { id: "issues", label: "بحاجة لمتابعة / فشل" },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSelectedOutcome(tab.id)}
              style={{
                padding: "0.3rem 0.625rem",
                borderRadius: "var(--radius-sm)",
                border: selectedOutcome === tab.id ? "1px solid var(--color-yellow-dark)" : "1px solid var(--color-border)",
                backgroundColor: selectedOutcome === tab.id ? "var(--color-yellow-light)" : "var(--color-surface)",
                color: selectedOutcome === tab.id ? "var(--color-black)" : "var(--color-gray-700)",
                fontSize: "var(--font-size-xs)",
                fontWeight: selectedOutcome === tab.id ? "var(--font-weight-semibold)" : "normal",
                cursor: "pointer",
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* History Feed List */}
      {filteredOperations.length === 0 ? (
        <div
          style={{
            padding: "2rem 1.5rem",
            textAlign: "center",
            backgroundColor: "var(--color-gray-50)",
            borderRadius: "var(--radius-md)",
            border: "1px dashed var(--color-border)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "0.5rem",
          }}
        >
          <DynamicIcon name="Layers" size={32} style={{ color: "var(--color-gray-400)" }} />
          <h4 style={{ fontSize: "var(--font-size-sm)", margin: 0, color: "var(--color-black)" }}>
            لا توجد إجراءات خارجية مسجلة تطابق التصفية
          </h4>
          <p style={{ fontSize: "var(--font-size-xs)", color: "var(--color-gray-500)", margin: 0, maxWidth: "420px" }}>
            يتم توثيق كافة العمليات التي يجريها الفريق يدوياً على منظومة نافذة وكارغو إكس لضمان المساءلة والمتابعة الدقيقة.
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.875rem" }}>
          {filteredOperations.map((op) => {
            const badgeStyle = getOutcomeBadgeStyle(op.outcome);
            const isNafeza = op.platform === "nafeza";

            return (
              <div
                key={op.id}
                className="card"
                style={{
                  padding: "1.25rem",
                  border: "1px solid var(--color-border)",
                  borderRadius: "var(--radius-md)",
                  backgroundColor: "var(--color-surface)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.75rem",
                }}
              >
                {/* Header Row: Platform & Outcome & Actual Time */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: "0.5rem",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                    {/* Platform Badge */}
                    <span
                      style={{
                        fontSize: "11px",
                        fontWeight: "var(--font-weight-bold)",
                        padding: "0.2rem 0.5rem",
                        borderRadius: "var(--radius-sm)",
                        backgroundColor: isNafeza ? "var(--color-yellow-light)" : "var(--color-black)",
                        color: isNafeza ? "var(--color-yellow-dark)" : "var(--color-white)",
                        border: isNafeza ? "1px solid var(--color-yellow)" : "1px solid var(--color-black)",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.25rem",
                      }}
                    >
                      <DynamicIcon name={isNafeza ? "Building2" : "ShieldCheck"} size={13} />
                      <span>{isNafeza ? "نافذة (Nafeza)" : "منصة خارجية"}</span>
                    </span>

                    {/* Outcome Badge */}
                    <span
                      style={{
                        fontSize: "11px",
                        fontWeight: "var(--font-weight-medium)",
                        padding: "0.2rem 0.5rem",
                        borderRadius: "var(--radius-sm)",
                        backgroundColor: badgeStyle.bg,
                        border: `1px solid ${badgeStyle.border}`,
                        color: badgeStyle.color,
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.25rem",
                      }}
                    >
                      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                      <DynamicIcon name={badgeStyle.icon as any} size={13} />
                      <span>{OUTCOME_LABELS[op.outcome]}</span>
                    </span>

                    <h4
                      style={{
                        fontSize: "var(--font-size-sm)",
                        fontWeight: "var(--font-weight-bold)",
                        margin: 0,
                        color: "var(--color-black)",
                      }}
                    >
                      {op.title}
                    </h4>
                  </div>

                  {/* Operation Date vs Created At */}
                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", fontSize: "var(--font-size-xs)" }}>
                    <span style={{ color: "var(--color-gray-700)" }}>
                      <strong>وقت التنفيذ الفعلي:</strong> {formatDateAr(op.operation_date)}
                    </span>
                    <span style={{ color: "var(--color-gray-400)" }}>•</span>
                    <span style={{ color: "var(--color-gray-500)" }}>
                      توثيق: {formatDateAr(op.created_at)}
                    </span>
                  </div>
                </div>

                {/* Description / Notes */}
                {op.description && (
                  <p
                    style={{
                      fontSize: "var(--font-size-sm)",
                      color: "var(--color-gray-800)",
                      margin: 0,
                      lineHeight: "1.6",
                    }}
                  >
                    {op.description}
                  </p>
                )}

                {/* Reference Numbers & ACID Info */}
                {(op.external_reference || op.acid_number || op.document_title) && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "1rem",
                      flexWrap: "wrap",
                      padding: "0.5rem 0.75rem",
                      backgroundColor: "var(--color-gray-50)",
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid var(--color-border)",
                      fontSize: "var(--font-size-xs)",
                    }}
                  >
                    {op.external_reference && (
                      <div style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
                        <span style={{ color: "var(--color-gray-500)" }}>الرقم المرجعي الخارجي:</span>
                        <strong dir="ltr" style={{ color: "var(--color-black)" }}>
                          {op.external_reference}
                        </strong>
                        <button
                          type="button"
                          onClick={() => handleCopy(op.id, op.external_reference!)}
                          style={{
                            background: "none",
                            border: "none",
                            padding: "0.15rem",
                            cursor: "pointer",
                            color: copiedRefId === op.id ? "#059669" : "var(--color-gray-500)",
                            display: "inline-flex",
                          }}
                          title="نسخ الرقم"
                        >
                          <DynamicIcon name={copiedRefId === op.id ? "Check" : "Copy"} size={13} />
                        </button>
                      </div>
                    )}

                    {op.acid_number && (
                      <div style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
                        <span style={{ color: "var(--color-gray-500)" }}>رقم ACID:</span>
                        <strong dir="ltr" style={{ color: "var(--color-black)" }}>
                          {op.acid_number}
                        </strong>
                      </div>
                    )}

                    {op.document_title && (
                      <div style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
                        <DynamicIcon name="FileText" size={14} style={{ color: "var(--color-gray-500)" }} />
                        <span style={{ color: "var(--color-gray-500)" }}>المستند المرتبط:</span>
                        <strong style={{ color: "var(--color-black)" }}>{op.document_title}</strong>
                        {onPreviewDocument && op.document_id && (
                          <button
                            type="button"
                            onClick={() => {
                              const foundDoc = documents.find((d) => d.id === op.document_id);
                              if (foundDoc) onPreviewDocument(foundDoc);
                            }}
                            className="btn btn--outline"
                            style={{
                              padding: "0.15rem 0.5rem",
                              fontSize: "11px",
                              marginRight: "0.25rem",
                            }}
                          >
                            معاينة
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* External Response / Error Message (if any) */}
                {op.external_response && (
                  <div
                    style={{
                      padding: "0.625rem 0.75rem",
                      borderRadius: "var(--radius-sm)",
                      backgroundColor: op.outcome === "failed" || op.outcome === "rejected" ? "#fef2f2" : "#f8fafc",
                      border: `1px solid ${op.outcome === "failed" || op.outcome === "rejected" ? "#fecaca" : "#e2e8f0"}`,
                      fontSize: "var(--font-size-xs)",
                    }}
                  >
                    <span
                      style={{
                        fontWeight: "var(--font-weight-semibold)",
                        color: op.outcome === "failed" || op.outcome === "rejected" ? "#991b1b" : "var(--color-gray-700)",
                        display: "block",
                        marginBottom: "0.25rem",
                      }}
                    >
                      إشعار / رد النظام الخارجي:
                    </span>
                    <p style={{ margin: 0, color: "var(--color-gray-800)", fontFamily: "var(--font-family-mono)" }}>
                      {op.external_response}
                    </p>
                  </div>
                )}

                {/* Creator Attribution */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    fontSize: "11px",
                    color: "var(--color-gray-500)",
                    borderTop: "1px solid var(--color-gray-100)",
                    paddingTop: "0.5rem",
                  }}
                >
                  <span>
                    تم التوثيق بواسطة: <strong>{op.created_by_name || "موظف العمليات"}</strong>{" "}
                    {op.created_by_role && `(${op.created_by_role})`}
                  </span>
                  <span>معرّف الإجراء: #{op.id.slice(0, 8)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Manual Recording Modal */}
      {isModalOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0, 0, 0, 0.6)",
            backdropFilter: "blur(2px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: "1rem",
            overflowY: "auto",
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget && !isPending) {
              setIsModalOpen(false);
            }
          }}
        >
          <div
            className="card"
            style={{
              width: "100%",
              maxWidth: "640px",
              maxHeight: "90vh",
              overflowY: "auto",
              padding: "1.75rem",
              borderRadius: "var(--radius-md)",
              backgroundColor: "var(--color-surface)",
              boxShadow: "var(--shadow-xl)",
              border: "1px solid var(--color-border)",
            }}
          >
            {/* Modal Header */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "1.25rem",
                borderBottom: "1px solid var(--color-border)",
                paddingBottom: "0.75rem",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <DynamicIcon name="PlusCircle" size={20} style={{ color: "var(--color-yellow-dark)" }} />
                <h3
                  style={{
                    fontSize: "var(--font-size-base)",
                    fontWeight: "var(--font-weight-bold)",
                    margin: 0,
                    color: "var(--color-black)",
                  }}
                >
                  تسجيل إجراء خارجي جديد (منظومة نافذة — Nafeza)
                </h3>
              </div>
              <button
                type="button"
                onClick={() => !isPending && setIsModalOpen(false)}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--color-gray-500)",
                  padding: "0.25rem",
                }}
              >
                <DynamicIcon name="X" size={18} />
              </button>
            </div>

            {/* Error & Success Messages */}
            {formError && (
              <div
                style={{
                  padding: "0.75rem",
                  backgroundColor: "#fef2f2",
                  border: "1px solid #f87171",
                  borderRadius: "var(--radius-sm)",
                  color: "#991b1b",
                  fontSize: "var(--font-size-xs)",
                  marginBottom: "1rem",
                }}
              >
                {formError}
              </div>
            )}

            {formSuccess && (
              <div
                style={{
                  padding: "0.75rem",
                  backgroundColor: "#ecfdf5",
                  border: "1px solid #10b981",
                  borderRadius: "var(--radius-sm)",
                  color: "#065f46",
                  fontSize: "var(--font-size-xs)",
                  marginBottom: "1rem",
                }}
              >
                {formSuccess}
              </div>
            )}

            <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              {/* 1. Platform Selector */}
              <div>
                <label style={{ fontSize: "var(--font-size-xs)", fontWeight: "var(--font-weight-semibold)", display: "block", marginBottom: "0.375rem" }}>
                  المنصة الخارجية *
                </label>
                <div style={{ display: "flex", gap: "0.75rem" }}>
                  <button
                    type="button"
                    onClick={() => handlePlatformChange("nafeza")}
                    style={{
                      flex: 1,
                      padding: "0.625rem",
                      borderRadius: "var(--radius-sm)",
                      border: "2px solid var(--color-black)",
                      backgroundColor: "var(--color-yellow-light)",
                      color: "var(--color-black)",
                      fontWeight: "var(--font-weight-bold)",
                      fontSize: "var(--font-size-sm)",
                      cursor: "default",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "0.5rem",
                    }}
                  >
                    <DynamicIcon name="Building2" size={16} />
                    <span>منظومة نافذة (Nafeza)</span>
                  </button>
                </div>
              </div>

              {/* 2. Operation Type Selector */}
              <div>
                <label style={{ fontSize: "var(--font-size-xs)", fontWeight: "var(--font-weight-semibold)", display: "block", marginBottom: "0.375rem" }}>
                  نوع الإجراء *
                </label>
                <select
                  value={formOperationType}
                  onChange={(e) => handleOperationTypeChange(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "0.625rem",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--color-border)",
                    backgroundColor: "var(--color-surface)",
                    fontSize: "var(--font-size-sm)",
                    fontFamily: "inherit",
                  }}
                >
                  {EXTERNAL_OPERATION_TYPES.filter(
                    (t) => t.platform === formPlatform || t.platform === "both",
                  ).map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* 3. Title */}
              <div>
                <label style={{ fontSize: "var(--font-size-xs)", fontWeight: "var(--font-weight-semibold)", display: "block", marginBottom: "0.375rem" }}>
                  عنوان الإجراء *
                </label>
                <input
                  type="text"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  required
                  placeholder="مثال: تقديم مستندات الشحنة على نافذة"
                  style={{
                    width: "100%",
                    padding: "0.625rem",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--color-border)",
                    fontSize: "var(--font-size-sm)",
                    fontFamily: "inherit",
                  }}
                />
              </div>

              {/* 4. Operation Date & Time (Actual Execution) */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                <div>
                  <label style={{ fontSize: "var(--font-size-xs)", fontWeight: "var(--font-weight-semibold)", display: "block", marginBottom: "0.375rem" }}>
                    وقت التنفيذ الفعلي *
                  </label>
                  <input
                    type="datetime-local"
                    value={formOperationDate}
                    onChange={(e) => setFormOperationDate(e.target.value)}
                    required
                    style={{
                      width: "100%",
                      padding: "0.55rem",
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid var(--color-border)",
                      fontSize: "var(--font-size-xs)",
                      fontFamily: "inherit",
                    }}
                  />
                  <span style={{ fontSize: "11px", color: "var(--color-gray-500)", marginTop: "0.2rem", display: "block" }}>
                    الوقت الفعلي الذي تم فيه الإجراء خارج المنظومة
                  </span>
                </div>

                {/* 5. Outcome Selector */}
                <div>
                  <label style={{ fontSize: "var(--font-size-xs)", fontWeight: "var(--font-weight-semibold)", display: "block", marginBottom: "0.375rem" }}>
                    نتيجة الإجراء *
                  </label>
                  <select
                    value={formOutcome}
                    onChange={(e) => setFormOutcome(e.target.value as ExternalOperationOutcome)}
                    style={{
                      width: "100%",
                      padding: "0.55rem",
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid var(--color-border)",
                      backgroundColor: "var(--color-surface)",
                      fontSize: "var(--font-size-xs)",
                      fontFamily: "inherit",
                    }}
                  >
                    <option value="successful">ناجح ومكتمل (Successful)</option>
                    <option value="pending">قيد الانتظار (Pending)</option>
                    <option value="requires_follow_up">يتطلب متابعة (Requires Follow-up)</option>
                    <option value="failed">فشلت المحاولة (Failed)</option>
                    <option value="rejected">مرفوض من المنظومة (Rejected)</option>
                  </select>
                </div>
              </div>

              {/* 6. External Reference & ACID Number */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                <div>
                  <label style={{ fontSize: "var(--font-size-xs)", fontWeight: "var(--font-weight-semibold)", display: "block", marginBottom: "0.375rem" }}>
                    الرقم المرجعي الخارجي (اختياري)
                  </label>
                  <input
                    type="text"
                    dir="ltr"
                    value={formExternalRef}
                    onChange={(e) => setFormExternalRef(e.target.value)}
                    placeholder="مثال: رقم 46 أو رقم المعاملة"
                    style={{
                      width: "100%",
                      padding: "0.55rem",
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid var(--color-border)",
                      fontSize: "var(--font-size-xs)",
                      fontFamily: "var(--font-family-mono)",
                    }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: "var(--font-size-xs)", fontWeight: "var(--font-weight-semibold)", display: "block", marginBottom: "0.375rem" }}>
                    رقم ACID المرتبط (اختياري)
                  </label>
                  <input
                    type="text"
                    dir="ltr"
                    value={formAcidNumber}
                    onChange={(e) => setFormAcidNumber(e.target.value)}
                    placeholder="مثال: 123456789"
                    style={{
                      width: "100%",
                      padding: "0.55rem",
                      borderRadius: "var(--radius-sm)",
                      border: "1px solid var(--color-border)",
                      fontSize: "var(--font-size-xs)",
                      fontFamily: "var(--font-family-mono)",
                    }}
                  />
                </div>
              </div>

              {/* 7. Related Document Link (Optional) */}
              <div>
                <label style={{ fontSize: "var(--font-size-xs)", fontWeight: "var(--font-weight-semibold)", display: "block", marginBottom: "0.375rem" }}>
                  المستند المرتبط من الشحنة (اختياري)
                </label>
                <select
                  value={formDocumentId}
                  onChange={(e) => setFormDocumentId(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "0.55rem",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--color-border)",
                    backgroundColor: "var(--color-surface)",
                    fontSize: "var(--font-size-xs)",
                    fontFamily: "inherit",
                  }}
                >
                  <option value="">— غير مرتبط بمستند محدد —</option>
                  {documents.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.title || d.document_type || d.file_name} ({d.file_name})
                    </option>
                  ))}
                </select>
              </div>

              {/* 8. Description & Notes */}
              <div>
                <label style={{ fontSize: "var(--font-size-xs)", fontWeight: "var(--font-weight-semibold)", display: "block", marginBottom: "0.375rem" }}>
                  ملاحظات وتفاصيل الإجراء {formOperationType.includes("other") && "* (إلزامي)"}
                </label>
                <textarea
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  rows={3}
                  required={formOperationType.includes("other")}
                  placeholder="بيان تفاصيل الإجراء، اسم المسؤول الخارجي، أو الملاحظات التشغيلية..."
                  style={{
                    width: "100%",
                    padding: "0.625rem",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--color-border)",
                    fontSize: "var(--font-size-sm)",
                    fontFamily: "inherit",
                    resize: "vertical",
                  }}
                />
              </div>

              {/* 9. External Response / Error Message */}
              <div>
                <label style={{ fontSize: "var(--font-size-xs)", fontWeight: "var(--font-weight-semibold)", display: "block", marginBottom: "0.375rem" }}>
                  رد أو رسالة خطأ المنظومة الخارجية (إن وجد)
                </label>
                <textarea
                  value={formExternalResponse}
                  onChange={(e) => setFormExternalResponse(e.target.value)}
                  rows={2}
                  dir="ltr"
                  placeholder="مثال: كود الاستجابة أو نص التحديث الصادر من منظومة نافذة"
                  style={{
                    width: "100%",
                    padding: "0.625rem",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--color-border)",
                    fontSize: "var(--font-size-xs)",
                    fontFamily: "var(--font-family-mono)",
                    resize: "vertical",
                  }}
                />
              </div>

              {/* Modal Buttons */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: "0.75rem",
                  marginTop: "0.75rem",
                  borderTop: "1px solid var(--color-border)",
                  paddingTop: "1rem",
                }}
              >
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  disabled={isPending}
                  className="btn btn--outline"
                  style={{ padding: "0.5rem 1rem", fontSize: "var(--font-size-sm)" }}
                >
                  إلغاء
                </button>

                <button
                  type="submit"
                  disabled={isPending}
                  className="btn btn--primary"
                  style={{
                    padding: "0.5rem 1.25rem",
                    fontSize: "var(--font-size-sm)",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.5rem",
                  }}
                >
                  {isPending && <DynamicIcon name="Clock" size={16} />}
                  <span>{isPending ? "جاري الحفظ..." : "حفظ وتوثيق الإجراء"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
