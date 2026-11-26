/**
 * SeaRates Container Tracking Provider
 *
 * Real integration with SeaRates Tracking API v3.
 * Endpoint: https://sirius.searates.com/tracking/api
 *
 * Supports: Container Numbers, Bill of Lading, Booking Numbers.
 * Authentication: api_key query parameter (server-side only).
 *
 * Response statuses from SeaRates:
 *   SUCCESS           — Full data with coordinates
 *   ONLY_TEXT          — Events/milestones only, no geographic route
 *   DATA_NOT_FOUND     — Number not found or wrong carrier
 *   WRONG_CONTAINER_NUMBER — Invalid container format
 *   WRONG_API_KEY      — Authentication failure
 *   EXPIRED_API_KEY    — Subscription expired
 *   NO_RESPONSE_FROM_CARRIER — Carrier timeout
 */

import type { TrackingProviderAdapter } from "./tracking-adapter";
import type {
  TrackingResult,
  TrackingLookupRequest,
  TrackingProviderConfig,
  TrackingEvent,
  TrackingPort,
  TrackingVessel,
  TrackingRoute,
} from "../types";

const SEARATES_BASE_URL = "https://sirius.searates.com/tracking/api";
const DEFAULT_TIMEOUT_MS = 15000;

/** Map identifier type to SeaRates type parameter */
function toSearatesType(identifierType: string): string | undefined {
  switch (identifierType) {
    case "container": return "CT";
    case "bill_of_lading": return "BL";
    case "booking": return "BK";
    default: return undefined;
  }
}

/**
 * Parse SeaRates event into normalized TrackingEvent.
 */
function parseEvent(
  raw: Record<string, unknown>,
  portsByIndex: Map<number, TrackingPort>,
): TrackingEvent | null {
  const dateVal = raw.date;
  if (dateVal == null) return null;

  let dateStr: string;
  if (typeof dateVal === "number") {
    dateStr = new Date(dateVal * 1000).toISOString();
  } else if (typeof dateVal === "string") {
    dateStr = new Date(dateVal).toISOString();
  } else {
    return null;
  }

  // Validate date
  if (isNaN(new Date(dateStr).getTime())) return null;

  const locationIdx = typeof raw.location === "number" ? raw.location : undefined;
  const port = locationIdx !== undefined ? portsByIndex.get(locationIdx) : undefined;

  return {
    date: dateStr,
    description: String(raw.description || raw.descr || "حدث غير محدد"),
    location: port?.name,
    port,
    vessel: typeof raw.vessel === "string" ? raw.vessel : undefined,
    voyage: typeof raw.voyage === "string" ? raw.voyage : undefined,
    imo: typeof raw.imo === "number" ? raw.imo : undefined,
    isActual: raw.planner !== true,
  };
}

/**
 * Parse a SeaRates point into a TrackingPort.
 */
function parsePort(raw: Record<string, unknown>): TrackingPort {
  return {
    name: String(raw.name || ""),
    code: typeof raw.code5 === "string" ? raw.code5 : undefined,
    country: typeof raw.country === "string" ? raw.country : undefined,
    latitude: typeof raw.lat === "number" && isFinite(raw.lat) ? raw.lat : undefined,
    longitude: typeof raw.lng === "number" && isFinite(raw.lng) ? raw.lng : undefined,
  };
}

export class SearatesProvider implements TrackingProviderAdapter {
  readonly name = "SeaRates";
  private apiKey: string | undefined;
  private baseUrl: string;
  private timeoutMs: number;

  constructor(config: TrackingProviderConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl || SEARATES_BASE_URL;
    this.timeoutMs = config.timeoutMs || DEFAULT_TIMEOUT_MS;
  }

  isAvailable(): boolean {
    return typeof this.apiKey === "string" && this.apiKey.length > 0;
  }

  async lookup(request: TrackingLookupRequest): Promise<TrackingResult> {
    const baseResult: Omit<TrackingResult, "status" | "userMessage"> = {
      trackingNumber: request.number,
      identifierType: request.type || "unknown",
      events: [],
      dataSource: "searates",
      isDemo: false,
    };

    // Check API key availability
    if (!this.isAvailable()) {
      return {
        ...baseResult,
        status: "no_api_key",
        userMessage: "خدمة التتبع البحري غير متاحة حالياً. يرجى المحاولة لاحقاً.",
      };
    }

    // Build URL
    const url = new URL(this.baseUrl);
    url.searchParams.set("api_key", this.apiKey!);
    url.searchParams.set("number", request.number);
    url.searchParams.set("sealine", request.sealine || "0"); // 0 = auto-detect carrier
    url.searchParams.set("define_path", "true");

    const searatesType = toSearatesType(request.type || "");
    if (searatesType) {
      url.searchParams.set("type", searatesType);
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

      const response = await fetch(url.toString(), {
        method: "GET",
        signal: controller.signal,
        headers: { Accept: "application/json" },
        cache: "no-store",
      });

      clearTimeout(timeout);

      if (response.status === 429) {
        return {
          ...baseResult,
          status: "rate_limited",
          userMessage: "تم تجاوز الحد المسموح من الطلبات. يرجى المحاولة بعد قليل.",
        };
      }

      if (!response.ok) {
        return {
          ...baseResult,
          status: "provider_error",
          userMessage: "تعذر الاتصال بمزود التتبع البحري. يرجى المحاولة لاحقاً.",
        };
      }

      const data = await response.json();
      return this.normalizeResponse(data, baseResult);
    } catch (error: unknown) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return {
          ...baseResult,
          status: "timeout",
          userMessage: "انتهت مهلة الاتصال بمزود التتبع. يرجى المحاولة لاحقاً.",
        };
      }

