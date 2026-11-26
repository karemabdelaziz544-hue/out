"use client";

import React from "react";
import type { ShipmentStatus } from "@/types";
import { SHIPMENT_STATUS_LABELS } from "@/types";
import { DynamicIcon } from "@/components/ui/icon";

interface ShipmentStatusBadgeProps {
  status: ShipmentStatus | string;
}

export function ShipmentStatusBadge({ status }: ShipmentStatusBadgeProps) {
  const label = (SHIPMENT_STATUS_LABELS as Record<string, string>)[status] || status;
  const st = String(status);

  let bg = "var(--color-gray-100)";
  let color = "var(--color-gray-700)";
  let dotBg = "var(--color-gray-400)";
  let border = "1px solid var(--color-gray-200)";
  let icon: React.ReactNode = null;

  if (st === "awaiting_pricing") {
    bg = "var(--color-yellow-light)";
    color = "var(--color-yellow-dark)";
    dotBg = "var(--color-yellow)";
    border = "1px solid rgba(245, 197, 0, 0.4)";
  } else if (st === "price_proposed") {
    bg = "rgba(59, 130, 246, 0.1)";
    color = "#1d4ed8";
    dotBg = "#2563eb";
    border = "1px solid rgba(59, 130, 246, 0.3)";
  } else if (st === "negotiation") {
    bg = "rgba(234, 88, 12, 0.1)";
    color = "#c2410c";
    dotBg = "#ea580c";
    border = "1px solid rgba(234, 88, 12, 0.3)";
  } else if (st === "price_agreed") {
    bg = "var(--color-yellow-light)";
    color = "var(--color-black)";
    dotBg = "var(--color-yellow-dark)";
    border = "1px solid var(--color-yellow)";
  } else if (st === "awaiting_invoice_review") {
    bg = "rgba(245, 158, 11, 0.12)";
    color = "#b45309";
    dotBg = "#f59e0b";
    border = "1px solid rgba(245, 158, 11, 0.35)";
    icon = <DynamicIcon name="Clock" size={12} />;
  } else if (st === "invoice_revision_required") {
    bg = "rgba(239, 68, 68, 0.1)";
    color = "#b91c1c";
    dotBg = "#ef4444";
    border = "1px solid rgba(239, 68, 68, 0.35)";
    icon = <DynamicIcon name="AlertTriangle" size={12} />;
  } else if (st === "invoice_approved") {
    bg = "rgba(16, 185, 129, 0.12)";
    color = "#047857";
    dotBg = "#10b981";
    border = "1px solid rgba(16, 185, 129, 0.3)";
    icon = <DynamicIcon name="CheckCircle" size={12} />;
  } else if (st === "acid_processing") {
    bg = "rgba(99, 102, 241, 0.12)";
    color = "#4338ca";
    dotBg = "#6366f1";
    border = "1px solid rgba(99, 102, 241, 0.35)";
    icon = <DynamicIcon name="Loader" size={12} />;
  } else if (st === "acid_issued") {
    bg = "rgba(16, 185, 129, 0.15)";
    color = "#065f46";
    dotBg = "#10b981";
    border = "1px solid rgba(16, 185, 129, 0.4)";
    icon = <DynamicIcon name="CheckCircle" size={12} />;
  } else if (st === "awaiting_shipment_documents") {
    bg = "rgba(245, 158, 11, 0.12)";
    color = "#b45309";
    dotBg = "#f59e0b";
    border = "1px solid rgba(245, 158, 11, 0.35)";
    icon = <DynamicIcon name="FileText" size={12} />;
  } else if (st === "documents_completed") {
    bg = "rgba(16, 185, 129, 0.16)";
    color = "#065f46";
    dotBg = "#10b981";
    border = "1px solid rgba(16, 185, 129, 0.45)";
    icon = <DynamicIcon name="CheckCircle" size={12} />;
  } else if (st === "ready_for_external_stage") {
    bg = "rgba(16, 185, 129, 0.2)";
    color = "#064e3b";
    dotBg = "#059669";
    border = "1px solid rgba(16, 185, 129, 0.6)";
    icon = <DynamicIcon name="ExternalLink" size={12} />;
  } else if (st === "customs_cleared") {
    bg = "rgba(16, 185, 129, 0.16)";
    color = "#065f46";
    dotBg = "#10b981";
    border = "1px solid rgba(16, 185, 129, 0.45)";
    icon = <DynamicIcon name="CheckCircle" size={12} />;
  } else if (st === "customs_clearance") {
    bg = "var(--color-yellow-light)";
    color = "var(--color-black)";
    dotBg = "var(--color-yellow-dark)";
    border = "1px solid var(--color-yellow)";
    icon = <DynamicIcon name="Ship" size={12} />;
  } else if (st === "submitted") {
    bg = "var(--color-gray-100)";
    color = "var(--color-black)";
    dotBg = "var(--color-black)";
    border = "1px solid var(--color-gray-300)";
  } else if (st === "draft") {
    bg = "var(--color-gray-50)";
    color = "var(--color-gray-500)";
    dotBg = "var(--color-gray-400)";
    border = "1px dashed var(--color-gray-300)";
  }

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.375rem",
        padding: "0.25rem 0.625rem",
        borderRadius: "var(--radius-full)",
        fontSize: "var(--font-size-xs)",
        fontWeight: "var(--font-weight-medium)",
        backgroundColor: bg,
        color: color,
        border: border,
        whiteSpace: "nowrap",
      }}
    >
      {icon || (
        <span
          style={{
            width: "6px",
            height: "6px",
            borderRadius: "50%",
            backgroundColor: dotBg,
            display: "inline-block",
          }}
        />
      )}
      {label}
    </span>
  );
}
