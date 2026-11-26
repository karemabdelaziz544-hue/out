/**
 * Tracking Service — Central Orchestrator
 *
 * Routes tracking lookups to the correct source:
 * 1. Maritime identifiers (container, BL, booking) → SeaRates API (or Mock in dev)
 * 2. OUT internal references → Internal database lookup (public-safe DTO)
 * 3. ACID numbers → Internal database lookup + informational message
 *
 * Security rules:
 * - Never sends OUT/ACID identifiers to external maritime providers
 * - Never exposes customer names, pricing, fees, or internal notes
 * - Never lets maritime events modify customs clearance stages
 * - Uses server-side API keys only
 */

import type { TrackingResult, TrackingLookupRequest, OutClearanceSummary } from "./types";
import type { TrackingProviderAdapter } from "./providers/tracking-adapter";
import { SearatesProvider } from "./providers/searates-provider";
import { MockProvider } from "./providers/mock-provider";
import {
  detectIdentifierType,
  validateIdentifier,
  isMaritimeIdentifier,
} from "./identifier-validator";

// ─── In-Memory Rate Limiter ───────────────────────────────────────────────────

const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 10;  // Per IP per window

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

const rateLimitMap = new Map<string, RateLimitEntry>();

function checkRateLimit(clientIp: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(clientIp);

  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(clientIp, { count: 1, windowStart: now });
    return true;
  }

  if (entry.count >= RATE_LIMIT_MAX_REQUESTS) {
    return false;
  }

  entry.count++;
  return true;
}

// Clean up stale entries periodically (every 5 minutes)
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [ip, entry] of rateLimitMap) {
      if (now - entry.windowStart > RATE_LIMIT_WINDOW_MS * 2) {
        rateLimitMap.delete(ip);
      }
    }
  }, 300_000);
}

// ─── In-Memory Cache ──────────────────────────────────────────────────────────

const CACHE_TTL_MS = 3 * 60 * 60 * 1000; // 3 hours

interface CacheEntry {
  result: TrackingResult;
  expiresAt: number;
}

const trackingCache = new Map<string, CacheEntry>();

function getCachedResult(key: string): TrackingResult | null {
  const entry = trackingCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    trackingCache.delete(key);
    return null;
  }
  return entry.result;
}

