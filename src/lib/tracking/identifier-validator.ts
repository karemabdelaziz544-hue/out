/**
 * Tracking Identifier Validator
 *
 * Detects and validates tracking number formats:
 * - Container Number: ISO 6346 BIC standard (4 letters + 7 digits)
 * - Bill of Lading: Carrier prefix + alphanumeric (varies by carrier)
 * - Booking Number: Alphanumeric carrier booking reference
 * - OUT Reference: OUT-YYYY-XXXXXX or NEG-XXXXXX
 * - ACID Number: 19 numeric digits (Egyptian customs)
 */

import type { TrackingIdentifierType, IdentifierDetectionResult } from "./types";

// ─── ISO 6346 Container Number Validation ─────────────────────────────────────

/**
 * ISO 6346 BIC character mapping for check digit calculation.
 * Letters are mapped to values 10–38 (skipping multiples of 11).
 */
const ISO_6346_CHAR_VALUES: Record<string, number> = {
  A: 10, B: 12, C: 13, D: 14, E: 15, F: 16, G: 17, H: 18, I: 19,
  J: 20, K: 21, L: 23, M: 24, N: 25, O: 26, P: 27, Q: 28, R: 29,
  S: 30, T: 31, U: 32, V: 34, W: 35, X: 36, Y: 37, Z: 38,
  "0": 0, "1": 1, "2": 2, "3": 3, "4": 4,
  "5": 5, "6": 6, "7": 7, "8": 8, "9": 9,
};

/**
 * Validates a container number against ISO 6346 BIC standard.
 * Format: 4 uppercase letters (owner code + category) + 6 digits + 1 check digit
 */
export function isValidContainerNumber(input: string): boolean {
  const normalized = input.toUpperCase().replace(/[\s-]/g, "");
  // Must match: 4 letters + 7 digits
  if (!/^[A-Z]{4}\d{7}$/.test(normalized)) return false;

  // Calculate ISO 6346 check digit
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    const charVal = ISO_6346_CHAR_VALUES[normalized[i]];
    if (charVal === undefined) return false;
    sum += charVal * Math.pow(2, i);
  }
  const checkDigit = sum % 11 % 10;
  return checkDigit === parseInt(normalized[10], 10);
}

// ─── Pattern Matchers ─────────────────────────────────────────────────────────

/** Loose container number pattern (4 letters + 7 digits, without check digit validation) */
const CONTAINER_PATTERN = /^[A-Z]{4}\d{7}$/;

/** OUT internal reference pattern */
const OUT_REF_PATTERN = /^(OUT|NEG)-\d{4}-\d{4,8}$/i;

/** ACID number: exactly 19 digits */
const ACID_PATTERN = /^\d{19}$/;

/**
 * B/L numbers vary greatly by carrier. Common patterns:
 * - SCAC prefix (2-4 chars) + alphanumeric (6-16 chars)
 * - May contain dashes or spaces
 * Heuristic: starts with 2+ letters, contains mix of letters and digits, 8+ chars total
 */
const BL_HEURISTIC_PATTERN = /^[A-Z]{2,5}[A-Z0-9]{4,16}$/;

/**
 * Booking references are shorter alphanumeric codes (6-12 chars),
 * often all-numeric or short alphanumeric.
 */
const BOOKING_PATTERN = /^[A-Z0-9]{6,14}$/;

// ─── Identifier Detection ─────────────────────────────────────────────────────

/**
 * Auto-detect the tracking identifier type from user input.
 * Priority: OUT Ref → ACID → Container → B/L → Booking → Unknown
 */
export function detectIdentifierType(input: string): IdentifierDetectionResult {
  if (!input || typeof input !== "string") {
    return {
      type: "unknown",
      normalized: "",
      isValid: false,
      errorMessage: "يرجى إدخال رقم تتبع صالح.",
    };
  }

  const trimmed = input.trim();
  if (trimmed.length < 3 || trimmed.length > 30) {
    return {
      type: "unknown",
      normalized: trimmed,
      isValid: false,
      errorMessage: "رقم التتبع يجب أن يكون بين 3 و 30 حرفاً.",
    };
  }

  const normalized = trimmed.toUpperCase().replace(/[\s-]+/g, "");

  // 0. Demo identifiers for testing/development
  if (trimmed.toUpperCase().startsWith("DEMO-")) {
    return { type: "container", normalized: trimmed.toUpperCase(), isValid: true };
  }

  // 1. OUT internal reference
  if (OUT_REF_PATTERN.test(trimmed)) {
    return { type: "out_reference", normalized: trimmed.toUpperCase(), isValid: true };
  }

  // 2. ACID number (19 digits)
  if (ACID_PATTERN.test(normalized)) {
    return { type: "acid", normalized, isValid: true };
  }

  // 3. Container number (ISO 6346)
  if (CONTAINER_PATTERN.test(normalized)) {
    const isValidBIC = isValidContainerNumber(normalized);
    return {
      type: "container",
      normalized,
      isValid: isValidBIC,
      errorMessage: isValidBIC
        ? undefined
        : "رقم الحاوية غير صالح وفق معيار ISO 6346. يرجى التحقق من الرقم.",
    };
  }

  // 4. Booking reference prefix (BK, BKG, BOOK)
  if (/^(BK|BKG|BOOK)[A-Z0-9]{4,14}$/i.test(normalized)) {
    return { type: "booking", normalized, isValid: true };
  }

  // 5. B/L heuristic (starts with 2+ letters, 8+ chars)
  if (BL_HEURISTIC_PATTERN.test(normalized) && normalized.length >= 8) {
    return { type: "bill_of_lading", normalized, isValid: true };
  }

  // 6. Generic booking reference (shorter alphanumeric)
  if (BOOKING_PATTERN.test(normalized) && normalized.length >= 6) {
    return { type: "booking", normalized, isValid: true };
  }

  return {
    type: "unknown",
    normalized: trimmed,
    isValid: false,
    errorMessage:
      "لم يتم التعرف على نوع الرقم. يرجى إدخال رقم حاوية أو بوليصة شحن أو رقم شحنة OUT.",
  };
}

