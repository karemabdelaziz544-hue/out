import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  buildCustomerFinancialStatement,
  calculateCustomsObligationSummary,
  calculateOutReceivableSummary,
  calculateShipmentFinancialSummary,
  deriveSingleObligationCoverageStatus,
  evaluateStage9FinancialGate,
  fromPiastres,
  normalizeMonetaryAmount,
  toPiastres,
  validateFinancialTransactionInput,
} from "../financial-calculations";
import { buildAuthoritativeTenStageJourney } from "../canonical-journey-adapter";
import type { Shipment } from "../../../types";
import type { ShipmentCustomsJourney } from "../../../types/journey";
import type {
  ShipmentCustomsObligationRow,
  ShipmentFinancialTransactionRow,
} from "../../../types/financial";

// ─── Test Fixtures Helpers ────────────────────────────────────────────────────

const SHIPMENT_ID = "11111111-1111-4111-8111-111111111111";
const OBLIGATION_1_ID = "22222222-2222-4222-8222-222222222222";
const ADMIN_USER_ID = "99999999-9999-4999-8999-999999999999";

function makeObligation(
  overrides: Partial<ShipmentCustomsObligationRow> = {},
): ShipmentCustomsObligationRow {
  return {
    id: OBLIGATION_1_ID,
    shipment_id: SHIPMENT_ID,
    claim_type: "primary_assessment",
    customs_claim_number: "CLM-2026-001",
    assessed_amount: "50000.00",
    currency: "EGP",
    status: "assessed",
    assessed_at: "2026-11-15T10:00:00Z",
    notes: null,
    created_by: ADMIN_USER_ID,
    updated_by: ADMIN_USER_ID,
    created_at: "2026-11-15T10:00:00Z",
    updated_at: "2026-11-15T10:00:00Z",
    ...overrides,
  };
}

let txCounter = 0;
function makeTransaction(
  overrides: Partial<ShipmentFinancialTransactionRow>,
): ShipmentFinancialTransactionRow {
  txCounter += 1;
  return {
    id: `33333333-3333-4333-8333-${String(txCounter).padStart(12, "0")}`,
    shipment_id: SHIPMENT_ID,
    customs_obligation_id: null,
    entry_category: "out_disbursement",
    entry_type: "customs_duties",
    entry_status: "posted",
    direction: 1,
    amount: "1000.00",
    allocated_customs_amount: "0.00",
    currency: "EGP",
    is_billable_to_customer: true,
    customer_visible: true,
    payment_method: "bank_transfer",
    reference_number: `REF-${txCounter}`,
    recipient_or_counterparty: null,
    transaction_date: "2026-11-15T12:00:00Z",
    attachment_document_id: null,
    description: "Test transaction",
    idempotency_key: `idem-${txCounter}`,
    reversal_of_transaction_id: null,
    reversal_reason: null,
    is_reversed: false,
    reversed_at: null,
    reversed_by: null,
    created_by: ADMIN_USER_ID,
    verified_by: ADMIN_USER_ID,
    verified_at: "2026-11-15T12:05:00Z",
    rejection_reason: null,
    created_at: "2026-11-15T12:00:00Z",
    ...overrides,
  };
}

// ─── Unit Tests ───────────────────────────────────────────────────────────────