      return {
        ...baseResult,
        status: "provider_error",
        userMessage: "حدث خطأ أثناء الاتصال بمزود التتبع. يرجى المحاولة لاحقاً.",
      };
    }
  }

  /**
   * Normalize a SeaRates API response into our unified TrackingResult.
   */
  private normalizeResponse(
    data: Record<string, unknown>,
    base: Omit<TrackingResult, "status" | "userMessage">,
  ): TrackingResult {
    const response = (data.response || data) as Record<string, unknown>;
    const apiStatus = String(response.status || "");

    // Handle error statuses
    switch (apiStatus) {
      case "WRONG_API_KEY":
      case "EXPIRED_API_KEY":
        return {
          ...base,
          status: "auth_error",
          userMessage: "خدمة التتبع البحري غير متاحة حالياً بسبب خطأ في المصادقة.",
        };
      case "DATA_NOT_FOUND":
        return {
          ...base,
          status: "not_found",
          userMessage: "لم يتم العثور على بيانات لهذا الرقم لدى الخطوط الملاحية. تأكد من صحة الرقم.",
        };
      case "WRONG_CONTAINER_NUMBER":
        return {
          ...base,
          status: "invalid_number",
          userMessage: "رقم الحاوية غير صالح. يرجى التحقق من الرقم وإعادة المحاولة.",
        };
      case "NO_RESPONSE_FROM_CARRIER":
        return {
          ...base,
          status: "provider_error",
          userMessage: "لم يستجب الخط الملاحي للاستعلام. يرجى المحاولة لاحقاً.",
        };
    }

    if (apiStatus !== "SUCCESS" && apiStatus !== "ONLY_TEXT") {
      return {
        ...base,
        status: "provider_error",
        userMessage: "استجابة غير متوقعة من مزود التتبع.",
      };
    }

    // Parse points (ports)
    const points = Array.isArray(response.points) ? response.points : [];
    const portsByIndex = new Map<number, TrackingPort>();
    const waypoints: TrackingPort[] = [];
    const allEvents: TrackingEvent[] = [];
    let primaryVessel: TrackingVessel | undefined;

    for (let i = 0; i < points.length; i++) {
      const raw = points[i] as Record<string, unknown>;
      const port = parsePort(raw);
      portsByIndex.set(typeof raw.id === "number" ? raw.id : i + 1, port);
      waypoints.push(port);

      // Parse events from each point
      const rawEvents = Array.isArray(raw.events) ? raw.events : [];
      for (const rawEvt of rawEvents) {
        const evt = parseEvent(rawEvt as Record<string, unknown>, portsByIndex);
        if (evt) {
          allEvents.push(evt);
          // Extract vessel info from the first event that has it
          if (!primaryVessel && evt.vessel) {
            primaryVessel = {
              name: evt.vessel,
              imo: evt.imo,
            };
          }
        }
      }
    }

    // Sort events chronologically
    allEvents.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Determine origin and destination ports
    const originPort = waypoints[0];
    const destinationPort = waypoints.length > 1 ? waypoints[waypoints.length - 1] : undefined;

    // Build route
    const route: TrackingRoute | undefined =
      waypoints.length > 0 ? { originPort, destinationPort, waypoints } : undefined;

    // Extract departure/arrival dates from events
    const departureEvents = allEvents.filter(
      (e) =>
        e.isActual &&
        (e.description.toLowerCase().includes("depart") ||
          e.description.toLowerCase().includes("loaded") ||
          e.description.toLowerCase().includes("sailed")),
    );
    const arrivalEvents = allEvents.filter(
      (e) =>
        e.isActual &&
        (e.description.toLowerCase().includes("arriv") ||
          e.description.toLowerCase().includes("discharg")),
    );

    const departureDate = departureEvents[0]?.date;
    const lastArrival = arrivalEvents[arrivalEvents.length - 1]?.date;

    // Find planned (non-actual) arrival for ETA
    const plannedArrival = allEvents.find(
      (e) =>
        !e.isActual &&
        (e.description.toLowerCase().includes("arriv") ||
          e.description.toLowerCase().includes("eta")),
    );

    // Determine if we have coordinates for a live position
    const hasCoordinates = apiStatus === "SUCCESS";
    let lastPosition: TrackingResult["lastPosition"] = undefined;

    if (hasCoordinates && waypoints.length > 0) {
      // Find the last waypoint with valid coordinates
      for (let i = waypoints.length - 1; i >= 0; i--) {
        const wp = waypoints[i];
        if (wp.latitude != null && wp.longitude != null) {
          lastPosition = {
            latitude: wp.latitude,
            longitude: wp.longitude,
            updatedAt: new Date().toISOString(),
          };
          break;
        }
      }
    }

    return {
      ...base,
      status: hasCoordinates ? "success" : "success_text_only",
      carrier: undefined, // SeaRates doesn't always return carrier in a separate field
      vessel: primaryVessel,
      voyage: primaryVessel ? allEvents.find((e) => e.voyage)?.voyage : undefined,
      route,
      events: allEvents,
      departureDate,
      arrivalDate: lastArrival,
      isDepartureActual: !!departureDate,
      isArrivalActual: !!lastArrival,
      eta: plannedArrival?.date,
      lastPosition,
      lastUpdatedAt: new Date().toISOString(),
      userMessage: undefined,
    };
  }
}
