import {
  computeCustomsOutstandingBalance,
  CustomsDutiesSettlementData,
  CUSTOMS_STAGE_DEFINITIONS,
  CustomsStageKey,
} from "../src/types/journey";

const STAGE_KEYS_SEQUENCE: CustomsStageKey[] = [
  "stage_1_intake",
  "stage_2_pricing",
  "stage_3_nafeza_acid",
  "stage_4_type_procedures",
  "stage_5_scouting",
  "stage_6_inspection",
  "stage_7_data_entry",
  "stage_8_valuation",
  "stage_9_fees_payments",
  "stage_10_clearance_release",
];

console.log("==================================================================");
console.log("  OUT — PACKAGE 4.1: FINANCIAL SETTLEMENT & DIRECT PAYMENT TESTS");
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

// ================================================================================
// PART 1: HELPER / UNIT TESTS (Pure Functions & Calculation Invariants)
// ================================================================================
console.log("--- PART 1: UNIT / HELPER TESTS: Outstanding Balance Calculations ---");

// Test 1.1: Direct Customer Payment — Target is 0, no duplicate customer liability
const directPayNoCollected: CustomsDutiesSettlementData = {
  assessed_customs_amount: 25000,
  amount_paid_by_out: 0,
  duties_paid_by_out: false,
  amount_collected_from_customer: 0,
  settlement_status: "customer_paid_direct",
  customer_direct_payment_reference: "CUST-REC-99881",
};
assert(
  computeCustomsOutstandingBalance(directPayNoCollected) === 0,
  "Direct Payment (0 collected): balance is exactly 0 — no OUT collection, no customer liability",
  `Got: ${computeCustomsOutstandingBalance(directPayNoCollected)}`
);

// Test 1.2: Direct Customer Payment with prior collected amount — Negative balance (Customer Credit)
const directPayWithCollected: CustomsDutiesSettlementData = {
  assessed_customs_amount: 25000,
  amount_paid_by_out: 0,
  amount_collected_from_customer: 5000,
  settlement_status: "customer_paid_direct",
  customer_direct_payment_reference: "CUST-REC-99882",
};
const directCreditBalance = computeCustomsOutstandingBalance(directPayWithCollected);
assert(
  directCreditBalance === -5000,
  "Direct Payment (5000 collected): balance is -5000, representing customer credit",
  `Got: ${directCreditBalance}`
);

// Test 1.3: Additional OUT Disbursements WITHOUT Authorization — Capped at Assessed Duties
const unauthorizedExcess: CustomsDutiesSettlementData = {
  assessed_customs_amount: 20000,
  amount_paid_by_out: 26000, // OUT paid 6,000 extra
  amount_collected_from_customer: 10000,
  additional_disbursement_authorized: false,
};
assert(
  computeCustomsOutstandingBalance(unauthorizedExcess) === 10000,
  "Unauthorized Excess Disbursement: target is capped at assessed (20000), balance is 10000 (not 16000)",
  `Got: ${computeCustomsOutstandingBalance(unauthorizedExcess)}`
);

// Test 1.4: Additional OUT Disbursements WITH Authorization — Excess becomes customer debt
const authorizedExcess: CustomsDutiesSettlementData = {
  assessed_customs_amount: 20000,
  amount_paid_by_out: 26000, // OUT paid 6,000 extra
  amount_collected_from_customer: 10000,
  additional_disbursement_authorized: true,
  additional_disbursement_reason: "أرضيات ميناء إضافية موثقة بإيصال 1234",
};
assert(
  computeCustomsOutstandingBalance(authorizedExcess) === 16000,
  "Authorized Excess Disbursement: target expands to 26000, balance is 16000",
  `Got: ${computeCustomsOutstandingBalance(authorizedExcess)}`
);

// Test 1.5: Positive Balance Calculation (Customer Owes OUT)
const positiveBalance: CustomsDutiesSettlementData = {
  assessed_customs_amount: 30000,
  amount_paid_by_out: 30000,
  amount_collected_from_customer: 18000,
  settlement_status: "paid_by_out_awaiting_customer",
};
assert(
  computeCustomsOutstandingBalance(positiveBalance) === 12000,
  "Positive Balance: customer owes OUT 12000",
  `Got: ${computeCustomsOutstandingBalance(positiveBalance)}`
);

// Test 1.6: Zero Balance Calculation (Fully Settled)
const zeroBalance: CustomsDutiesSettlementData = {
  assessed_customs_amount: 30000,
  amount_paid_by_out: 30000,
  amount_collected_from_customer: 30000,
  settlement_status: "settled",
};
assert(
  computeCustomsOutstandingBalance(zeroBalance) === 0,
  "Zero Balance: customer liability fully settled (balance is 0)",
  `Got: ${computeCustomsOutstandingBalance(zeroBalance)}`
);

