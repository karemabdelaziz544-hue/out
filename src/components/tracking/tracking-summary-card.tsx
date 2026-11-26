"use client";

import { Ship, Calendar, Clock, CheckCircle2, AlertTriangle, ShieldCheck } from "lucide-react";
import type { TrackingResult } from "@/lib/tracking/types";

interface TrackingSummaryCardProps {
  result: TrackingResult;
}

const STATUS_CONFIG: Record<
  string,
  { label: string; badgeClass: string; icon: typeof Ship }
> = {
  success: {
    label: "في الملاحة البحرية",
    badgeClass: "badge-in-transit",
    icon: Ship,
  },
  success_text_only: {
    label: "بيانات الرحلة متاحة (نصياً)",
    badgeClass: "badge-in-transit",
    icon: Ship,
  },
  internal_only: {
    label: "إجراءات OUT الداخلية",
    badgeClass: "badge-customs",
    icon: ShieldCheck,
  },
};

function formatDate(dateStr?: string): string | null {
  if (!dateStr) return null;
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return new Intl.DateTimeFormat("ar-EG", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  } catch {
    return dateStr;
  }
}

export function TrackingSummaryCard({ result }: TrackingSummaryCardProps) {
  const origin = result.route?.originPort;
  const destination = result.route?.destinationPort;
  const vessel = result.vessel;
  const carrier = result.carrier;
  const lastEvent = result.events && result.events.length > 0 ? result.events[result.events.length - 1] : undefined;

  const statusInfo = STATUS_CONFIG[result.status] || {
    label: lastEvent?.description || "قيد المتابعة الملاحية",
    badgeClass: "badge-in-transit",
    icon: Ship,
  };

  const StatusIcon = statusInfo.icon;

  return (
    <div className="tracking-summary-card" dir="rtl">
      {/* Header bar with number & status */}
      <div className="tracking-summary-header">
        <div className="tracking-summary-title-group">
          <div className="tracking-number-row">
            <span className="tracking-identifier-label">رقم التتبع:</span>
            <span className="tracking-identifier-value" dir="ltr">{result.trackingNumber}</span>
          </div>

          <div className="tracking-badges-row">
            <span className={`tracking-status-badge ${statusInfo.badgeClass}`}>
              <StatusIcon size={14} className="inline-block ml-1" />
              {statusInfo.label}
            </span>

            {/* Carrier name if available */}
            {carrier?.name && (
              <span className="tracking-carrier-badge">
                الخط الملاحي: {carrier.name}
              </span>
            )}

            {/* Demo indicator if applicable */}
            {result.isDemo && (
              <span className="tracking-demo-badge" title="بيانات تجريبية لأغراض العرض والتطوير فقط">
                <AlertTriangle size={12} className="inline-block ml-1" />
                بيانات تجريبية (Demo)
              </span>
            )}
          </div>
        </div>

        {/* Last updated timestamp */}
        {(result.lastUpdatedAt || result.lastPosition?.updatedAt) && (
          <div className="tracking-last-updated">
            <Clock size={13} className="inline-block ml-1" />
            <span>آخر تحديث: {formatDate(result.lastUpdatedAt || result.lastPosition?.updatedAt)}</span>
          </div>
        )}
      </div>

      {/* Origin -> Destination Route Cards */}
      <div className="tracking-route-grid">
        {/* Origin Port */}
        {origin?.name && (
          <div className="tracking-port-card origin">
            <div className="tracking-port-role">ميناء الشحن (المغادرة)</div>
            <div className="tracking-port-name">{origin.name}</div>
            {result.departureDate && (
              <div className="tracking-port-date">
                <Calendar size={13} className="inline-block ml-1" />
                تاريخ المغادرة: {formatDate(result.departureDate)}
              </div>
            )}
          </div>
        )}

        {/* Vessel & Voyage details (middle indicator) */}
        {(vessel?.name || result.voyage) && (
          <div className="tracking-vessel-card">
            <div className="tracking-vessel-icon-wrapper">
              <Ship size={22} />
            </div>
            {vessel?.name && (
              <div className="tracking-vessel-name">
                السفينة: <strong dir="ltr">{vessel.name}</strong>
              </div>
            )}
            {result.voyage && (
              <div className="tracking-voyage-number">
                رقم الرحلة: <strong dir="ltr">{result.voyage}</strong>
              </div>
            )}
          </div>
        )}

        {/* Destination Port */}
        {destination?.name && (
          <div className="tracking-port-card destination">
            <div className="tracking-port-role">ميناء الوصول (المقصد)</div>
            <div className="tracking-port-name">{destination.name}</div>
            {result.eta && (
              <div className="tracking-port-date arrival">
                <Calendar size={13} className="inline-block ml-1" />
                الوصول المتوقع (ETA): <strong>{formatDate(result.eta)}</strong>
              </div>
            )}
            {result.arrivalDate && (
              <div className="tracking-port-date actual-arrival">
                <CheckCircle2 size={13} className="inline-block ml-1" />
                الوصول الفعلي: <strong>{formatDate(result.arrivalDate)}</strong>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Container specifications if available */}
      {(result.containerType || result.containerNumber) && (
        <div className="tracking-meta-footer">
          {result.containerNumber && (
            <div className="tracking-meta-item">
              <span className="meta-label">رقم الحاوية:</span>
              <span className="meta-value" dir="ltr">{result.containerNumber}</span>
            </div>
          )}
          {result.containerType && (
            <div className="tracking-meta-item">
              <span className="meta-label">نوع الحاوية:</span>
              <span className="meta-value">{result.containerType}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
