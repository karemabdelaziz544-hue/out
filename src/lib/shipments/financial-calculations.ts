/**
 * Pure Financial Calculation Layer (Phase 2 — Step 2 & Step 3)
 *
 * Pure, deterministic, database-independent financial calculation functions
 * that mirror `supabase/migrations/0019_create_financial_ledger_and_payment_gates.sql` verbatim.
 *
 * Key Guarantees:
 *  1. Zero Floating-Point Drift:
 *     All monetary values (`number | string`) are parsed via deterministic string decimal
 *     decomposition into integer minor units (piastres: 1 EGP = 100 piastres) before any
 *     addition/subtraction, and converted back to exact 2-decimal EGP numbers.
 *  2. Track A vs Track B Separation:
 *     - Track A (Customs Obligation): `shipment_customs_obligations` covered by posted
 *       `out_disbursement` (`allocated_customs_amount`) + posted `customer_direct_customs_payment`.
 *     - Track B (OUT Receivable): confirmed fixed `final_price` + billable `out_disbursement`
 *       + billable `customer_charge` - `credit_adjustment` vs `customer_payment_to_out`.
 *  3. Strict Invariant Enforcement:
 *     - `customer_direct_customs_payment` NEVER enters `billable_out_disbursements` or `total_customer_receivable_to_out`.
 *     - Non-billable `out_disbursement` (`is_billable_to_customer = false`) NEVER enters customer receivable or customer statement.
 *     - Estimated pricing (`approval_type = 'estimated_range'` or unapproved `final_price`) NEVER counts as `confirmed_out_service_fee`.
 *     - `pending_verification` and `rejected` transactions NEVER count toward settled balances or completion gates.
 *     - Reversal entries (`direction = -1`, `reversal_of_transaction_id != null`) algebraically cancel their original posted transaction.
 */

import {
  FINANCIAL_CATEGORY_ALLOWED_TYPES,
  FINANCIAL_PAYMENT_METHODS,
  FINANCIAL_TRANSACTION_CATEGORIES,
  FINANCIAL_TRANSACTION_STATUSES,
  FINANCIAL_TRANSACTION_TYPES,
  type CustomerShipmentFinancialStatementItem,
  type CustomerShipmentFinancialStatementItemRaw,
  type FinancialObligationStatus,
  type FinancialPaymentMethod,
  type FinancialTransactionCategory,
  type FinancialTransactionDirection,
  type FinancialTransactionStatus,
  type FinancialTransactionType,
  type MonetaryNumericValue,
  type ShipmentCustomsObligation,
  type ShipmentCustomsObligationRow,
  type ShipmentFinancialSummary,
  type ShipmentFinancialSummaryRaw,
  type ShipmentFinancialTransaction,
  type ShipmentFinancialTransactionRow,
  type Stage9FinancialBlockingReason,
  type Stage9FinancialGateEvaluation,
} from "../../types/financial";
import type { ShipmentPricingRow } from "../../types/database";

// ─── 1. Decimal-Safe Minor Unit (Piastres) Arithmetic Helpers ─────────────────

const MAX_SAFE_PIASTRES = 999_999_999_999_99; // Matches PostgreSQL numeric(14,2) max (999,999,999,999.99)
const DECIMAL_PATTERN = /^([+-])?(\d+)(?:\.(\d+))?$/;

export interface ParseMoneyOptions {
  fieldName?: string;
  allowNegative?: boolean;
  allowZero?: boolean;
}

/**
 * Converts a monetary input (`number | string`) into exact integer piastres (1 EGP = 100 piastres)
 * without IEEE-754 binary multiplication drift (e.g. `19.99` -> `1999`, `"100.10"` -> `10010`).
 *
 * Uses half-away-from-zero rounding if more than 2 fractional digits are supplied.
 * Throws a descriptive Error if the input is `NaN`, `Infinity`, malformed, or violates constraints.
 */
export function toPiastres(
  value: MonetaryNumericValue | null | undefined,
  options: ParseMoneyOptions = {},
): number {
  const {
    fieldName = "amount",
    allowNegative = true,
    allowZero = true,
  } = options;

  if (value === null || value === undefined) {
    throw new Error(`Invalid monetary value for ${fieldName}: value is null or undefined.`);
  }

  let normalizedStr: string;

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error(`Invalid monetary value for ${fieldName}: ${String(value)} is not finite.`);
    }
    normalizedStr = value.toFixed(6);
  } else if (typeof value === "string") {
    normalizedStr = value.trim();
    if (normalizedStr.length === 0) {
      throw new Error(`Invalid monetary value for ${fieldName}: empty string.`);
    }
  } else {
    throw new Error(`Invalid monetary value for ${fieldName}: unsupported type ${typeof value}.`);
  }

  const match = DECIMAL_PATTERN.exec(normalizedStr);
  if (!match) {
    throw new Error(`Invalid monetary format for ${fieldName}: "${normalizedStr}".`);
  }

  const signChar = match[1];
  const intPartStr = match[2];
  const fracPartStr = match[3] ?? "";

  const isNegative = signChar === "-";
  const majorUnits = Number(intPartStr);
  if (!Number.isSafeInteger(majorUnits)) {
    throw new Error(`Monetary value out of safe range for ${fieldName}: "${normalizedStr}".`);
  }

  const paddedFrac = (fracPartStr + "000").slice(0, 3);
  const firstTwoDigits = Number(paddedFrac.slice(0, 2));
  const thirdDigit = Number(paddedFrac.slice(2, 3));

  let totalPiastres = majorUnits * 100 + firstTwoDigits;
  if (thirdDigit >= 5) {
    totalPiastres += 1;
  }

  if (totalPiastres > MAX_SAFE_PIASTRES) {
    throw new Error(
      `Monetary value exceeds numeric(14,2) maximum for ${fieldName}: "${normalizedStr}".`,
    );
  }

  const signedPiastres = isNegative && totalPiastres !== 0 ? -totalPiastres : totalPiastres;

  if (!allowNegative && signedPiastres < 0) {
    throw new Error(`Negative monetary value is not allowed for ${fieldName}: ${signedPiastres / 100}.`);
  }

  if (!allowZero && signedPiastres === 0) {
    throw new Error(`Zero monetary value is not allowed for ${fieldName}.`);
  }

  return signedPiastres;
}