function setCachedResult(key: string, result: TrackingResult): void {
  // Only cache successful results
  if (result.status !== "success" && result.status !== "success_text_only") return;
  trackingCache.set(key, {
    result,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}

// ─── Provider Selection ───────────────────────────────────────────────────────

function getMaritimeProvider(): TrackingProviderAdapter {
  const apiKey = process.env.SEARATES_API_KEY;
  const isDev = process.env.NODE_ENV === "development";

  // If API key is available, always use real provider
  if (apiKey && apiKey.length > 0) {
    return new SearatesProvider({ apiKey });
  }

  // In development without key, use mock provider
  if (isDev) {
    return new MockProvider();
  }

  // In production without key, use SearatesProvider which will return no_api_key status
  return new SearatesProvider({});
}

// ─── Main Service ─────────────────────────────────────────────────────────────

export interface TrackingServiceOptions {
  clientIp?: string;
}

/**
 * Perform a tracking lookup.
 * This is the single entry point used by the API route handler.
 */
export async function performTrackingLookup(
  request: TrackingLookupRequest,
  options?: TrackingServiceOptions,
): Promise<TrackingResult> {
  // 1. Rate limiting
  const clientIp = options?.clientIp || "unknown";
  if (!checkRateLimit(clientIp)) {
    return {
      trackingNumber: request.number,
      identifierType: request.type || "unknown",
      status: "rate_limited",
      events: [],
      dataSource: "none",
      isDemo: false,
      userMessage: "تم تجاوز الحد المسموح من الطلبات. يرجى الانتظار دقيقة واحدة.",
    };
  }

  // 2. Input validation & sanitization
  const sanitized = sanitizeInput(request.number);
  if (!sanitized) {
    return {
      trackingNumber: request.number,
      identifierType: "unknown",
      status: "invalid_number",
      events: [],
      dataSource: "none",
      isDemo: false,
      userMessage: "يرجى إدخال رقم تتبع صالح.",
    };
  }

  // 3. Detect or validate identifier type
  const detection = request.type && request.type !== "unknown"
    ? validateIdentifier(sanitized, request.type)
    : detectIdentifierType(sanitized);

  if (!detection.isValid) {
    return {
      trackingNumber: sanitized,
      identifierType: detection.type,
      status: "invalid_number",
      events: [],
      dataSource: "none",
      isDemo: false,
      userMessage: detection.errorMessage || "رقم التتبع غير صالح.",
    };
  }

  // 4. Route to correct source based on identifier type
  const effectiveRequest: TrackingLookupRequest = {
    ...request,
    number: detection.normalized,
    type: detection.type,
  };

  if (detection.type === "out_reference") {
    return lookupOutReference(detection.normalized);
  }

  if (detection.type === "acid") {
    return lookupAcidNumber(detection.normalized);
  }

  if (!isMaritimeIdentifier(detection.type)) {
    return {
      trackingNumber: detection.normalized,
      identifierType: detection.type,
      status: "unsupported_identifier",
      events: [],
      dataSource: "none",
      isDemo: false,
      userMessage: "هذا النوع من المعرفات غير مدعوم للتتبع البحري.",
    };
  }

  // 5. Check cache for maritime lookups
  const cacheKey = `${detection.type}:${detection.normalized}`;
  const cached = getCachedResult(cacheKey);
  if (cached) {
    return { ...cached, userMessage: cached.userMessage };
  }

  // 6. Maritime lookup via provider
  const provider = getMaritimeProvider();
  const result = await provider.lookup(effectiveRequest);

  // 7. Cache successful results
  setCachedResult(cacheKey, result);

  return result;
}

// ─── Internal Lookups ─────────────────────────────────────────────────────────

async function getSupabaseForTracking() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;

  try {
    const { createClient } = await import("@/lib/supabase/server");
    return await createClient();
  } catch {
    // Fallback for standalone scripts / test runners outside Next.js request context
    const { createClient } = await import("@supabase/supabase-js");
    return createClient<import("@/types/database").Database>(url, anonKey);
  }
}

/**
 * Lookup OUT internal reference.
 * Returns ONLY public-safe information. Never exposes customer details.
 */
async function lookupOutReference(refNumber: string): Promise<TrackingResult> {
  try {
    const supabase = await getSupabaseForTracking();
    if (!supabase) {
      return {
        trackingNumber: refNumber,
        identifierType: "out_reference",
        status: "internal_only",
        events: [],
        dataSource: "internal",
        isDemo: false,
        userMessage:
          "هذا الرقم خاص بملف التخليص الجمركي لدى OUT. لتتبع الرحلة البحرية، يرجى استخدام رقم الحاوية أو بوليصة الشحن.",
      };
    }

    // Query only public-safe fields — NEVER expose customer details
    const { data: shipment, error } = await supabase
      .from("shipments")
      .select("id, reference_number, status, port_of_arrival, country_of_origin, goods_description, goods_category")
      .eq("reference_number", refNumber)
      .maybeSingle();

    if (error || !shipment) {
      return {
        trackingNumber: refNumber,
        identifierType: "out_reference",
        status: "internal_only",
        events: [],
        dataSource: "internal",
        isDemo: false,
        userMessage:
          "لم يتم العثور على شحنة بهذا الرقم الداخلي في منظومة OUT. تأكد من صحة الرقم أو تواصل مع فريق الدعم.",
      };
    }

    // Build public-safe clearance summary
    const summary = buildPublicClearanceSummary(shipment);

    return {
      trackingNumber: refNumber,
      identifierType: "out_reference",
      status: "internal_only",
      events: [],
      dataSource: "internal",
      isDemo: false,
      outClearanceSummary: summary,
      userMessage:
        "هذا الرقم خاص بملف التخليص الجمركي لدى OUT. لتتبع الرحلة البحرية الخارجية، يرجى استخدام رقم الحاوية أو بوليصة الشحن.",
    };
  } catch {
    return {
      trackingNumber: refNumber,
      identifierType: "out_reference",
      status: "internal_only",
      events: [],
      dataSource: "internal",
      isDemo: false,
      userMessage: "هذا الرقم خاص بإجراءات OUT الداخلية. لتتبع حركة السفينة، استخدم رقم الحاوية.",
    };
  }
}

/**
 * Lookup ACID number.
 * ACID is a customs clearance identifier, NOT a maritime tracking number.
 */
async function lookupAcidNumber(acidNumber: string): Promise<TrackingResult> {
  try {
    const supabase = await getSupabaseForTracking();
    if (!supabase) {
      return {
        trackingNumber: acidNumber,
        identifierType: "acid",
        status: "internal_only",
        events: [],
        dataSource: "internal",
        isDemo: false,
        userMessage:
          "رقم ACID هو قيد جمركي مبدئي خاص بمنظومة نافذة المصرية، وليس رقم تتبع بحري. لتتبع الرحلة البحرية، استخدم رقم الحاوية.",
      };
    }

    // Look up the ACID in shipment_acids table
    const { data: acidRecord, error } = await supabase
      .from("shipment_acids")
      .select("id, shipment_id, acid_number, status")
      .eq("acid_number", acidNumber)
      .maybeSingle();

    if (error || !acidRecord) {
      return {
        trackingNumber: acidNumber,
        identifierType: "acid",
        status: "internal_only",
        events: [],
        dataSource: "internal",
        isDemo: false,
        userMessage:
          "رقم ACID هو قيد جمركي مبدئي خاص بمنظومة نافذة المصرية، وليس رقم تتبع بحري. لم يتم العثور على إجراء ACID نشط بهذا الرقم.",
      };
    }

    // Fetch public-safe shipment info
    const { data: shipment } = await supabase
      .from("shipments")
      .select("id, reference_number, status, port_of_arrival, country_of_origin, goods_description, goods_category")
      .eq("id", acidRecord.shipment_id)
      .maybeSingle();

    const summary = shipment ? buildPublicClearanceSummary(shipment) : undefined;

    return {
      trackingNumber: acidNumber,
      identifierType: "acid",
      status: "internal_only",
      events: [],
      dataSource: "internal",
      isDemo: false,
      outClearanceSummary: summary,
      userMessage:
        "رقم ACID هو قيد جمركي مبدئي لمنظومة نافذة المصرية. لتتبع الرحلة البحرية، استخدم رقم الحاوية أو بوليصة الشحن.",
    };
  } catch {
    return {
      trackingNumber: acidNumber,
      identifierType: "acid",
      status: "internal_only",
      events: [],
      dataSource: "internal",
      isDemo: false,
      userMessage: "رقم ACID هو قيد جمركي مصري. لتتبع حركة السفينة، استخدم رقم الحاوية.",
    };
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Sanitize user input: trim, limit length, strip dangerous chars.
 */
function sanitizeInput(input: string): string | null {
  if (!input || typeof input !== "string") return null;
  const trimmed = input.trim();
  if (trimmed.length < 3 || trimmed.length > 30) return null;
  // Allow alphanumeric, dashes, and spaces only
  const sanitized = trimmed.replace(/[^A-Za-z0-9\s\-]/g, "");
  if (sanitized.length < 3) return null;
  return sanitized;
}

/**
 * Build a public-safe clearance summary from shipment data.
 * NEVER includes: customer name, company, pricing, fees, documents, notes.
 */
function buildPublicClearanceSummary(
  shipment: Record<string, unknown>,
): OutClearanceSummary {
  const status = String(shipment.status || "draft");

  // Map internal status to generic public label
  const PUBLIC_STATUS_MAP: Record<string, string> = {
    draft: "قيد التجهيز",
    submitted: "تم استلام الطلب",
    awaiting_pricing: "قيد المراجعة",
    price_proposed: "قيد المراجعة",
    negotiation: "قيد المراجعة",
    price_agreed: "قيد التنسيق",
    awaiting_invoice_review: "قيد المراجعة",
    invoice_revision_required: "قيد المراجعة",
    invoice_approved: "قيد الإجراءات",
    acid_processing: "قيد الإجراءات الجمركية",
    acid_issued: "قيد الإجراءات الجمركية",
    awaiting_shipment_documents: "قيد استكمال المستندات",
    documents_completed: "مستندات مكتملة",
    ready_for_external_stage: "قيد الإجراءات الميدانية",
    customs_in_progress: "قيد التخليص الجمركي",
    customs_cleared: "تم الإفراج الجمركي",
    delivered: "تم التسليم",
  };

  return {
    referenceNumber: String(shipment.reference_number || ""),
    goodsDescription: typeof shipment.goods_description === "string"
      ? shipment.goods_description
      : undefined,
    portOfArrival: typeof shipment.port_of_arrival === "string"
      ? shipment.port_of_arrival
      : undefined,
    countryOfOrigin: typeof shipment.country_of_origin === "string"
      ? shipment.country_of_origin
      : undefined,
    publicStatusLabel: PUBLIC_STATUS_MAP[status] || "قيد المعالجة",
    isFullyCleared: status === "customs_cleared" || status === "delivered",
  };
}
