"use client";

/**
 * Pricing History Timeline Component
 *
 * Displays chronological audit events of pricing and negotiation
 * inside Admin Shipment Details.
 */

import React from "react";
import { DynamicIcon } from "@/components/ui/icon";
import { formatDateAr } from "@/lib/utils";
import type { ShipmentPricingHistoryItem } from "@/types";
import { PRICING_ACTION_LABELS } from "@/types";

interface PricingHistoryTimelineProps {
  history: ShipmentPricingHistoryItem[];
}

export function PricingHistoryTimeline({
  history,
}: PricingHistoryTimelineProps) {
  if (!history || history.length === 0) {
    return null;
  }

  const formatPrice = (val?: number | null, curr = "EGP") => {
    if (val === undefined || val === null) return "—";
    return `${val.toLocaleString("ar-EG")} ${curr}`;
  };

  const formatDateTime = (iso: string) => {
    try {
      const d = new Date(iso);
      const datePart = formatDateAr(iso);
      const timePart = d.toLocaleTimeString("ar-EG", {
        hour: "2-digit",
        minute: "2-digit",
      });
      return `${datePart} — ${timePart}`;
    } catch {
      return iso;
    }
  };

  const getActionIcon = (action: string) => {
    switch (action) {
      case "estimate_created":
        return <DynamicIcon name="Coins" size={16} />;
      case "negotiation_requested":
        return <DynamicIcon name="MessageSquare" size={16} />;
      case "final_price_set":
        return <DynamicIcon name="Tag" size={16} />;
      case "customer_approved":
        return <DynamicIcon name="CheckCircle" size={16} />;
      default:
        return <DynamicIcon name="Clock" size={16} />;
    }
  };

  return (
    <div
      className="card"
      style={{
        padding: "1.75rem",
        border: "1px solid var(--color-border)",
        backgroundColor: "var(--color-surface)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.625rem",
          marginBottom: "1.25rem",
          borderBottom: "1px solid var(--color-border)",
          paddingBottom: "0.75rem",
        }}
      >
        <DynamicIcon name="History" size={20} />
        <h2
          style={{
            fontSize: "var(--font-size-lg)",
            fontWeight: "var(--font-weight-semibold)",
            margin: 0,
            color: "var(--color-black)",
          }}
        >
          سجل التسعير (Audit Timeline)
        </h2>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "1.25rem",
          position: "relative",
          paddingRight: "1rem",
          borderRight: "2px solid var(--color-gray-200)",
          marginRight: "0.5rem",
        }}
      >
        {history.map((item) => (
          <div
            key={item.id}
            style={{
              position: "relative",
              display: "flex",
              flexDirection: "column",
              gap: "0.25rem",
            }}
          >
            {/* Timeline bullet dot */}
            <div
              style={{
                position: "absolute",
                right: "-1.45rem",
                top: "2px",
                width: "14px",
                height: "14px",
                borderRadius: "50%",
                backgroundColor: "var(--color-yellow)",
                border: "2px solid var(--color-surface)",
                boxShadow: "0 0 0 1px var(--color-gray-300)",
              }}
            />

            {/* Event Header: Date & Time */}
            <div
              style={{
                fontSize: "var(--font-size-xs)",
                color: "var(--color-gray-500)",
                fontWeight: "var(--font-weight-medium)",
              }}
            >
              {formatDateTime(item.performed_at)}
              {item.performed_by_name && (
                <span style={{ marginRight: "0.5rem", color: "var(--color-gray-600)" }}>
                  بواسطة: {item.performed_by_name}
                </span>
              )}
            </div>

            {/* Event Description */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                marginTop: "0.125rem",
              }}
            >
              <span style={{ color: "var(--color-black)" }}>
                {getActionIcon(item.action)}
              </span>
              <strong style={{ fontSize: "var(--font-size-sm)", color: "var(--color-black)" }}>
                {PRICING_ACTION_LABELS[item.action] || item.action}
              </strong>
            </div>

            {/* Event Details / Numbers */}
            {item.action === "estimate_created" &&
              item.estimated_min_price !== null &&
              item.estimated_max_price !== null && (
                <div
                  style={{
                    fontSize: "var(--font-size-sm)",
                    color: "var(--color-gray-800)",
                    fontWeight: "var(--font-weight-semibold)",
                    marginTop: "0.125rem",
                  }}
                >
                  {formatPrice(item.estimated_min_price, item.currency)} –{" "}
                  {formatPrice(item.estimated_max_price, item.currency)}
                </div>
              )}

            {item.action === "final_price_set" && item.final_price !== null && (
              <div
                style={{
                  fontSize: "var(--font-size-sm)",
                  color: "var(--color-gray-800)",
                  fontWeight: "var(--font-weight-semibold)",
                  marginTop: "0.125rem",
                }}
              >
                {formatPrice(item.final_price, item.currency)}
              </div>
            )}

            {item.action === "customer_approved" && (
              <div
                style={{
                  fontSize: "var(--font-size-sm)",
                  color: "#047857",
                  fontWeight: "var(--font-weight-semibold)",
                  marginTop: "0.125rem",
                }}
              >
                {item.final_price !== null
                  ? `السعر المعتمد: ${formatPrice(item.final_price, item.currency)}`
                  : item.estimated_min_price !== null && item.estimated_max_price !== null
                  ? `السعر المعتمد: ${formatPrice(item.estimated_min_price, item.currency)} – ${formatPrice(item.estimated_max_price, item.currency)}`
                  : null}
              </div>
            )}

            {item.notes && (
              <p
                style={{
                  fontSize: "var(--font-size-xs)",
                  color: "var(--color-gray-500)",
                  margin: "0.125rem 0 0",
                }}
              >
                {item.notes}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
