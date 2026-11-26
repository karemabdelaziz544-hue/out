import { NextResponse, type NextRequest } from "next/server";
import { performTrackingLookup } from "@/lib/tracking/service";
import type { TrackingIdentifierType } from "@/lib/tracking/types";

/**
 * Global Shipment Tracking — API Route
 *
 * Public endpoint: accessible without authentication.
 * Rate-limited per IP.
 * Sanitizes input and delegates to TrackingService.
 *
 * Method: POST
 * Body: { number: string, type?: TrackingIdentifierType }
 *
 * Also supports GET: /api/tracking/lookup?number=...&type=...
 */

function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  const realIp = request.headers.get("x-real-ip");
  if (realIp) {
    return realIp.trim();
  }
  return "unknown";
}

export async function POST(request: NextRequest) {
  try {
    let body: { number?: unknown; type?: unknown };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        {
          error: "صيغة الطلب غير صالحة. يرجى إرسال JSON صالح.",
          status: "invalid_number",
        },
        { status: 400 },
      );
    }

    if (!body || typeof body.number !== "string" || !body.number.trim()) {
      return NextResponse.json(
        {
          error: "يرجى توفير رقم التتبع.",
          status: "invalid_number",
        },
        { status: 400 },
      );
    }

    const number = body.number.trim();
    const type = typeof body.type === "string" ? (body.type as TrackingIdentifierType) : undefined;

    const clientIp = getClientIp(request);
    const result = await performTrackingLookup({ number, type }, { clientIp });

    // Status mapping for HTTP response code
    if (result.status === "rate_limited") {
      return NextResponse.json(result, { status: 429 });
    }

    if (result.status === "invalid_number") {
      return NextResponse.json(result, { status: 400 });
    }

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    // Never expose stack trace or internal details
    console.error("[Tracking API Error]:", error instanceof Error ? error.message : "Unknown error");
    return NextResponse.json(
      {
        error: "حدث خطأ غير متوقع أثناء معالجة الطلب. يرجى المحاولة لاحقاً.",
        status: "provider_error",
        events: [],
        dataSource: "none",
        isDemo: false,
      },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const number = searchParams.get("number");
  const type = (searchParams.get("type") as TrackingIdentifierType) || undefined;

  if (!number || !number.trim()) {
    return NextResponse.json(
      {
        error: "يرجى توفير رقم التتبع عبر المعامل ?number=...",
        status: "invalid_number",
      },
      { status: 400 },
    );
  }

  const clientIp = getClientIp(request);
  const result = await performTrackingLookup({ number: number.trim(), type }, { clientIp });

  if (result.status === "rate_limited") {
    return NextResponse.json(result, { status: 429 });
  }

  if (result.status === "invalid_number") {
    return NextResponse.json(result, { status: 400 });
  }

  return NextResponse.json(result, { status: 200 });
}
