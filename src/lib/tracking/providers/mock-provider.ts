/**
 * Mock Tracking Provider — Development & Testing Only
 *
 * Provides realistic demo data for UI development and testing.
 * NEVER used as a silent fallback in production.
 * All responses are explicitly marked with isDemo: true and dataSource: "mock".
 *
 * Demo tracking numbers:
 *   DEMO-FULL     → Full result with coordinates & vessel
 *   DEMO-TEXT     → Text-only result (events but no coordinates)
 *   DEMO-PARTIAL  → Partial data (some fields missing)
 *   DEMO-NOTFOUND → Not found response
 *   DEMO-ERROR    → Provider error simulation
 *   DEMO-TIMEOUT  → Timeout simulation
 *   DEMO-RATE     → Rate limit simulation
 */

import type { TrackingProviderAdapter } from "./tracking-adapter";
import type { TrackingResult, TrackingLookupRequest } from "../types";

const DEMO_DELAY_MS = 1200; // Simulates network latency

export class MockProvider implements TrackingProviderAdapter {
  readonly name = "Mock (Development)";

  isAvailable(): boolean {
    return true;
  }

  async lookup(request: TrackingLookupRequest): Promise<TrackingResult> {
    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, DEMO_DELAY_MS));

    const number = request.number.toUpperCase().trim();

    const base: Pick<TrackingResult, "trackingNumber" | "identifierType" | "dataSource" | "isDemo"> = {
      trackingNumber: request.number,
      identifierType: request.type || "container",
      dataSource: "mock",
      isDemo: true,
    };

    // Route to specific demo scenarios
    switch (number) {
      case "DEMO-FULL":
        return this.fullResult(base);
      case "DEMO-TEXT":
        return this.textOnlyResult(base);
      case "DEMO-PARTIAL":
        return this.partialResult(base);
      case "DEMO-NOTFOUND":
        return {
          ...base,
          status: "not_found",
          events: [],
          userMessage: "⚠️ بيانات تجريبية — لم يتم العثور على الشحنة.",
        };
      case "DEMO-ERROR":
        return {
          ...base,
          status: "provider_error",
          events: [],
          userMessage: "⚠️ بيانات تجريبية — محاكاة خطأ في مزود التتبع.",
        };
      case "DEMO-TIMEOUT":
        return {
          ...base,
          status: "timeout",
          events: [],
          userMessage: "⚠️ بيانات تجريبية — محاكاة انتهاء مهلة الاتصال.",
        };
      case "DEMO-RATE":
        return {
          ...base,
          status: "rate_limited",
          events: [],
          userMessage: "⚠️ بيانات تجريبية — محاكاة تجاوز حد الطلبات.",
        };
      default:
        return this.fullResult(base);
    }
  }

  private fullResult(
    base: Pick<TrackingResult, "trackingNumber" | "identifierType" | "dataSource" | "isDemo">,
  ): TrackingResult {
    return {
      ...base,
      status: "success",
      carrier: { name: "خط ملاحي تجريبي (Demo Line)", code: "DEMO" },
      vessel: {
        name: "DEMO VESSEL",
        imo: 9999999,
        flag: "PA",
      },
      voyage: "DEMO-V001",
      containerNumber: "DEMO1234567",
      containerType: "40' High Cube",
      route: {
        originPort: {
          name: "ميناء نينغبو (Demo)",
          code: "CNNGB",
          country: "CN",
          latitude: 29.8683,
          longitude: 121.544,
        },
        destinationPort: {
          name: "ميناء الإسكندرية (Demo)",
          code: "EGALY",
          country: "EG",
          latitude: 31.2001,
          longitude: 29.9187,
        },
        waypoints: [
          { name: "ميناء نينغبو (Demo)", code: "CNNGB", country: "CN", latitude: 29.8683, longitude: 121.544 },
          { name: "ميناء بورسعيد (Demo)", code: "EGPSD", country: "EG", latitude: 31.2565, longitude: 32.2841 },
          { name: "ميناء الإسكندرية (Demo)", code: "EGALY", country: "EG", latitude: 31.2001, longitude: 29.9187 },
        ],
      },
      events: [
        {
          date: "2026-10-10T08:00:00Z",
          description: "تم استلام الحاوية في ساحة الميناء",
          location: "ميناء نينغبو (Demo)",
          isActual: true,
        },
        {
          date: "2026-10-12T14:30:00Z",
          description: "تم تحميل الحاوية على السفينة",
          location: "ميناء نينغبو (Demo)",
          vessel: "DEMO VESSEL",
          voyage: "DEMO-V001",
          imo: 9999999,
          isActual: true,
        },
        {
          date: "2026-10-12T18:00:00Z",
          description: "إبحار السفينة",
          location: "ميناء نينغبو (Demo)",
          vessel: "DEMO VESSEL",
          isActual: true,
        },
        {
          date: "2026-10-25T10:00:00Z",
          description: "عبور قناة السويس",
          location: "ميناء بورسعيد (Demo)",
          isActual: true,
        },
        {
          date: "2026-11-02T06:00:00Z",
          description: "وصول متوقع لميناء الإسكندرية",
          location: "ميناء الإسكندرية (Demo)",
          isActual: false,
        },
      ],
      departureDate: "2026-10-12T18:00:00Z",
      isDepartureActual: true,
      eta: "2026-11-02T06:00:00Z",
      lastPosition: {
        latitude: 30.5,
        longitude: 32.0,
        updatedAt: new Date().toISOString(),
        heading: 290,
        speed: 14.5,
      },
      lastUpdatedAt: new Date().toISOString(),
      userMessage: "⚠️ بيانات تجريبية توضيحية (Demo) — ليست مرتبطة بشحنة أو سفينة حقيقية.",
    };
  }

  private textOnlyResult(
    base: Pick<TrackingResult, "trackingNumber" | "identifierType" | "dataSource" | "isDemo">,
  ): TrackingResult {
    return {
      ...base,
      status: "success_text_only",
      carrier: { name: "خط ملاحي تجريبي (Demo)", code: "DEMO" },
      vessel: { name: "DEMO VESSEL II", imo: 8888888 },
      route: {
        originPort: { name: "ميناء شنغهاي (Demo)", code: "CNSHA", country: "CN" },
        destinationPort: { name: "ميناء الدخيلة (Demo)", code: "EGDKH", country: "EG" },
        waypoints: [
          { name: "ميناء شنغهاي (Demo)", code: "CNSHA", country: "CN" },
          { name: "ميناء الدخيلة (Demo)", code: "EGDKH", country: "EG" },
        ],
      },
      events: [
        {
          date: "2026-10-05T10:00:00Z",
          description: "استلام الحاوية في الميناء",
          location: "ميناء شنغهاي (Demo)",
          isActual: true,
        },
        {
          date: "2026-10-08T16:00:00Z",
          description: "تحميل وإبحار السفينة",
          location: "ميناء شنغهاي (Demo)",
          isActual: true,
        },
        {
          date: "2026-11-05T08:00:00Z",
          description: "وصول متوقع إلى ميناء الدخيلة",
          location: "ميناء الدخيلة (Demo)",
          isActual: false,
        },
      ],
      departureDate: "2026-10-08T16:00:00Z",
      isDepartureActual: true,
      eta: "2026-11-05T08:00:00Z",
      lastUpdatedAt: new Date().toISOString(),
      userMessage:
        "⚠️ بيانات تجريبية — الإحداثيات الجغرافية غير متاحة في هذه المحاكاة.",
    };
  }

  private partialResult(
    base: Pick<TrackingResult, "trackingNumber" | "identifierType" | "dataSource" | "isDemo">,
  ): TrackingResult {
    return {
      ...base,
      status: "success_text_only",
      events: [
        {
          date: "2026-10-15T12:00:00Z",
          description: "تم استلام الحاوية",
          isActual: true,
        },
      ],
      lastUpdatedAt: new Date().toISOString(),
      userMessage: "⚠️ بيانات تجريبية — بيانات جزئية فقط متاحة.",
    };
  }
}
