/**
 * Global Shipment Tracking — Unified Types
 *
 * Normalized data model consumed by the tracking UI.
 * Provider-specific responses are transformed into these types
 * by each provider adapter before reaching the client.
 *
 * IMPORTANT: These types describe MARITIME TRANSIT only.
 * Customs clearance stages (Stage 01–10) are a separate domain
 * and must never be modified by tracking events.
 */

// ─── Identifier Types ─────────────────────────────────────────────────────────

export type TrackingIdentifierType =
  | "container"       // ISO 6346 container number (e.g. MSCU1234567)
  | "bill_of_lading"  // Carrier B/L number (e.g. MEDUST123456)
  | "booking"         // Carrier booking reference
  | "out_reference"   // OUT internal reference (e.g. OUT-2026-000044)
  | "acid"            // Egyptian ACID number (19 digits)
  | "unknown";

export interface IdentifierDetectionResult {
  type: TrackingIdentifierType;
  normalized: string;
  isValid: boolean;
  errorMessage?: string;
}

// ─── Tracking Request & Response ──────────────────────────────────────────────

export interface TrackingLookupRequest {
  number: string;
  type?: TrackingIdentifierType;
  /** Optional carrier code for faster lookup */
  sealine?: string;
}

export type TrackingResultStatus =
  | "success"                  // Full data with coordinates
  | "success_text_only"        // Events & ports only, no coordinates
  | "not_found"                // Number not registered with carrier
  | "invalid_number"           // Malformed tracking number
  | "provider_error"           // API error / carrier unreachable
  | "auth_error"               // Invalid or expired API key
  | "rate_limited"             // Too many requests
  | "timeout"                  // Request timed out
  | "no_api_key"               // API key not configured
  | "demo"                     // Demo/mock data in development
  | "internal_only"            // OUT/ACID lookup — no maritime data
  | "unsupported_identifier";  // Identifier type not supported for maritime tracking

export interface TrackingPort {
  name: string;
  code?: string;       // UN/LOCODE (e.g. CNXMG)
  country?: string;    // ISO country code
  latitude?: number;
  longitude?: number;
}

export interface TrackingEvent {
  date: string;          // ISO 8601
  description: string;
  location?: string;
  port?: TrackingPort;
  vessel?: string;
  voyage?: string;
  imo?: number;
  isActual: boolean;     // true = confirmed, false = planned/estimated
}

export interface TrackingVessel {
  name: string;
  imo?: number;
  mmsi?: number;
  flag?: string;
  callSign?: string;
}

export interface TrackingRoute {
  originPort?: TrackingPort;
  destinationPort?: TrackingPort;
  /** Ordered list of waypoints/ports in the route */
  waypoints: TrackingPort[];
}

export interface TrackingResult {
  status: TrackingResultStatus;
  trackingNumber: string;
  identifierType: TrackingIdentifierType;

  // Maritime transit data (only present for container/BL/booking lookups)
  carrier?: {
    name?: string;
    code?: string;
  };
  vessel?: TrackingVessel;
  voyage?: string;
  containerNumber?: string;
  containerType?: string;

  route?: TrackingRoute;
  events: TrackingEvent[];

  // Departure & arrival
  departureDate?: string;    // ISO 8601 — actual or estimated
  arrivalDate?: string;      // ISO 8601 — actual or estimated
  eta?: string;              // ISO 8601 — estimated time of arrival
  isDepartureActual?: boolean;
  isArrivalActual?: boolean;

  // Ship position (only when confirmed coordinates available)
  lastPosition?: {
    latitude: number;
    longitude: number;
    updatedAt: string;       // ISO 8601
    heading?: number;
    speed?: number;
  };

  // OUT internal clearance summary (safe public subset)
  outClearanceSummary?: OutClearanceSummary;

  // Data freshness & source
  dataSource: "searates" | "mock" | "internal" | "none";
  lastUpdatedAt?: string;    // ISO 8601
  isDemo: boolean;

  // Error messaging
  errorMessage?: string;
  userMessage?: string;      // Arabic-friendly message for UI
}

// ─── OUT Internal Clearance Summary (Public-Safe DTO) ─────────────────────────

/**
 * Minimal public-safe representation of OUT customs clearance status.
 * NEVER expose: customer name, company, pricing, fees, documents,
 * employee notes, or internal operational details.
 */
export interface OutClearanceSummary {
  referenceNumber: string;
  goodsDescription?: string;
  portOfArrival?: string;
  countryOfOrigin?: string;
  /** General status label safe for public display */
  publicStatusLabel: string;
  /** Current stage description (generic, non-sensitive) */
  currentStageLabel?: string;
  /** Overall progress percentage */
  progressPercentage?: number;
  isFullyCleared: boolean;
}

// ─── Provider Interface ───────────────────────────────────────────────────────

export interface TrackingProviderConfig {
  apiKey?: string;
  baseUrl?: string;
  timeoutMs?: number;
}