// Test 1.7: Negative Balance Calculation (Customer Overpayment / Credit)
const negativeBalance: CustomsDutiesSettlementData = {
  assessed_customs_amount: 30000,
  amount_paid_by_out: 30000,
  amount_collected_from_customer: 35000, // Customer paid 5,000 extra
};
assert(
  computeCustomsOutstandingBalance(negativeBalance) === -5000,
  "Negative Balance: overpayment of 5000 is represented as -5000 (customer credit)",
  `Got: ${computeCustomsOutstandingBalance(negativeBalance)}`
);

// ================================================================================
// PART 2: SERVER ACTION VALIDATION RULES & INVARIANT GUARDS
// ================================================================================
console.log("\n--- PART 2: SERVER ACTION LOGIC & VALIDATION GUARDS ---");

// Helper simulating server-side validation logic from updateCustomsStageAction
function simulateServerValidation(params: {
  userRole: string;
  stageKey: CustomsStageKey;
  targetStageStatus: string;
  settlementStatusRaw?: string;
  customerDirectPaymentRef?: string | null;
  amountPaidByOut?: number | null;
  assessedCustomsAmount?: number | null;
  additionalAuthorized?: boolean;
  additionalReason?: string | null;
  amountCollectedFromCustomer?: number | null;
  precedingStagesStatus?: Record<string, string>;
  releasePermitNumber?: string | null;
}): { success: boolean; error?: string } {
  const stageDef = CUSTOMS_STAGE_DEFINITIONS[params.stageKey];
  if (!stageDef) return { success: false, error: "المرحلة غير صالحة" };

  // 1. Role Authorization
  const isSuperAdmin = params.userRole === "admin" || params.userRole === "manager";
  if (!isSuperAdmin && stageDef.expectedRole !== params.userRole) {
    return {
      success: false,
      error: `غير مصرح لدورك التشغيلي بتحديث مرحلة «${stageDef.title}». الدور المطلوب هو ${stageDef.expectedRole}.`,
    };
  }

  // 2. Stage Sequence check (DEF-08)
  if (params.precedingStagesStatus && stageDef.order >= 4 && (params.targetStageStatus === "completed" || params.targetStageStatus === "in_progress")) {
    for (const key of STAGE_KEYS_SEQUENCE) {
      const def = CUSTOMS_STAGE_DEFINITIONS[key];
      if (def.order >= 4 && def.order < stageDef.order) {
        const pStatus = params.precedingStagesStatus[key] || "pending";
        if (pStatus === "blocked" || pStatus === "needs_correction") {
          return { success: false, error: `لا يمكن تحديث هذه المرحلة لوجود توقف في «${def.title}».` };
        }
        if (params.targetStageStatus === "completed" && pStatus !== "completed") {
          if (key === "stage_5_scouting" && params.stageKey === "stage_6_inspection") continue;
          return { success: false, error: `لا يمكن اعتماد اكتمال مرحلة «${stageDef.title}» قبل اكتمال «${def.title}».` };
        }
      }
    }
  }

  // 3. Stage 9 Financial Rules
  if (params.stageKey === "stage_9_fees_payments") {
    // Direct payment missing receipt check
    if (params.settlementStatusRaw === "customer_paid_direct") {
      if (!params.customerDirectPaymentRef) {
        return {
          success: false,
          error: "عند تحديد سداد العميل مباشرة لمصلحة الجمارك، يلزم إدخال وتوثيق رقم إيصال أو مرجع السداد الرسمي الصادر من الجمارك أو البنك.",
        };
      }
    }

    // Additional disbursement reason check
    if (
      params.amountPaidByOut &&
      params.assessedCustomsAmount &&
      params.amountPaidByOut > params.assessedCustomsAmount
    ) {
      if (params.additionalAuthorized && !params.additionalReason) {
        return {
          success: false,
          error: "عند تحميل العميل مبالغ إضافية تتجاوز التقدير الجمركي الرسمي، يلزم توثيق وتوضيح سبب المصروف الإضافي المعتمد.",
        };
      }
    }

    const sData: CustomsDutiesSettlementData = {
      assessed_customs_amount: params.assessedCustomsAmount ?? null,
      amount_paid_by_out: params.settlementStatusRaw === "customer_paid_direct" ? 0 : params.amountPaidByOut ?? null,
      amount_collected_from_customer: params.amountCollectedFromCustomer ?? null,
      settlement_status: params.settlementStatusRaw as any,
      additional_disbursement_authorized: params.additionalAuthorized,
      customer_direct_payment_reference: params.customerDirectPaymentRef ?? null,
    };

    // Rejection of "settled" when positive balance remains
    if (params.settlementStatusRaw === "settled") {
      const remainingBalance = computeCustomsOutstandingBalance(sData);
      if (remainingBalance > 0) {
        return {
          success: false,
          error: `لا يمكن اعتماد حالة «تمت التسوية والسداد بالكامل» لوجود رصيد رسوم جمركية مستحق على العميل بقيمة ${remainingBalance} ج.م.`,
        };
      }
    }

    // Stage 9 completion rules
    if (params.targetStageStatus === "completed") {
      if (params.settlementStatusRaw === "paid_by_out_awaiting_customer") {
        return {
          success: false,
          error: "لا يمكن اعتماد اكتمال مرحلة الرسوم الجمركية في حين أنها لا تزال بانتظار تحصيل المستحقات من العميل.",
        };
      }
      if (params.settlementStatusRaw === "customer_paid_direct") {
        if (!params.customerDirectPaymentRef) {
          return {
            success: false,
            error: "يتطلب اكتمال مرحلة الرسوم بسداد العميل المباشر إدخال وتوثيق رقم إيصال أو مرجع السداد الرسمي.",
          };
        }
      } else {
        const remainingBalance = computeCustomsOutstandingBalance(sData);
        if (remainingBalance > 0) {
          return {
            success: false,
            error: `لا يمكن اعتماد اكتمال مرحلة الرسوم الجمركية لوجود رصيد رسوم جمركية مستحق على العميل بقيمة ${remainingBalance} ج.م.`,
          };
        }
      }
    }
  }

  // 4. Stage 10 Release Rules
  if (params.stageKey === "stage_10_clearance_release" && params.targetStageStatus === "completed") {
    if (!params.releasePermitNumber) {
      return { success: false, error: "يتطلب اعتماد الإفراج النهائي إدخال رقم إذن الإفراج الجمركي الرسمي." };
    }
  }

  return { success: true };
}