/**
 * Converts integer piastres back to an exact 2-decimal EGP number using string reconstruction
 * so no binary float division drift occurs.
 */
export function fromPiastres(piastres: number): number {
  if (!Number.isFinite(piastres) || !Number.isSafeInteger(piastres)) {
    throw new Error(`Invalid piastres integer: ${String(piastres)}`);
  }
  if (piastres === 0) {
    return 0;
  }
  const isNegative = piastres < 0;
  const abs = Math.abs(piastres);
  const major = Math.trunc(abs / 100);
  const minor = abs % 100;
  const formatted = `${isNegative ? "-" : ""}${major}.${String(minor).padStart(2, "0")}`;
  return Number(formatted);
}

/**
 * Normalizes any `number | string` monetary input into a clean 2-decimal `number`.
 */
export function normalizeMonetaryAmount(
  value: MonetaryNumericValue,
  options?: ParseMoneyOptions,
): number {
  return fromPiastres(toPiastres(value, options));
}

// ─── 2. Row Normalizers (Raw Database Row -> Normalized Domain Type) ──────────

export function normalizeCustomsObligationRow(
  row: ShipmentCustomsObligationRow,
): ShipmentCustomsObligation {
  return {
    ...row,
    assessed_amount: normalizeMonetaryAmount(row.assessed_amount, {
      fieldName: "assessed_amount",
      allowNegative: false,
      allowZero: true,
    }),
  };
}

export function normalizeFinancialTransactionRow(
  row: ShipmentFinancialTransactionRow,
): ShipmentFinancialTransaction {
  const amountPiastres = toPiastres(row.amount, {
    fieldName: "amount",
    allowNegative: false,
    allowZero: false,
  });
  const allocatedPiastres = toPiastres(row.allocated_customs_amount, {
    fieldName: "allocated_customs_amount",
    allowNegative: false,
    allowZero: true,
  });

  if (allocatedPiastres > amountPiastres) {
    throw new Error(
      `Invalid transaction ${row.id}: allocated_customs_amount (${fromPiastres(allocatedPiastres)}) exceeds amount (${fromPiastres(amountPiastres)}).`,
    );
  }

  const direction: FinancialTransactionDirection = row.direction === -1 ? -1 : 1;

  return {
    ...row,
    direction,
    amount: fromPiastres(amountPiastres),
    allocated_customs_amount: fromPiastres(allocatedPiastres),
    signed_amount: fromPiastres(direction * amountPiastres),
    signed_allocated_customs_amount: fromPiastres(direction * allocatedPiastres),
  };
}

export function normalizeFinancialSummaryRaw(
  raw: ShipmentFinancialSummaryRaw,
): ShipmentFinancialSummary {
  return {
    shipment_id: raw.shipment_id,
    currency: "EGP",
    assessed_customs_obligation: normalizeMonetaryAmount(raw.assessed_customs_obligation),
    out_customs_disbursements: normalizeMonetaryAmount(raw.out_customs_disbursements),
    other_out_disbursements: normalizeMonetaryAmount(raw.other_out_disbursements),
    total_out_disbursements: normalizeMonetaryAmount(raw.total_out_disbursements),
    billable_out_disbursements: normalizeMonetaryAmount(raw.billable_out_disbursements),
    non_billable_out_disbursements: normalizeMonetaryAmount(raw.non_billable_out_disbursements),
    verified_direct_customs_payments: normalizeMonetaryAmount(raw.verified_direct_customs_payments),
    pending_direct_customs_payments: normalizeMonetaryAmount(raw.pending_direct_customs_payments),
    total_customs_covered: normalizeMonetaryAmount(raw.total_customs_covered),
    remaining_customs_obligation: normalizeMonetaryAmount(raw.remaining_customs_obligation),
    has_confirmed_final_price: Boolean(raw.has_confirmed_final_price),
    confirmed_out_service_fee: normalizeMonetaryAmount(raw.confirmed_out_service_fee),
    other_approved_customer_charges: normalizeMonetaryAmount(raw.other_approved_customer_charges),
    approved_credits: normalizeMonetaryAmount(raw.approved_credits),
    total_customer_receivable_to_out: normalizeMonetaryAmount(raw.total_customer_receivable_to_out),
    total_received_by_out: normalizeMonetaryAmount(raw.total_received_by_out),
    outstanding_balance_to_out: normalizeMonetaryAmount(raw.outstanding_balance_to_out),
    is_customs_coverage_complete: Boolean(raw.is_customs_coverage_complete),
    is_financial_settlement_complete: Boolean(raw.is_financial_settlement_complete),
  };
}