/**
 * Validate an identifier against its declared type.
 * Used when user manually selects the identifier type.
 */
export function validateIdentifier(
  input: string,
  type: TrackingIdentifierType,
): IdentifierDetectionResult {
  const trimmed = input.trim();
  const normalized = trimmed.toUpperCase().replace(/[\s-]+/g, "");

  // Allow demo numbers in development/testing
  if (trimmed.toUpperCase().startsWith("DEMO-")) {
    return { type, normalized: trimmed.toUpperCase(), isValid: true };
  }

  switch (type) {
    case "container":
      if (!CONTAINER_PATTERN.test(normalized)) {
        return {
          type,
          normalized,
          isValid: false,
          errorMessage: "رقم الحاوية يجب أن يتكون من 4 أحرف و7 أرقام (مثال: MSCU1234567).",
        };
      }
      if (!isValidContainerNumber(normalized)) {
        return {
          type,
          normalized,
          isValid: false,
          errorMessage: "رقم الحاوية غير صالح وفق معيار ISO 6346. يرجى التحقق من رقم التدقيق.",
        };
      }
      return { type, normalized, isValid: true };

    case "bill_of_lading":
      if (normalized.length < 6 || !/[A-Z]/.test(normalized)) {
        return {
          type,
          normalized,
          isValid: false,
          errorMessage: "رقم بوليصة الشحن يجب أن يحتوي على أحرف وأرقام (6 أحرف على الأقل).",
        };
      }
      return { type, normalized, isValid: true };

    case "booking":
      if (normalized.length < 5 || !/^[A-Z0-9]+$/.test(normalized)) {
        return {
          type,
          normalized,
          isValid: false,
          errorMessage: "رقم الحجز الملاحي يجب أن يحتوي على أحرف وأرقام (5 أحرف على الأقل).",
        };
      }
      return { type, normalized, isValid: true };

    case "out_reference":
      if (!OUT_REF_PATTERN.test(trimmed)) {
        return {
          type,
          normalized: trimmed.toUpperCase(),
          isValid: false,
          errorMessage: "رقم الشحنة الداخلي يجب أن يكون بصيغة OUT-2026-000001 أو NEG-000001.",
        };
      }
      return { type, normalized: trimmed.toUpperCase(), isValid: true };

    case "acid":
      if (!ACID_PATTERN.test(normalized)) {
        return {
          type,
          normalized,
          isValid: false,
          errorMessage: "رقم ACID يجب أن يتكون من 19 رقماً بالضبط.",
        };
      }
      return { type, normalized, isValid: true };

    default:
      return detectIdentifierType(trimmed);
  }
}

// ─── UI Labels ────────────────────────────────────────────────────────────────

export const IDENTIFIER_TYPE_LABELS: Record<TrackingIdentifierType, string> = {
  container: "رقم الحاوية",
  bill_of_lading: "بوليصة الشحن (B/L)",
  booking: "رقم الحجز الملاحي",
  out_reference: "رقم شحنة OUT",
  acid: "رقم ACID الجمركي",
  unknown: "نوع غير محدد",
};

export const IDENTIFIER_TYPE_EXAMPLES: Record<TrackingIdentifierType, string> = {
  container: "MSCU1234567",
  bill_of_lading: "MEDUST987654",
  booking: "BK2026001",
  out_reference: "OUT-2026-000044",
  acid: "2026102712345678901",
  unknown: "",
};

/** Types that should be sent to maritime tracking providers */
export function isMaritimeIdentifier(type: TrackingIdentifierType): boolean {
  return type === "container" || type === "bill_of_lading" || type === "booking";
}