describe("Phase 2 / Step 2 — Financial Calculations & Ledger Invariants", () => {
  describe("Decimal-Safe Piastres Arithmetic", () => {
    it("parses string and number decimals without IEEE-754 floating-point drift", () => {
      assert.equal(toPiastres(19.99), 1999);
      assert.equal(toPiastres("19.99"), 1999);
      assert.equal(fromPiastres(toPiastres(0.1) + toPiastres(0.2)), 0.3);
      assert.equal(fromPiastres(toPiastres("125432.75") + toPiastres("0.25")), 125433);
      assert.equal(normalizeMonetaryAmount("100.555"), 100.56);
    });

    it("rejects malformed, NaN, Infinity, or out-of-range monetary values", () => {
      assert.throws(() => toPiastres(Number.NaN), /not finite/);
      assert.throws(() => toPiastres(Number.POSITIVE_INFINITY), /not finite/);
      assert.throws(() => toPiastres("abc"), /Invalid monetary format/);
      assert.throws(() => toPiastres("-50.00", { allowNegative: false }), /Negative monetary value/);
      assert.throws(() => toPiastres("0.00", { allowZero: false }), /Zero monetary value/);
    });
  });

  describe("Scenario 1: OUT pays Customs and bills the customer -> settles after full collection", () => {
    it("requires customer collection of both OUT customs disbursement and confirmed fixed service fee before completing Stage 9", () => {
      const obligations = [makeObligation({ assessed_amount: "45000.50" })];
      const pricing = {
        status: "customer_approved" as const,
        approval_type: "final_fixed" as const,
        final_price: "7500.25",
      };

      const outPaysCustoms = makeTransaction({
        customs_obligation_id: OBLIGATION_1_ID,
        entry_category: "out_disbursement",
        entry_type: "customs_duties",
        entry_status: "posted",
        amount: "45000.50",
        allocated_customs_amount: "45000.50",
        is_billable_to_customer: true,
        customer_visible: true,
      });

      const customsOnly = calculateCustomsObligationSummary({
        obligations,
        transactions: [outPaysCustoms],
      });
      assert.equal(customsOnly.assessed_customs_obligation, 45000.5);
      assert.equal(customsOnly.out_customs_disbursements, 45000.5);
      assert.equal(customsOnly.is_customs_coverage_complete, true);

      const summaryBeforeCollection = calculateShipmentFinancialSummary({
        shipmentId: SHIPMENT_ID,
        obligations,
        transactions: [outPaysCustoms],
        pricing,
      });

      assert.equal(summaryBeforeCollection.is_customs_coverage_complete, true);
      assert.equal(summaryBeforeCollection.remaining_customs_obligation, 0);
      assert.equal(summaryBeforeCollection.billable_out_disbursements, 45000.5);
      assert.equal(summaryBeforeCollection.confirmed_out_service_fee, 7500.25);
      assert.equal(summaryBeforeCollection.total_customer_receivable_to_out, 52500.75);
      assert.equal(summaryBeforeCollection.outstanding_balance_to_out, 52500.75);
      assert.equal(summaryBeforeCollection.is_financial_settlement_complete, false);

      const gateBefore = evaluateStage9FinancialGate(summaryBeforeCollection);
      assert.equal(gateBefore.canComplete, false);
      assert.deepEqual(
        gateBefore.blockingReasons.map((r) => r.code),
        ["outstanding_balance_unpaid"],
      );

      const customerPaysOut = makeTransaction({
        entry_category: "customer_payment_to_out",
        entry_type: "final_settlement",
        entry_status: "posted",
        amount: "52500.75",
        allocated_customs_amount: "0.00",
        is_billable_to_customer: true,
        customer_visible: true,
      });

      const summaryAfterCollection = calculateShipmentFinancialSummary({
        shipmentId: SHIPMENT_ID,
        obligations,
        transactions: [outPaysCustoms, customerPaysOut],
        pricing,
      });

      assert.equal(summaryAfterCollection.total_received_by_out, 52500.75);
      assert.equal(summaryAfterCollection.outstanding_balance_to_out, 0);
      assert.equal(summaryAfterCollection.is_financial_settlement_complete, true);

      const gateAfter = evaluateStage9FinancialGate(summaryAfterCollection);
      assert.equal(gateAfter.canComplete, true);
      assert.equal(gateAfter.blockingReasons.length, 0);
    });
  });

  describe("Scenario 2: Customer pays Customs directly -> never enters OUT receivable", () => {
    it("covers Customs obligation without charging the customer in OUT receivable, requiring only OUT service fee collection", () => {
      const obligations = [makeObligation({ assessed_amount: "80000.00" })];
      const pricing = {
        status: "customer_approved" as const,
        approval_type: "final_fixed" as const,
        final_price: "10000.00",
      };

      const directCustomsPayment = makeTransaction({
        customs_obligation_id: OBLIGATION_1_ID,
        entry_category: "customer_direct_customs_payment",
        entry_type: "customs_duties",
        entry_status: "posted",
        amount: "80000.00",
        allocated_customs_amount: "80000.00",
        is_billable_to_customer: false,
        customer_visible: true,
      });

      const serviceFeeCollection = makeTransaction({
        entry_category: "customer_payment_to_out",
        entry_type: "final_settlement",
        entry_status: "posted",
        amount: "10000.00",
        allocated_customs_amount: "0.00",
        is_billable_to_customer: true,
        customer_visible: true,
      });

      const summary = calculateShipmentFinancialSummary({
        shipmentId: SHIPMENT_ID,
        obligations,
        transactions: [directCustomsPayment, serviceFeeCollection],
        pricing,
      });

      assert.equal(summary.verified_direct_customs_payments, 80000);
      assert.equal(summary.out_customs_disbursements, 0);
      assert.equal(summary.total_customs_covered, 80000);
      assert.equal(summary.is_customs_coverage_complete, true);

      assert.equal(summary.billable_out_disbursements, 0);
      assert.equal(summary.total_customer_receivable_to_out, 10000);
      assert.equal(summary.total_received_by_out, 10000);
      assert.equal(summary.outstanding_balance_to_out, 0);
      assert.equal(summary.is_financial_settlement_complete, true);
    });
  });

  describe("Scenario 3: Non-billable OUT operational expense -> never enters customer receivable or statement", () => {
    it("records non-billable OUT expense in non_billable_out_disbursements and hides it from customer receivable and statement", () => {
      const obligations = [makeObligation({ assessed_amount: "20000.00" })];
      const pricing = {
        status: "customer_approved" as const,
        approval_type: "final_fixed" as const,
        final_price: "5000.00",
      };

      const directCustoms = makeTransaction({
        customs_obligation_id: OBLIGATION_1_ID,
        entry_category: "customer_direct_customs_payment",
        entry_type: "customs_duties",
        entry_status: "posted",
        amount: "20000.00",
        allocated_customs_amount: "20000.00",
        is_billable_to_customer: false,
        customer_visible: true,
      });

      const internalOutExpense = makeTransaction({
        entry_category: "out_disbursement",
        entry_type: "other_expense",
        entry_status: "posted",
        amount: "1200.00",
        allocated_customs_amount: "0.00",
        is_billable_to_customer: false,
        customer_visible: false,
      });

      const customerPaysServiceFee = makeTransaction({
        entry_category: "customer_payment_to_out",
        entry_type: "final_settlement",
        entry_status: "posted",
        amount: "5000.00",
        allocated_customs_amount: "0.00",
        is_billable_to_customer: true,
        customer_visible: true,
      });

      const summary = calculateShipmentFinancialSummary({
        shipmentId: SHIPMENT_ID,
        obligations,
        transactions: [directCustoms, internalOutExpense, customerPaysServiceFee],
        pricing,
      });

      assert.equal(summary.total_out_disbursements, 1200);
      assert.equal(summary.non_billable_out_disbursements, 1200);
      assert.equal(summary.billable_out_disbursements, 0);
      assert.equal(summary.total_customer_receivable_to_out, 5000);
      assert.equal(summary.outstanding_balance_to_out, 0);
      assert.equal(summary.is_financial_settlement_complete, true);

      const customerStatement = buildCustomerFinancialStatement([
        directCustoms,
        internalOutExpense,
        customerPaysServiceFee,
      ]);
      assert.equal(customerStatement.length, 2);
      assert.equal(
        customerStatement.some((item) => item.transaction_id === internalOutExpense.id),
        false,
      );
    });
  });

  describe("Scenario 4: Estimated range approval only (no confirmed final_fixed price) -> blocks settlement", () => {
    it("keeps has_confirmed_final_price = false and blocks Stage 9 completion even when estimated range is approved", () => {
      const obligations = [makeObligation({ assessed_amount: "30000.00" })];
      const estimatedOnlyPricing = {
        status: "customer_approved" as const,
        approval_type: "estimated_range" as const,
        estimated_min_price: "6000.00",
        estimated_max_price: "8000.00",
        final_price: null,
      };

      const directCustoms = makeTransaction({
        customs_obligation_id: OBLIGATION_1_ID,
        entry_category: "customer_direct_customs_payment",
        entry_type: "customs_duties",
        entry_status: "posted",
        amount: "30000.00",
        allocated_customs_amount: "30000.00",
        is_billable_to_customer: false,
        customer_visible: true,
      });

      const summary = calculateShipmentFinancialSummary({
        shipmentId: SHIPMENT_ID,
        obligations,
        transactions: [directCustoms],
        pricing: estimatedOnlyPricing,
      });

      assert.equal(summary.is_customs_coverage_complete, true);
      assert.equal(summary.has_confirmed_final_price, false);
      assert.equal(summary.confirmed_out_service_fee, 0);
      assert.equal(summary.is_financial_settlement_complete, false);

      const gate = evaluateStage9FinancialGate(summary);
      assert.equal(gate.canComplete, false);
      assert.deepEqual(
        gate.blockingReasons.map((r) => r.code),
        ["final_price_not_confirmed"],
      );
    });
  });

  describe("Scenario 5: Pending verification transaction (`pending_verification`) -> does not count toward settlement", () => {
    it("tracks pending_direct_customs_payments separately and does not count pending entries toward customs coverage or OUT collections", () => {
      const obligations = [makeObligation({ assessed_amount: "25000.00" })];
      const pricing = {
        status: "customer_approved" as const,
        approval_type: "final_fixed" as const,
        final_price: "4000.00",
      };

      const pendingDirectCustoms = makeTransaction({
        customs_obligation_id: OBLIGATION_1_ID,
        entry_category: "customer_direct_customs_payment",
        entry_type: "customs_duties",
        entry_status: "pending_verification",
        amount: "25000.00",
        allocated_customs_amount: "25000.00",
        is_billable_to_customer: false,
        customer_visible: false,
        verified_by: null,
        verified_at: null,
      });

      const pendingCustomerPaymentToOut = makeTransaction({
        entry_category: "customer_payment_to_out",
        entry_type: "final_settlement",
        entry_status: "pending_verification",
        amount: "4000.00",
        allocated_customs_amount: "0.00",
        is_billable_to_customer: true,
        customer_visible: false,
        verified_by: null,
        verified_at: null,
      });

      const summary = calculateShipmentFinancialSummary({
        shipmentId: SHIPMENT_ID,
        obligations,
        transactions: [pendingDirectCustoms, pendingCustomerPaymentToOut],
        pricing,
      });

      assert.equal(summary.pending_direct_customs_payments, 25000);
      assert.equal(summary.verified_direct_customs_payments, 0);
      assert.equal(summary.total_customs_covered, 0);
      assert.equal(summary.remaining_customs_obligation, 25000);
      assert.equal(summary.is_customs_coverage_complete, false);

      assert.equal(summary.total_received_by_out, 0);
      assert.equal(summary.outstanding_balance_to_out, 4000);
      assert.equal(summary.is_financial_settlement_complete, false);

      const gate = evaluateStage9FinancialGate(summary);
      assert.equal(gate.canComplete, false);
      assert.deepEqual(
        gate.blockingReasons.map((r) => r.code),
        [
          "unverified_customs_payment",
          "customs_coverage_incomplete",
          "outstanding_balance_unpaid",
        ],
      );
    });
  });

  describe("Scenario 6: Reversal entry (`direction = -1`) -> algebraically cancels original posted transaction", () => {
    it("cancels the effect of a posted payment when reversed and re-opens the balance and obligation status", () => {
      const obligation = makeObligation({ assessed_amount: "15000.00" });
      const pricing = {
        status: "customer_approved" as const,
        approval_type: "final_fixed" as const,
        final_price: "3000.00",
      };

      const originalOutCustomsPayment = makeTransaction({
        id: "44444444-4444-4444-8444-444444444444",
        customs_obligation_id: OBLIGATION_1_ID,
        entry_category: "out_disbursement",
        entry_type: "customs_duties",
        entry_status: "posted",
        direction: 1,
        amount: "15000.00",
        allocated_customs_amount: "15000.00",
        is_billable_to_customer: true,
        customer_visible: true,
        is_reversed: true,
        reversed_at: "2026-11-15T14:00:00Z",
        reversed_by: ADMIN_USER_ID,
      });

      const reversalOutCustomsPayment = makeTransaction({
        id: "55555555-5555-4555-8555-555555555555",
        customs_obligation_id: OBLIGATION_1_ID,
        entry_category: "out_disbursement",
        entry_type: "customs_duties",
        entry_status: "posted",
        direction: -1,
        amount: "15000.00",
        allocated_customs_amount: "15000.00",
        is_billable_to_customer: true,
        customer_visible: true,
        reversal_of_transaction_id: originalOutCustomsPayment.id,
        reversal_reason: "تم إدخال مبلغ المطالبة بالخطأ على شحنة أخرى",
      });

      const summary = calculateShipmentFinancialSummary({
        shipmentId: SHIPMENT_ID,
        obligations: [obligation],
        transactions: [originalOutCustomsPayment, reversalOutCustomsPayment],
        pricing,
      });

      assert.equal(summary.out_customs_disbursements, 0);
      assert.equal(summary.total_customs_covered, 0);
      assert.equal(summary.remaining_customs_obligation, 15000);
      assert.equal(summary.is_customs_coverage_complete, false);
      assert.equal(summary.billable_out_disbursements, 0);
      assert.equal(summary.total_customer_receivable_to_out, 3000);

      const derivedStatus = deriveSingleObligationCoverageStatus(obligation, [
        originalOutCustomsPayment,
        reversalOutCustomsPayment,
      ]);
      assert.equal(derivedStatus, "assessed");
    });
  });

  describe("Additional Edge Cases: Partial Payments, Credit Adjustments, Overpayments & Validation", () => {
    it("handles partial customs coverage, extra customer charges, credit adjustments, and customer overpayments accurately", () => {
      const obligation = makeObligation({ assessed_amount: "10000.00" });
      const pricing = {
        status: "customer_approved" as const,
        approval_type: "final_fixed" as const,
        final_price: "5000.00",
      };

      const partialCustoms = makeTransaction({
        customs_obligation_id: OBLIGATION_1_ID,
        entry_category: "out_disbursement",
        entry_type: "customs_duties",
        entry_status: "posted",
        amount: "6000.00",
        allocated_customs_amount: "6000.00",
        is_billable_to_customer: true,
        customer_visible: true,
      });

      assert.equal(
        deriveSingleObligationCoverageStatus(obligation, [partialCustoms]),
        "partially_covered",
      );

      const extraCharge = makeTransaction({
        entry_category: "customer_charge",
        entry_type: "storage_surcharge",
        entry_status: "posted",
        amount: "750.50",
        allocated_customs_amount: "0.00",
        is_billable_to_customer: true,
        customer_visible: true,
      });

      const discountCredit = makeTransaction({
        entry_category: "credit_adjustment",
        entry_type: "discount_credit",
        entry_status: "posted",
        amount: "250.50",
        allocated_customs_amount: "0.00",
        is_billable_to_customer: true,
        customer_visible: true,
      });

      const remainingCustoms = makeTransaction({
        customs_obligation_id: OBLIGATION_1_ID,
        entry_category: "out_disbursement",
        entry_type: "customs_duties",
        entry_status: "posted",
        amount: "4000.00",
        allocated_customs_amount: "4000.00",
        is_billable_to_customer: true,
        customer_visible: true,
      });

      const customerOverpayment = makeTransaction({
        entry_category: "customer_payment_to_out",
        entry_type: "final_settlement",
        entry_status: "posted",
        amount: "16000.00",
        allocated_customs_amount: "0.00",
        is_billable_to_customer: true,
        customer_visible: true,
      });

      const receivable = calculateOutReceivableSummary({
        pricing,
        transactions: [
          partialCustoms,
          remainingCustoms,
          extraCharge,
          discountCredit,
          customerOverpayment,
        ],
      });

      assert.equal(receivable.total_customer_receivable_to_out, 15500);
      assert.equal(receivable.total_received_by_out, 16000);
      assert.equal(receivable.outstanding_balance_to_out, -500);
      assert.equal(receivable.customer_overpayment_credit, 500);
      assert.equal(receivable.is_out_receivable_settled, false);
    });

    it("enforces Migration 0019 validation rules in validateFinancialTransactionInput", () => {
      const invalidVisibility = validateFinancialTransactionInput({
        shipment_id: SHIPMENT_ID,
        entry_category: "out_disbursement",
        entry_type: "other_expense",
        entry_status: "posted",
        amount: "500.00",
        allocated_customs_amount: "0.00",
        is_billable_to_customer: false,
        customer_visible: true,
        payment_method: "cash",
        reference_number: "REF-CASH-01",
        idempotency_key: "idem-vis-1",
      });
      assert.equal(invalidVisibility.valid, false);
      assert.equal(
        invalidVisibility.errors.some((e) => e.includes("cannot be customer_visible = true")),
        true,
      );

      const invalidDirectBillable = validateFinancialTransactionInput({
        shipment_id: SHIPMENT_ID,
        customs_obligation_id: OBLIGATION_1_ID,
        entry_category: "customer_direct_customs_payment",
        entry_type: "customs_duties",
        entry_status: "pending_verification",
        amount: "10000.00",
        allocated_customs_amount: "10000.00",
        is_billable_to_customer: true,
        customer_visible: false,
        payment_method: "bank_transfer",
        reference_number: "REF-DIR-01",
        idempotency_key: "idem-dir-1",
      });
      assert.equal(invalidDirectBillable.valid, false);
    });

    it("blocks negative total_customer_receivable_to_out in evaluateStage9FinancialGate and prevents Stage 9/10 adapter bypass", () => {
      const negativeReceivableGate = evaluateStage9FinancialGate({
        has_confirmed_final_price: true,
        assessed_customs_obligation: 10000,
        pending_direct_customs_payments: 0,
        is_customs_coverage_complete: true,
        total_customer_receivable_to_out: -200,
        outstanding_balance_to_out: 0,
      });

      assert.equal(negativeReceivableGate.canComplete, false);
      assert.equal(negativeReceivableGate.isOutReceivableSettled, false);
      assert.equal(
        negativeReceivableGate.blockingReasons.some(
          (r) => r.code === "overpayment_unsettled",
        ),
        true,
      );

      const mockShipment: Shipment = {
        id: SHIPMENT_ID,
        reference_number: "SHP-GATE-TEST",
        customer_id: "cust-1",
        company_id: "comp-1",
        status: "customs_cleared",
        supplier_name: "Test Supplier",
        country_of_origin: "China",
        port_of_arrival: "Alexandria",
        goods_description: "Industrial Machinery",
        packages_count: 10,
        package_type: "Pallet",
        gross_weight: 2500,
        notes: null,
        goods_category: "industrial",
        applicable_procedures: [],
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
      };

      const unclosedStage9Journey = {
        shipmentId: SHIPMENT_ID,
        stages: [
          { stage_key: "stage_9_fees_payments", stage_order: 10, status: "in_progress", is_applicable: true, stage_data: {} },
          { stage_key: "stage_10_clearance_release", stage_order: 11, status: "in_progress", is_applicable: true, stage_data: {} },
        ],
      } as unknown as ShipmentCustomsJourney;

      const summary = calculateShipmentFinancialSummary({
        shipmentId: SHIPMENT_ID,
        obligations: [makeObligation({ assessed_amount: "10000.00" })],
        transactions: [],
        pricing: { status: "customer_approved", approval_type: "final_fixed", final_price: 5000 },
      });

      const adapted = buildAuthoritativeTenStageJourney({
        shipment: mockShipment,
        journey: unclosedStage9Journey,
        financialSummary: summary,
        pricing: {
          id: "pr-1",
          shipment_id: SHIPMENT_ID,
          estimated_min_price: 4000,
          estimated_max_price: 6000,
          final_price: 5000,
          currency: "EGP",
          status: "customer_approved",
          approval_type: "final_fixed",
          created_by: null,
          updated_by: null,
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: "2026-01-01T00:00:00.000Z",
          customer_approved_at: "2026-01-01T00:00:00.000Z",
        },
        isCustomerView: true,
      });

      const stage9 = adapted.stages.find((s) => s.key === "09_settlement");
      const stage10 = adapted.stages.find((s) => s.key === "10_clearance_release");
      assert.equal(stage9?.isCompleted, false);
      assert.equal(stage10?.isCompleted, false);
      assert.equal(adapted.primaryCustomerAction?.actionType, "settle_duties");
    });
  });
});