export function normalizeCustomerStatementItemRaw(
  raw: CustomerShipmentFinancialStatementItemRaw,
): CustomerShipmentFinancialStatementItem {
  return {
    transaction_id: raw.transaction_id,
    shipment_id: raw.shipment_id,
    entry_category: raw.entry_category,
    entry_type: raw.entry_type,
    direction: raw.direction,
    amount: normalizeMonetaryAmount(raw.amount, { allowNegative: false, allowZero: false }),
    signed_amount: normalizeMonetaryAmount(raw.signed_amount),
    currency: "EGP",
    payment_method: raw.payment_method,
    reference_number: raw.reference_number,
    transaction_date: raw.transaction_date,
    description: raw.description,
    is_reversed: Boolean(raw.is_reversed),
    reversal_of_transaction_id: raw.reversal_of_transaction_id,
    reversal_reason: raw.reversal_reason,
    created_at: raw.created_at,
  };
}

// ─── 3. Track A: Customs Authority Obligation Calculation ─────────────────────

export interface CustomsObligationCalculationInput {
  obligations: readonly Pick<
    ShipmentCustomsObligationRow,
    "status" | "assessed_amount"
  >[];
  transactions: readonly Pick<
    ShipmentFinancialTransactionRow,
    | "entry_category"
    | "entry_status"
    | "direction"
    | "amount"
    | "allocated_customs_amount"
  >[];
}

export interface CustomsObligationSummaryResult {
  assessed_customs_obligation: number;
  out_customs_disbursements: number;
  verified_direct_customs_payments: number;
  pending_direct_customs_payments: number;
  total_customs_covered: number;
  remaining_customs_obligation: number;
  over_covered_customs_amount: number;
  is_customs_coverage_complete: boolean;
}

/**
 * Computes Track A (Customs Authority Obligation & Coverage) using exact integer piastres.
 * Mirrors the customs obligation aggregation in `public.get_shipment_financial_summary`.
 */
export function calculateCustomsObligationSummary(
  input: CustomsObligationCalculationInput,
): CustomsObligationSummaryResult {
  let assessedPiastres = 0;

  for (const ob of input.obligations) {
    const amountPiastres = toPiastres(ob.assessed_amount, {
      fieldName: "obligation.assessed_amount",
      allowNegative: false,
      allowZero: true,
    });
    if (ob.status !== "cancelled") {
      assessedPiastres += amountPiastres;
    }
  }

  let outCustomsPiastres = 0;
  let verifiedDirectCustomsPiastres = 0;
  let pendingDirectCustomsPiastres = 0;

  for (const tx of input.transactions) {
    const amountPiastres = toPiastres(tx.amount, {
      fieldName: "transaction.amount",
      allowNegative: false,
      allowZero: false,
    });
    const allocatedPiastres = toPiastres(tx.allocated_customs_amount, {
      fieldName: "transaction.allocated_customs_amount",
      allowNegative: false,
      allowZero: true,
    });

    if (allocatedPiastres > amountPiastres) {
      throw new Error(
        `Transaction allocated_customs_amount (${fromPiastres(allocatedPiastres)}) cannot exceed amount (${fromPiastres(amountPiastres)}).`,
      );
    }

    const dir = tx.direction === -1 ? -1 : 1;

    if (tx.entry_status === "posted") {
      if (tx.entry_category === "out_disbursement" && allocatedPiastres > 0) {
        outCustomsPiastres += dir * allocatedPiastres;
      } else if (tx.entry_category === "customer_direct_customs_payment") {
        verifiedDirectCustomsPiastres += dir * allocatedPiastres;
      }
    } else if (
      tx.entry_status === "pending_verification" &&
      tx.entry_category === "customer_direct_customs_payment" &&
      dir === 1
    ) {
      pendingDirectCustomsPiastres += allocatedPiastres;
    }
  }

  const totalCustomsCoveredPiastres = outCustomsPiastres + verifiedDirectCustomsPiastres;
  const remainingPiastres = Math.max(assessedPiastres - totalCustomsCoveredPiastres, 0);
  const overCoveredPiastres = Math.max(totalCustomsCoveredPiastres - assessedPiastres, 0);

  // Matches Migration 0019:
  // v_customs_complete := (v_assessed_customs > 0.00 AND v_total_customs_covered = v_assessed_customs AND v_pending_direct_customs = 0.00);
  const isComplete =
    assessedPiastres > 0 &&
    totalCustomsCoveredPiastres === assessedPiastres &&
    pendingDirectCustomsPiastres === 0;

  return {
    assessed_customs_obligation: fromPiastres(assessedPiastres),
    out_customs_disbursements: fromPiastres(outCustomsPiastres),
    verified_direct_customs_payments: fromPiastres(verifiedDirectCustomsPiastres),
    pending_direct_customs_payments: fromPiastres(pendingDirectCustomsPiastres),
    total_customs_covered: fromPiastres(totalCustomsCoveredPiastres),
    remaining_customs_obligation: fromPiastres(remainingPiastres),
    over_covered_customs_amount: fromPiastres(overCoveredPiastres),
    is_customs_coverage_complete: isComplete,
  };
}

/**
 * Determines the individual `FinancialObligationStatus` for a single `shipment_customs_obligations`
 * row given the posted transactions linked to it (`customs_obligation_id === obligation.id`).
 * Mirrors `sync_after_financial_transaction()` in Migration 0019.
 */
