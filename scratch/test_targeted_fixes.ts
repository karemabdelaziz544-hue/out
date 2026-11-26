import {
  computeCustomsOutstandingBalance,
  CARGOX_EXEMPTION_REASONS,
  isValidCargoXExemptionReason,
  type CustomsDutiesSettlementData,
  type CargoXExemptionReason,
} from "../src/types/journey";

console.log("==================================================================");
console.log("  OUT — TARGETED FIXES VERIFICATION TEST SUITE");
console.log("==================================================================\n");

let passed = 0;
let total = 0;

function assert(condition: boolean, testName: string, details?: string) {
  total++;
  if (condition) {
    console.log(`[PASS] ${testName}`);
    passed++;
  } else {
    console.error(`[FAIL] ${testName}${details ? ` -> ${details}` : ""}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// FIX 1: CUSTOMS DUTIES SETTLEMENT BALANCE
// ─────────────────────────────────────────────────────────────────────────────
console.log("--- SUITE 1: Customs Duties Settlement Balance Formula ---");

// Test 1.1: Assessed duties 15,000; OUT paid 0; customer paid 5,000.
// Intended balance: Customer still owes 10,000 EGP towards the assessed duties.
const t1_1: CustomsDutiesSettlementData = {
  assessed_customs_amount: 15000,
  amount_paid_by_out: 0,
  amount_collected_from_customer: 5000,
};
const bal1_1 = computeCustomsOutstandingBalance(t1_1);
assert(
  bal1_1 === 10000,
  "1.1: Assessed 15,000; OUT paid 0; Customer paid 5,000 => Balance is 10,000",
  `Expected 10000, got ${bal1_1}`
);

// Test 1.2: Assessed duties 15,000; OUT paid 15,000; customer paid 5,000.
// Intended balance: Customer still owes 10,000 EGP to reimburse OUT for the paid duties.
const t1_2: CustomsDutiesSettlementData = {
  assessed_customs_amount: 15000,
  amount_paid_by_out: 15000,
  amount_collected_from_customer: 5000,
};
const bal1_2 = computeCustomsOutstandingBalance(t1_2);
assert(
  bal1_2 === 10000,
  "1.2: Assessed 15,000; OUT paid 15,000; Customer paid 5,000 => Balance is 10,000",
  `Expected 10000, got ${bal1_2}`
);

// Test 1.3: Both parties' amounts are zero.
// Intended balance: Zero duties, zero payments => Balance is 0.
const t1_3: CustomsDutiesSettlementData = {
  assessed_customs_amount: 0,
  amount_paid_by_out: 0,
  amount_collected_from_customer: 0,
};
const bal1_3 = computeCustomsOutstandingBalance(t1_3);
assert(
  bal1_3 === 0,
  "1.3: Assessed 0; OUT paid 0; Customer paid 0 => Balance is 0",
  `Expected 0, got ${bal1_3}`
);

// Test 1.4: Missing/null fields with legacy-field fallback.
// duties_amount = 8,000; collected_from_customer = 3,000; modern fields null/missing.
// Intended balance: 8,000 - 3,000 => Balance is 5,000.
const t1_4: CustomsDutiesSettlementData = {
  duties_amount: 8000,
  collected_from_customer: 3000,
};
const bal1_4 = computeCustomsOutstandingBalance(t1_4);
assert(
  bal1_4 === 5000,
  "1.4: Legacy fallback: duties_amount 8,000; collected_from_customer 3,000 => Balance is 5,000",
  `Expected 5000, got ${bal1_4}`
);

// Test 1.5: Values where customer collections exceed the applicable target.
// Assessed 15,000; OUT paid 15,000; Customer paid 18,000.
// Intended balance: 15,000 - 18,000 => Negative balance (-3,000) indicating customer credit/overpayment.
const t1_5: CustomsDutiesSettlementData = {
  assessed_customs_amount: 15000,
  amount_paid_by_out: 15000,
  amount_collected_from_customer: 18000,
};
const bal1_5 = computeCustomsOutstandingBalance(t1_5);
assert(
  bal1_5 === -3000,
  "1.5: Collections exceed target: 15,000 target; 18,000 collected => Balance is -3,000",
  `Expected -3000, got ${bal1_5}`
);

// Test 1.6: Null input handling.
assert(
  computeCustomsOutstandingBalance(null) === 0 &&
  computeCustomsOutstandingBalance(undefined) === 0,
  "1.6: Null / undefined input gracefully returns 0",
);

// Test 1.7: OUT paid amount exceeds initial assessment (port penalties/tariffs).
// Test 1.7: OUT paid amount exceeds initial assessment (port penalties/tariffs).
// Assessed 15,000; OUT actually paid 16,500; customer paid 5,000.
// When authorized, intended balance is 16,500 - 5,000 = 11,500.
const t1_7: CustomsDutiesSettlementData = {
  assessed_customs_amount: 15000,
  amount_paid_by_out: 16500,
  amount_collected_from_customer: 5000,
  additional_disbursement_authorized: true,
};
const bal1_7 = computeCustomsOutstandingBalance(t1_7);
assert(
  bal1_7 === 11500,
  "1.7: OUT paid exceeds assessment (authorized): 16,500 disbursed; 5,000 collected => Balance is 11,500",
  `Expected 11500, got ${bal1_7}`
);

// ─────────────────────────────────────────────────────────────────────────────
// FIX 2: SERVER-SIDE CARGOX EXEMPTION VALIDATION
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n--- SUITE 2: Server-side CargoX Exemption Validation ---");

// Test 2.1: Valid exemption reasons (all 4 supported reasons from enum)
for (const reason of CARGOX_EXEMPTION_REASONS) {
  assert(
    isValidCargoXExemptionReason(reason),
    `2.1: Valid exemption reason recognized: '${reason}'`,
  );
}

// Test 2.2: Missing reason (undefined or null)
assert(
  !isValidCargoXExemptionReason(undefined),
  "2.2a: Undefined exemption reason is rejected",
);
assert(
  !isValidCargoXExemptionReason(null),
  "2.2b: Null exemption reason is rejected",
);

// Test 2.3: Empty reason (empty string or whitespace only)
assert(
  !isValidCargoXExemptionReason(""),
  "2.3a: Empty string exemption reason is rejected",
);
assert(
  !isValidCargoXExemptionReason("   "),
  "2.3b: Whitespace-only exemption reason is rejected",
);

// Test 2.4: Unsupported reason (arbitrary string or misspelled reason)
assert(
  !isValidCargoXExemptionReason("not_needed_for_this_shipment"),
  "2.4a: Arbitrary unsupported exemption reason is rejected",
);
assert(
  !isValidCargoXExemptionReason("air_freight"), // partial / typo
  "2.4b: Partial / misspelled exemption reason is rejected",
);
assert(
  !isValidCargoXExemptionReason(12345),
  "2.4c: Non-string input is rejected",
);

// ─────────────────────────────────────────────────────────────────────────────
// SUITE 3: INTEGRATION SIMULATION OF STAGE 7 CARGOX LOGIC
// ─────────────────────────────────────────────────────────────────────────────
console.log("\n--- SUITE 3: Stage 7 CargoX Server Action Logic Simulation ---");

// Helper function mirroring the exact logic implemented in journey-actions.ts
function simulateStage7CargoXValidation(cargox: any): { success: boolean; error?: string } {
  if (cargox) {
    if (cargox.is_applicable === false) {
      if (!isValidCargoXExemptionReason(cargox.exemption_reason)) {
        return {
          success: false,
          error: "عند تحديد عدم انطباق CargoX، يلزم توثيق سبب إعفاء رسمي معتمد لعدم انطباق CargoX.",
        };
      }
    } else {
      const isVerified =
        cargox.supplier_upload_verified === true &&
        cargox.acid_matched === true &&
        cargox.data_consistency_verified === true;
      if (!isVerified) {
        return {
          success: false,
          error: "يتطلب اكتمال إدراج البيانات استيفاء مطابقة CargoX (رفع المورد ومطابقة رقم ACID وتطابق البيانات)، أو توثيق سبب عدم الانطباق الرسمي.",
        };
      }
    }
  }
  return { success: true };
}

// Test 3.1: Valid exemption reason allows Stage 7 completion
const res3_1 = simulateStage7CargoXValidation({
  is_applicable: false,
  exemption_reason: "air_freight_exemption",
});
assert(res3_1.success, "3.1: CargoX is_applicable: false with valid reason succeeds");

// Test 3.2: Missing exemption reason blocks Stage 7 completion
const res3_2 = simulateStage7CargoXValidation({
  is_applicable: false,
  exemption_reason: null,
});
assert(!res3_2.success, "3.2: CargoX is_applicable: false with null reason is blocked");

// Test 3.3: Empty exemption reason blocks Stage 7 completion
const res3_3 = simulateStage7CargoXValidation({
  is_applicable: false,
  exemption_reason: "",
});
assert(!res3_3.success, "3.3: CargoX is_applicable: false with empty string reason is blocked");

// Test 3.4: Unsupported exemption reason blocks Stage 7 completion
const res3_4 = simulateStage7CargoXValidation({
  is_applicable: false,
  exemption_reason: "client_refused",
});
assert(!res3_4.success, "3.4: CargoX is_applicable: false with unsupported reason is blocked");

// Test 3.5: Applicable CargoX with incomplete checks (supplier upload false)
const res3_5 = simulateStage7CargoXValidation({
  is_applicable: true,
  supplier_upload_verified: false,
  acid_matched: true,
  data_consistency_verified: true,
});
assert(!res3_5.success, "3.5: Applicable CargoX with incomplete checks is blocked");

// Test 3.6: Applicable CargoX with all required checks completed
const res3_6 = simulateStage7CargoXValidation({
  is_applicable: true,
  supplier_upload_verified: true,
  acid_matched: true,
  data_consistency_verified: true,
});
assert(res3_6.success, "3.6: Applicable CargoX with all 3 checks completed succeeds");

// ─────────────────────────────────────────────────────────────────────────────
// SUMMARY
// ─────────────────────────────────────────────────────────────────────────────
console.log(`\n==================================================================`);
console.log(`  TARGETED FIXES RESULTS: ${passed} / ${total} PASSED (${Math.round((passed / total) * 100)}%)`);
console.log(`==================================================================\n`);

if (passed !== total) {
  process.exit(1);
}