// Test 2.1: Missing Receipt for Direct Payment — MUST BE REJECTED
const resMissingReceipt = simulateServerValidation({
  userRole: "admin",
  stageKey: "stage_9_fees_payments",
  targetStageStatus: "in_progress",
  settlementStatusRaw: "customer_paid_direct",
  customerDirectPaymentRef: null,
});
assert(
  !resMissingReceipt.success && Boolean(resMissingReceipt.error?.includes("إيصال")),
  "Server Validation: missing receipt for customer_paid_direct is rejected",
  resMissingReceipt.error
);

// Test 2.2: Valid Receipt for Direct Payment — ACCEPTED
const resValidReceipt = simulateServerValidation({
  userRole: "admin",
  stageKey: "stage_9_fees_payments",
  targetStageStatus: "in_progress",
  settlementStatusRaw: "customer_paid_direct",
  customerDirectPaymentRef: "CUST-BANK-REC-10101",
});
assert(
  resValidReceipt.success,
  "Server Validation: valid receipt for customer_paid_direct is accepted"
);

// Test 2.3: Unauthorized Direct Payment Attempt (e.g. data_entry or client role) — REJECTED
const resUnauthorizedRole = simulateServerValidation({
  userRole: "data_entry", // Stage 9 expected role is 'admin'
  stageKey: "stage_9_fees_payments",
  targetStageStatus: "completed",
  settlementStatusRaw: "customer_paid_direct",
  customerDirectPaymentRef: "REC-12345",
});
assert(
  !resUnauthorizedRole.success && Boolean(resUnauthorizedRole.error?.includes("غير مصرح لدورك")),
  "Server Validation: unauthorized role (data_entry) cannot complete Stage 9 fees",
  resUnauthorizedRole.error
);

// Test 2.4: Successful Verified Direct Payment completes Stage 9 — ACCEPTED
const resCompleteStage9Direct = simulateServerValidation({
  userRole: "admin",
  stageKey: "stage_9_fees_payments",
  targetStageStatus: "completed",
  settlementStatusRaw: "customer_paid_direct",
  customerDirectPaymentRef: "EGYPT-CUSTOMS-RCP-5544",
});
assert(
  resCompleteStage9Direct.success,
  "Server Validation: verified direct payment successfully completes Stage 9"
);

// Test 2.5: Additional Expense Authorized WITHOUT Reason — REJECTED
const resMissingReason = simulateServerValidation({
  userRole: "admin",
  stageKey: "stage_9_fees_payments",
  targetStageStatus: "in_progress",
  settlementStatusRaw: "paid_by_out_awaiting_customer",
  amountPaidByOut: 30000,
  assessedCustomsAmount: 22000,
  additionalAuthorized: true,
  additionalReason: null, // missing reason
});
assert(
  !resMissingReason.success && Boolean(resMissingReason.error?.includes("سبب المصروف الإضافي")),
  "Server Validation: additional expense authorized without reason is rejected",
  resMissingReason.error
);