export function deriveSingleObligationCoverageStatus(
  obligation: Pick<ShipmentCustomsObligationRow, "id" | "status" | "assessed_amount">,
  linkedTransactions: readonly Pick<
    ShipmentFinancialTransactionRow,
    | "customs_obligation_id"
    | "entry_category"
    | "entry_status"
    | "direction"
    | "allocated_customs_amount"
  >[],
): FinancialObligationStatus {
  if (obligation.status === "cancelled") {
    return "cancelled";
  }

  const assessedPiastres = toPiastres(obligation.assessed_amount, {
    fieldName: "obligation.assessed_amount",
    allowNegative: false,
    allowZero: true,
  });

  let coveredPiastres = 0;

  for (const tx of linkedTransactions) {
    if (tx.customs_obligation_id !== obligation.id) continue;
    if (tx.entry_status !== "posted") continue;
    if (
      tx.entry_category !== "out_disbursement" &&
      tx.entry_category !== "customer_direct_customs_payment"
    ) {
      continue;
    }

    const allocatedPiastres = toPiastres(tx.allocated_customs_amount, {
      fieldName: "transaction.allocated_customs_amount",
      allowNegative: false,
      allowZero: true,
    });
    const dir = tx.direction === -1 ? -1 : 1;
    coveredPiastres += dir * allocatedPiastres;
  }

  if (coveredPiastres >= assessedPiastres && assessedPiastres > 0) {
    return "fully_covered";
  }
  if (coveredPiastres > 0) {
    return "partially_covered";
  }
  return "assessed";
}

// ─── 4. Track B: OUT Receivable & Customer Settlement Calculation ─────────────

export type PricingSettlementSnapshot = Pick<
  ShipmentPricingRow,
  "status" | "approval_type"
> & {
  estimated_min_price?: MonetaryNumericValue | null;
  estimated_max_price?: MonetaryNumericValue | null;
  final_price: MonetaryNumericValue | null;
};

export interface OutReceivableCalculationInput {
  pricing: PricingSettlementSnapshot | null | undefined;
  transactions: readonly Pick<
    ShipmentFinancialTransactionRow,
    | "entry_category"
    | "entry_status"
    | "direction"
    | "amount"
    | "allocated_customs_amount"
    | "is_billable_to_customer"
  >[];
}

export interface OutReceivableSummaryResult {
  has_confirmed_final_price: boolean;
  confirmed_out_service_fee: number;
  other_out_disbursements: number;
  total_out_disbursements: number;
  billable_out_disbursements: number;
  non_billable_out_disbursements: number;
  other_approved_customer_charges: number;
  approved_credits: number;
  total_customer_receivable_to_out: number;
  total_received_by_out: number;
  outstanding_balance_to_out: number;
  customer_overpayment_credit: number;
  is_out_receivable_settled: boolean;
}

/**
 * Computes Track B (OUT Receivable & Customer Settlement) using exact integer piastres.
 * Mirrors `public.get_shipment_financial_summary` in Migration 0019.
 */
export function calculateOutReceivableSummary(
  input: OutReceivableCalculationInput,
): OutReceivableSummaryResult {
  const pricing = input.pricing;
  let hasConfirmedFinalPrice = false;
  let confirmedServiceFeePiastres = 0;

  if (
    pricing &&
    pricing.status === "customer_approved" &&
    pricing.approval_type === "final_fixed" &&
    pricing.final_price !== null &&
    pricing.final_price !== undefined
  ) {
    const parsedFeePiastres = toPiastres(pricing.final_price, {
      fieldName: "pricing.final_price",
      allowNegative: false,
      allowZero: true,
    });
    if (parsedFeePiastres > 0) {
      hasConfirmedFinalPrice = true;
      confirmedServiceFeePiastres = parsedFeePiastres;
    }
  }

  let otherOutDisbursementsPiastres = 0;
  let totalOutDisbursementsPiastres = 0;
  let billableOutDisbursementsPiastres = 0;
  let nonBillableOutDisbursementsPiastres = 0;
  let otherApprovedCustomerChargesPiastres = 0;
  let approvedCreditsPiastres = 0;
  let totalReceivedByOutPiastres = 0;

  for (const tx of input.transactions) {
    const amountPiastres = toPiastres(tx.amount, {
      fieldName: "transaction.amount",
      allowNegative: false,
      allowZero: false,
    });
    const allocatedPiastres = toPiastres(tx.allocated_customs_amount, {
      fieldName: "transaction.allocated_customs_amount",
      allowNegative: false,
      allowZero: true,
    });

    if (allocatedPiastres > amountPiastres) {
      throw new Error(
        `Transaction allocated_customs_amount (${fromPiastres(allocatedPiastres)}) cannot exceed amount (${fromPiastres(amountPiastres)}).`,
      );
    }

    if (tx.entry_status !== "posted") {
      continue;
    }

    const dir = tx.direction === -1 ? -1 : 1;
    const signedAmountPiastres = dir * amountPiastres;
    const signedNonCustomsPortionPiastres = dir * (amountPiastres - allocatedPiastres);

    switch (tx.entry_category) {
      case "out_disbursement": {
        totalOutDisbursementsPiastres += signedAmountPiastres;
        otherOutDisbursementsPiastres += signedNonCustomsPortionPiastres;
        if (tx.is_billable_to_customer) {
          billableOutDisbursementsPiastres += signedAmountPiastres;
        } else {
          nonBillableOutDisbursementsPiastres += signedAmountPiastres;
        }
        break;
      }
      case "customer_charge": {
        if (tx.is_billable_to_customer) {
          otherApprovedCustomerChargesPiastres += signedAmountPiastres;
        }
        break;
      }
      case "credit_adjustment": {
        approvedCreditsPiastres += signedAmountPiastres;
        break;
      }
      case "customer_payment_to_out": {
        totalReceivedByOutPiastres += signedAmountPiastres;
        break;
      }
      case "customer_direct_customs_payment": {
        break;
      }
    }
  }

  const totalCustomerReceivablePiastres =
    confirmedServiceFeePiastres +
    billableOutDisbursementsPiastres +
    otherApprovedCustomerChargesPiastres -
    approvedCreditsPiastres;

  const outstandingBalanceToOutPiastres =
    totalCustomerReceivablePiastres - totalReceivedByOutPiastres;
  const customerOverpaymentCreditPiastres = Math.max(
    totalReceivedByOutPiastres - totalCustomerReceivablePiastres,
    0,
  );

  const isOutReceivableSettled =
    hasConfirmedFinalPrice &&
    totalCustomerReceivablePiastres >= 0 &&
    outstandingBalanceToOutPiastres === 0;

  return {
    has_confirmed_final_price: hasConfirmedFinalPrice,
    confirmed_out_service_fee: fromPiastres(confirmedServiceFeePiastres),
    other_out_disbursements: fromPiastres(otherOutDisbursementsPiastres),
    total_out_disbursements: fromPiastres(totalOutDisbursementsPiastres),
    billable_out_disbursements: fromPiastres(billableOutDisbursementsPiastres),
    non_billable_out_disbursements: fromPiastres(nonBillableOutDisbursementsPiastres),
    other_approved_customer_charges: fromPiastres(otherApprovedCustomerChargesPiastres),
    approved_credits: fromPiastres(approvedCreditsPiastres),
    total_customer_receivable_to_out: fromPiastres(totalCustomerReceivablePiastres),
    total_received_by_out: fromPiastres(totalReceivedByOutPiastres),
    outstanding_balance_to_out: fromPiastres(outstandingBalanceToOutPiastres),
    customer_overpayment_credit: fromPiastres(customerOverpaymentCreditPiastres),
    is_out_receivable_settled: isOutReceivableSettled,
  };
}

