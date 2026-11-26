/**
 * Shipment Readiness Types & Interfaces
 *
 * Types for Step 9 — Nafeza & CargoX Preparation (Internal Readiness Stage).
 * Evaluates internal prerequisites before moving shipments to external customs stage.
 */

export type ReadinessCheckKey =
  | "company_data"
  | "shipment_data"
  | "pricing"
  | "customer_pricing_approval"
  | "preliminary_invoice"
  | "acid"
  | "commercial_invoice"
  | "packing_list"
  | "bill_of_lading"
  | "certificate_of_origin";

export interface ReadinessCheckItem {
  key: ReadinessCheckKey;
  name: string;
  ready: boolean;
  statusText: string;
  explanation: string;
  missingFields?: string[];
}

export interface ShipmentReadinessResult {
  ready: boolean;
  checks: Record<ReadinessCheckKey, ReadinessCheckItem>;
  summary: {
    total: number;
    passed: number;
    failed: number;
  };
}

export interface ShipmentStageHistoryItem {
  id: string;
  shipment_id: string;
  action: string;
  note?: string | null;
  performed_by?: string | null;
  performed_by_name?: string | null;
  performed_at: string;
}