// Test 2.6: Additional Expense Authorized WITH Reason — ACCEPTED
const resValidReason = simulateServerValidation({
  userRole: "admin",
  stageKey: "stage_9_fees_payments",
  targetStageStatus: "in_progress",
  settlementStatusRaw: "paid_by_out_awaiting_customer",
  amountPaidByOut: 30000,
  assessedCustomsAmount: 22000,
  additionalAuthorized: true,
  additionalReason: "رسوم تخزين وأرضيات بميناء الإسكندرية بموجب أمر توريد رقم 771",
});
assert(
  resValidReason.success,
  "Server Validation: additional expense with documented reason is accepted"
);

// Test 2.7: Rejection of 'settled' when a positive balance remains — REJECTED
const resSettledWithDebt = simulateServerValidation({
  userRole: "admin",
  stageKey: "stage_9_fees_payments",
  targetStageStatus: "completed",
  settlementStatusRaw: "settled",
  assessedCustomsAmount: 20000,
  amountPaidByOut: 20000,
  amountCollectedFromCustomer: 15000, // 5,000 remains unpaid!
});
assert(
  !resSettledWithDebt.success && Boolean(resSettledWithDebt.error?.includes("تمت التسوية")),
  "Server Validation: 'settled' status rejected when positive balance remains",
  resSettledWithDebt.error
);

// Test 2.8: Acceptance of 'settled' when balance is zero — ACCEPTED
const resSettledZeroDebt = simulateServerValidation({
  userRole: "admin",
  stageKey: "stage_9_fees_payments",
  targetStageStatus: "completed",
  settlementStatusRaw: "settled",
  assessedCustomsAmount: 20000,
  amountPaidByOut: 20000,
  amountCollectedFromCustomer: 20000,
});
assert(
  resSettledZeroDebt.success,
  "Server Validation: 'settled' status accepted when balance is 0"
);

// ================================================================================
// PART 3: STAGE 10 ELIGIBILITY AFTER STAGE 9 COMPLETION
// ================================================================================
console.log("\n--- PART 3: STAGE 10 TRANSITION & PREREQUISITES ---");

// Test 3.1: Stage 10 completion BLOCKED if Stage 9 is pending / incomplete
const precedingStagesWithStage9Pending: Record<string, string> = {
  stage_4_type_procedures: "completed",
  stage_5_scouting: "completed",
  stage_6_inspection: "completed",
  stage_7_data_entry: "completed",
  stage_8_valuation: "completed",
  stage_9_fees_payments: "in_progress", // NOT COMPLETED
};
const resStage10Blocked = simulateServerValidation({
  userRole: "admin",
  stageKey: "stage_10_clearance_release",
  targetStageStatus: "completed",
  precedingStagesStatus: precedingStagesWithStage9Pending,
  releasePermitNumber: "PERMIT-9999",
});
assert(
  !resStage10Blocked.success && Boolean(resStage10Blocked.error?.includes("قبل اكتمال")),
  "Stage 10 Sequence Guard: cannot complete Stage 10 while Stage 9 is in_progress",
  resStage10Blocked.error
);

// Test 3.2: Stage 10 completion ALLOWED when Stage 9 completed via verified direct payment
const precedingStagesWithStage9CompletedDirect: Record<string, string> = {
  stage_4_type_procedures: "completed",
  stage_5_scouting: "completed",
  stage_6_inspection: "completed",
  stage_7_data_entry: "completed",
  stage_8_valuation: "completed",
  stage_9_fees_payments: "completed", // COMPLETED via customer_paid_direct
};
const resStage10Allowed = simulateServerValidation({
  userRole: "admin",
  stageKey: "stage_10_clearance_release",
  targetStageStatus: "completed",
  precedingStagesStatus: precedingStagesWithStage9CompletedDirect,
  releasePermitNumber: "PERMIT-9999",
});
assert(
  resStage10Allowed.success,
  "Stage 10 Sequence Guard: Stage 10 proceeds smoothly once Stage 9 completed via verified direct payment"
);

// Test 3.3: Stage 10 requires release permit number even after Stage 9 is complete
const resStage10MissingPermit = simulateServerValidation({
  userRole: "admin",
  stageKey: "stage_10_clearance_release",
  targetStageStatus: "completed",
  precedingStagesStatus: precedingStagesWithStage9CompletedDirect,
  releasePermitNumber: null, // missing permit number
});
assert(
  !resStage10MissingPermit.success && Boolean(resStage10MissingPermit.error?.includes("إذن الإفراج")),
  "Stage 10 Release Requirement: release permit number remains mandatory for final clearance",
  resStage10MissingPermit.error
);

// ================================================================================
// SUMMARY
// ================================================================================
console.log("\n==================================================================");
console.log(`  PACKAGE 4.1 TEST RESULTS: ${passed} / ${total} PASSED (${Math.round((passed / total) * 100)}%)`);
console.log("==================================================================\n");

if (passed !== total) {
  process.exit(1);
}