// ─── 5. Unified Shipment Financial Summary Calculation ────────────────────────

export interface CalculateShipmentFinancialSummaryInput {
  shipmentId: string;
  obligations: readonly Pick<
    ShipmentCustomsObligationRow,
    "status" | "assessed_amount"
  >[];
  transactions: readonly Pick<
    ShipmentFinancialTransactionRow,
    | "entry_category"
    | "entry_status"
    | "direction"
    | "amount"
    | "allocated_customs_amount"
    | "is_billable_to_customer"
  >[];
  pricing: PricingSettlementSnapshot | null | undefined;
}

/**
 * Pure TypeScript equivalent of `public.get_shipment_financial_summary(p_shipment_id uuid)`.
 * Produces the exact same 21 fields and boolean gates as the PostgreSQL RPC.
 */
export function calculateShipmentFinancialSummary(
  input: CalculateShipmentFinancialSummaryInput,
): ShipmentFinancialSummary {
  const customs = calculateCustomsObligationSummary({
    obligations: input.obligations,
    transactions: input.transactions,
  });

  const receivable = calculateOutReceivableSummary({
    pricing: input.pricing,
    transactions: input.transactions,
  });

  const isFinancialSettlementComplete =
    customs.is_customs_coverage_complete &&
    receivable.has_confirmed_final_price &&
    receivable.total_customer_receivable_to_out >= 0 &&
    receivable.outstanding_balance_to_out === 0;

  return {
    shipment_id: input.shipmentId,
    currency: "EGP",
    assessed_customs_obligation: customs.assessed_customs_obligation,
    out_customs_disbursements: customs.out_customs_disbursements,
    other_out_disbursements: receivable.other_out_disbursements,
    total_out_disbursements: receivable.total_out_disbursements,
    billable_out_disbursements: receivable.billable_out_disbursements,
    non_billable_out_disbursements: receivable.non_billable_out_disbursements,
    verified_direct_customs_payments: customs.verified_direct_customs_payments,
    pending_direct_customs_payments: customs.pending_direct_customs_payments,
    total_customs_covered: customs.total_customs_covered,
    remaining_customs_obligation: customs.remaining_customs_obligation,
    has_confirmed_final_price: receivable.has_confirmed_final_price,
    confirmed_out_service_fee: receivable.confirmed_out_service_fee,
    other_approved_customer_charges: receivable.other_approved_customer_charges,
    approved_credits: receivable.approved_credits,
    total_customer_receivable_to_out: receivable.total_customer_receivable_to_out,
    total_received_by_out: receivable.total_received_by_out,
    outstanding_balance_to_out: receivable.outstanding_balance_to_out,
    is_customs_coverage_complete: customs.is_customs_coverage_complete,
    is_financial_settlement_complete: isFinancialSettlementComplete,
  };
}

// ─── 6. Stage 9 Financial Gate Evaluator ──────────────────────────────────────

/**
 * Evaluates whether `stage_9_fees_payments` can transition to `'completed'`.
 * Mirrors `public.enforce_customs_stage_guards()` in Migration 0019 verbatim.
 */
export function evaluateStage9FinancialGate(
  summary: Pick<
    ShipmentFinancialSummary,
    | "is_customs_coverage_complete"
    | "has_confirmed_final_price"
    | "outstanding_balance_to_out"
  > &
    Partial<
      Pick<
        ShipmentFinancialSummary,
        | "assessed_customs_obligation"
        | "pending_direct_customs_payments"
        | "remaining_customs_obligation"
      >
    >,
): Stage9FinancialGateEvaluation {
  const blockingReasons: Stage9FinancialBlockingReason[] = [];

  const isCustomsCoverageComplete = Boolean(summary.is_customs_coverage_complete);
  const hasConfirmedFinalPrice = Boolean(summary.has_confirmed_final_price);
  const outstandingPiastres = toPiastres(summary.outstanding_balance_to_out, {
    fieldName: "outstanding_balance_to_out",
  });
  const assessedPiastres =
    summary.assessed_customs_obligation !== undefined
      ? toPiastres(summary.assessed_customs_obligation, {
          fieldName: "assessed_customs_obligation",
        })
      : isCustomsCoverageComplete
      ? 100
      : 0;
  const pendingDirectPiastres =
    summary.pending_direct_customs_payments !== undefined
      ? toPiastres(summary.pending_direct_customs_payments, {
          fieldName: "pending_direct_customs_payments",
        })
      : 0;

  const isOutReceivableSettled = hasConfirmedFinalPrice && outstandingPiastres === 0;

  if (!hasConfirmedFinalPrice) {
    blockingReasons.push({
      code: "final_price_not_confirmed",
      message:
        "لا يمكن إغلاق مرحلة الرسوم والمدفوعات قبل تثبيت واعتماد السعر النهائي لأتعاب خدمة OUT.",
    });
  }

  if (summary.assessed_customs_obligation !== undefined && assessedPiastres <= 0) {
    blockingReasons.push({
      code: "missing_customs_assessment",
      message:
        "لا يمكن إغلاق مرحلة الرسوم والمدفوعات قبل تسجيل قيمة المطالبة الجمركية الرسمية المقررة.",
    });
  }

  if (pendingDirectPiastres > 0) {
    blockingReasons.push({
      code: "unverified_customs_payment",
      message: `توجد إيصالات سداد جمركي مباشر من العميل بقيمة ${fromPiastres(pendingDirectPiastres)} ج.م بانتظار التحقق والاعتماد.`,
    });
  }

  if (!isCustomsCoverageComplete) {
    blockingReasons.push({
      code: "customs_coverage_incomplete",
      message:
        "لا يمكن إكمال مرحلة الرسوم الجمركية والمدفوعات: لم يتم استيفاء تغطية المطالبات الجمركية المعتمدة بالكامل عبر دفعات مؤكدة.",
    });
  }

  if (outstandingPiastres > 0) {
    blockingReasons.push({
      code: "outstanding_balance_unpaid",
      message:
        "لا يمكن إكمال مرحلة الرسوم الجمركية والمدفوعات: لا يزال هناك رصيد مستحق لـ OUT على العميل لم يتم تحصيله.",
    });
  } else if (outstandingPiastres < 0) {
    blockingReasons.push({
      code: "overpayment_unsettled",
      message: `يوجد رصيد دائن/فائض تحصيل للعميل بقيمة ${fromPiastres(Math.abs(outstandingPiastres))} ج.م يتطلب تسوية قبل إغلاق المرحلة المالية.`,
    });
  }

  return {
    canComplete: blockingReasons.length === 0,
    isCustomsCoverageComplete,
    hasConfirmedFinalPrice,
    isOutReceivableSettled,
    blockingReasons,
  };
}

// ─── 7. Pure Transaction Validation (Mirrors Migration 0019 CHECK & Triggers) ─

export interface ValidateFinancialTransactionInput {
  shipment_id: string;
  customs_obligation_id?: string | null;
  entry_category: FinancialTransactionCategory;
  entry_type: FinancialTransactionType;
  entry_status?: FinancialTransactionStatus;
  direction?: FinancialTransactionDirection;
  amount: MonetaryNumericValue;
  allocated_customs_amount?: MonetaryNumericValue;
  is_billable_to_customer?: boolean;
  customer_visible?: boolean;
  payment_method?: FinancialPaymentMethod | null;
  reference_number?: string | null;
  idempotency_key: string;
  reversal_of_transaction_id?: string | null;
  reversal_reason?: string | null;
  verified_by?: string | null;
  verified_at?: string | null;
  rejection_reason?: string | null;
  /** Optional target obligation when validating linkage */
  linkedObligation?: Pick<
    ShipmentCustomsObligationRow,
    "id" | "shipment_id" | "status" | "assessed_amount"
  > | null;
  /** Optional current posted customs coverage on `linkedObligation` (in EGP) */
  currentObligationCoveredAmount?: MonetaryNumericValue;
  /** Optional original transaction when validating a reversal entry (`direction = -1`) */
  originalTransaction?: Pick<
    ShipmentFinancialTransactionRow,
    | "id"
    | "shipment_id"
    | "customs_obligation_id"
    | "entry_category"
    | "entry_type"
    | "entry_status"
    | "direction"
    | "amount"
    | "allocated_customs_amount"
    | "is_billable_to_customer"
    | "customer_visible"
    | "is_reversed"
  > | null;
}

export interface FinancialValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validates a financial transaction candidate against all Migration 0019 constraints
 * (`shipment_financial_tx_*` CHECK constraints and `enforce_financial_transaction_integrity` trigger).
 */
export function validateFinancialTransactionInput(
  input: ValidateFinancialTransactionInput,
): FinancialValidationResult {
  const errors: string[] = [];

  if (!input.shipment_id || input.shipment_id.trim().length === 0) {
    errors.push("shipment_id is required.");
  }

  if (!input.idempotency_key || input.idempotency_key.trim().length === 0) {
    errors.push("idempotency_key is required and cannot be blank.");
  }

  if (!FINANCIAL_TRANSACTION_CATEGORIES.includes(input.entry_category)) {
    errors.push(`Unsupported entry_category: ${String(input.entry_category)}`);
  }

  if (!FINANCIAL_TRANSACTION_TYPES.includes(input.entry_type)) {
    errors.push(`Unsupported entry_type: ${String(input.entry_type)}`);
  }

  // Category <-> Entry Type Matrix (`shipment_financial_tx_category_type_check`)
  const allowedTypes = FINANCIAL_CATEGORY_ALLOWED_TYPES[input.entry_category];
  if (allowedTypes && !allowedTypes.includes(input.entry_type)) {
    errors.push(
      `entry_type "${input.entry_type}" is not permitted for entry_category "${input.entry_category}".`,
    );
  }

  const entryStatus: FinancialTransactionStatus = input.entry_status ?? "posted";
  if (!FINANCIAL_TRANSACTION_STATUSES.includes(entryStatus)) {
    errors.push(`Unsupported entry_status: ${String(entryStatus)}`);
  }

  const direction: FinancialTransactionDirection = input.direction ?? 1;
  if (direction !== 1 && direction !== -1) {
    errors.push(`direction must be 1 or -1.`);
  }

  if (
    input.payment_method !== undefined &&
    input.payment_method !== null &&
    !FINANCIAL_PAYMENT_METHODS.includes(input.payment_method)
  ) {
    errors.push(`Unsupported payment_method: ${String(input.payment_method)}`);
  }

  // Payment Evidence Requirement (`shipment_financial_tx_payment_evidence_check`)
  if (
    input.entry_category === "out_disbursement" ||
    input.entry_category === "customer_payment_to_out" ||
    input.entry_category === "customer_direct_customs_payment"
  ) {
    if (!input.payment_method) {
      errors.push(
        `payment_method is required for entry_category "${input.entry_category}".`,
      );
    }
    if (!input.reference_number || input.reference_number.trim().length < 2) {
      errors.push(
        `reference_number (at least 2 characters) is required for entry_category "${input.entry_category}".`,
      );
    }
  }

  let amountPiastres = 0;
  let allocatedPiastres = 0;

  try {
    amountPiastres = toPiastres(input.amount, {
      fieldName: "amount",
      allowNegative: false,
      allowZero: false,
    });
  } catch (err) {
    errors.push(err instanceof Error ? err.message : "Invalid amount.");
  }

  try {
    allocatedPiastres = toPiastres(input.allocated_customs_amount ?? 0, {
      fieldName: "allocated_customs_amount",
      allowNegative: false,
      allowZero: true,
    });
  } catch (err) {
    errors.push(err instanceof Error ? err.message : "Invalid allocated_customs_amount.");
  }

  if (amountPiastres > 0 && allocatedPiastres > amountPiastres) {
    errors.push("allocated_customs_amount cannot exceed amount.");
  }

  // Customs Allocation Rules (`shipment_financial_tx_customs_allocation_check`)
  const customsObligationId = input.customs_obligation_id ?? null;
  if (input.entry_type === "customs_duties") {
    if (customsObligationId === null) {
      errors.push("customs_duties entries require a non-null customs_obligation_id.");
    }
    if (amountPiastres > 0 && allocatedPiastres !== amountPiastres) {
      errors.push("customs_duties entries require allocated_customs_amount === amount.");
    }
  } else {
    if (allocatedPiastres !== 0 || customsObligationId !== null) {
      errors.push(
        `entry_type "${input.entry_type}" cannot have customs_obligation_id or allocated_customs_amount > 0.`,
      );
    }
  }

  // Billable & Customer Visibility Rules (`shipment_financial_tx_category_type_check` & `shipment_financial_tx_customer_visibility_check`)
  const isBillable =
    input.is_billable_to_customer ??
    (input.entry_category === "customer_direct_customs_payment" ? false : true);
  const customerVisible =
    input.customer_visible ??
    (entryStatus === "posted" &&
      (input.entry_category !== "out_disbursement" || isBillable === true));

  if (input.entry_category === "customer_direct_customs_payment" && isBillable !== false) {
    errors.push(
      "customer_direct_customs_payment must have is_billable_to_customer = false (never billed by OUT).",
    );
  }
  if (
    (input.entry_category === "customer_charge" ||
      input.entry_category === "customer_payment_to_out" ||
      input.entry_category === "credit_adjustment") &&
    isBillable !== true
  ) {
    errors.push(
      `${input.entry_category} must have is_billable_to_customer = true per Migration 0019 constraint.`,
    );
  }
  if (customerVisible === true) {
    if (entryStatus !== "posted") {
      errors.push(
        "Unverified or rejected transactions (entry_status !== 'posted') cannot have customer_visible = true.",
      );
    }
    if (input.entry_category === "out_disbursement" && isBillable === false) {
      errors.push(
        "Non-billable out_disbursement (is_billable_to_customer = false) cannot be customer_visible = true.",
      );
    }
  }

  // Direct Customer Customs Payment Verification Rule (`shipment_financial_tx_direct_customs_verification_check`)
  if (
    input.entry_category === "customer_direct_customs_payment" &&
    entryStatus === "posted"
  ) {
    if (!input.verified_by || !input.verified_at) {
      errors.push(
        "Posted customer_direct_customs_payment requires both verified_by and verified_at.",
      );
    }
    if (!input.reference_number || input.reference_number.trim().length < 2) {
      errors.push(
        "Posted customer_direct_customs_payment requires a valid reference_number.",
      );
    }
  }

  // Reversal Rules (`shipment_financial_tx_reversal_integrity_check`)
  const reversalOfId = input.reversal_of_transaction_id ?? null;
  const reversalReason = input.reversal_reason ?? null;
  if (direction === 1) {
    if (reversalOfId !== null || reversalReason !== null) {
      errors.push(
        "Normal transactions (direction = 1) must have reversal_of_transaction_id = null and reversal_reason = null.",
      );
    }
  } else {
    if (reversalOfId === null) {
      errors.push("Reversal transactions (direction = -1) require reversal_of_transaction_id.");
    }
    if (!reversalReason || reversalReason.trim().length < 3) {
      errors.push(
        "Reversal transactions (direction = -1) require a reversal_reason of at least 3 characters.",
      );
    }
    if (entryStatus !== "posted") {
      errors.push(
        "Reversal transactions (direction = -1) must be created with entry_status = 'posted'.",
      );
    }
  }

  if (entryStatus === "rejected") {
    if (!input.rejection_reason || input.rejection_reason.trim().length === 0) {
      errors.push("Rejected transactions require a non-empty rejection_reason.");
    }
  } else if (input.rejection_reason !== undefined && input.rejection_reason !== null) {
    errors.push("Only rejected transactions may have a non-null rejection_reason.");
  }

  // Cross-record validation if linkedObligation is supplied
  if (input.linkedObligation) {
    if (input.linkedObligation.shipment_id !== input.shipment_id) {
      errors.push("customs_obligation_id belongs to a different shipment_id.");
    }
    if (input.linkedObligation.status === "cancelled") {
      errors.push("Cannot link a transaction to a cancelled customs obligation.");
    }
    if (
      direction === 1 &&
      entryStatus === "posted" &&
      input.linkedObligation.assessed_amount !== undefined
    ) {
      const assessedPiastres = toPiastres(input.linkedObligation.assessed_amount);
      const currentCoveredPiastres = toPiastres(input.currentObligationCoveredAmount ?? 0);
      if (currentCoveredPiastres + allocatedPiastres > assessedPiastres) {
        errors.push(
          `Customs allocation (${fromPiastres(currentCoveredPiastres + allocatedPiastres)} EGP) exceeds obligation assessed_amount (${fromPiastres(assessedPiastres)} EGP).`,
        );
      }
    }
  }

  // Cross-record validation if originalTransaction is supplied for a reversal
  if (direction === -1 && input.originalTransaction) {
    const orig = input.originalTransaction;
    if (orig.shipment_id !== input.shipment_id) {
      errors.push("Reversal transaction shipment_id does not match original transaction shipment_id.");
    }
    if (orig.entry_status !== "posted") {
      errors.push("Only posted transactions can be reversed.");
    }
    if (orig.direction !== 1) {
      errors.push("Cannot reverse a transaction that is itself a reversal (direction = -1).");
    }
    if (orig.is_reversed) {
      errors.push("Original transaction has already been reversed.");
    }
    if (
      orig.entry_category !== input.entry_category ||
      orig.entry_type !== input.entry_type
    ) {
      errors.push("Reversal entry_category and entry_type must match the original transaction.");
    }
    const origAmountPiastres = toPiastres(orig.amount);
    const origAllocatedPiastres = toPiastres(orig.allocated_customs_amount);
    if (
      origAmountPiastres !== amountPiastres ||
      origAllocatedPiastres !== allocatedPiastres
    ) {
      errors.push(
        "Reversal amount and allocated_customs_amount must exactly match the original transaction.",
      );
    }
    if ((orig.customs_obligation_id ?? null) !== customsObligationId) {
      errors.push("Reversal customs_obligation_id must match the original transaction.");
    }
    if (
      orig.is_billable_to_customer !== isBillable ||
      orig.customer_visible !== customerVisible
    ) {
      errors.push(
        "Reversal is_billable_to_customer and customer_visible must match the original transaction.",
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// ─── 8. Pure Customer-Safe Financial Statement Builder ────────────────────────

/**
 * Pure TypeScript equivalent of `public.get_customer_shipment_financial_statement(p_shipment_id uuid)`.
 * Filters transactions to only posted, customer-visible rows (excluding non-billable OUT disbursements)
 * and strips all internal staff/audit metadata (`created_by`, `verified_by`, `reversed_by`,
 * `idempotency_key`, `is_billable_to_customer`, `customer_visible`, `rejection_reason`).
 */
export function buildCustomerFinancialStatement(
  transactions: readonly ShipmentFinancialTransactionRow[],
): CustomerShipmentFinancialStatementItem[] {
  const visiblePosted = transactions.filter(
    (tx) =>
      tx.entry_status === "posted" &&
      tx.customer_visible === true &&
      !(tx.entry_category === "out_disbursement" && tx.is_billable_to_customer === false),
  );

  return visiblePosted.map((tx) => {
    const normalized = normalizeFinancialTransactionRow(tx);
    return {
      transaction_id: normalized.id,
      shipment_id: normalized.shipment_id,
      entry_category: normalized.entry_category,
      entry_type: normalized.entry_type,
      direction: normalized.direction,
      amount: normalized.amount,
      signed_amount: normalized.signed_amount,
      currency: "EGP",
      payment_method: normalized.payment_method,
      reference_number: normalized.reference_number,
      transaction_date: normalized.transaction_date,
      description: normalized.description,
      is_reversed: normalized.is_reversed,
      reversal_of_transaction_id: normalized.reversal_of_transaction_id,
      reversal_reason: normalized.reversal_reason,
      created_at: normalized.created_at,
    };
  });
}
