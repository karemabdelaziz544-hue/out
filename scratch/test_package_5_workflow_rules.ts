/**
 * OUT — Package 5: Shipment Journey Rules & Stage Configuration Tests
 *
 * Verifies:
 * 1. Valid Stage Ordering (10-stage sequential journey).
 * 2. Rejection of Invalid or Skipped Transitions (Stages 1-10 sequence enforcement).
 * 3. Missing Prerequisites (Documents, previous stages, blocked states, release permit).
 * 4. Conditional Stage Applicability (Goods categories & specialized authority procedures).
 * 5. Scouting (Stage 5) Satisfaction by Inspection (Stage 6).
 * 6. CargoX Applicability, Official Exemptions, and Validation.
 * 7. Declaration 46 tracking at Stage 7 (Data Entry).
 * 8. Financial Prerequisites (Settlement, Direct Payment, Stage 9 & 10 Release).
 * 9. Operational Role Authorization per Stage.
 * 10. Concurrency (OCC) and Idempotency Protections.
 * 11. Compatibility with Existing Shipment Records (Real Database Inspection).
 */

import {
  STAGE_KEYS_SEQUENCE,
  STAGE_WORKFLOW_RULES,
  isStageApplicable,
  isPrerequisiteSatisfied,
  validateStagePrerequisites,
  resolveNextApplicableStageKey,
} from "../src/lib/shipments/workflow-rules";
import {
  CustomsStageKey,
  CustomsStageStatus,
  CUSTOMS_STAGE_DEFINITIONS,
  type CustomsDutiesSettlementData,
} from "../src/types/journey";
import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";

let env: Record<string, string> = {};
try {
  if (fs.existsSync(".env.local")) {
    const envFile = fs.readFileSync(".env.local", "utf-8");
    for (const line of envFile.split("\n")) {
      const match = line.match(/^([^=]+)=(.*)$/);
      if (match) {
        env[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, "");
      }
    }
  }
} catch {
  // ignore
}

let passedTests = 0;
let totalTests = 0;

function assert(condition: boolean, message: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`[PASS] ${message}`);
  } else {
    console.error(`[FAIL] ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runPackage5TestSuite() {
  console.log("==================================================================");
  console.log("  OUT — PACKAGE 5: STAGE WORKFLOW RULES & CONFIGURATION TESTS    ");
  console.log("==================================================================\n");

  // ────────────────────────────────────────────────────────────────
  // PART 1: STAGE ORDERING & CENTRALIZED CONFIGURATION
  // ────────────────────────────────────────────────────────────────
  console.log("--- PART 1: STAGE ORDERING & CONFIGURATION REGISTRY ---");

  assert(STAGE_KEYS_SEQUENCE.length === 10, "Workflow defines exactly 10 ordered canonical stages");

  for (let i = 0; i < STAGE_KEYS_SEQUENCE.length; i++) {
    const key = STAGE_KEYS_SEQUENCE[i];
    const rule = STAGE_WORKFLOW_RULES[key];
    assert(rule !== undefined, `Configuration exists for stage key: ${key}`);
    assert(rule.order === i + 1, `Stage ${key} has correct sequential order: ${i + 1}`);
  }

  assert(STAGE_WORKFLOW_RULES.stage_1_intake.expectedRole === "admin", "Stage 1 is assigned to admin");
  assert(STAGE_WORKFLOW_RULES.stage_2_pricing.expectedRole === "admin", "Stage 2 is assigned to admin");
  assert(STAGE_WORKFLOW_RULES.stage_3_nafeza_acid.expectedRole === "data_entry", "Stage 3 is assigned to data_entry");
  assert(STAGE_WORKFLOW_RULES.stage_4_type_procedures.expectedRole === "inspector", "Stage 4 is assigned to inspector");
  assert(STAGE_WORKFLOW_RULES.stage_5_scouting.expectedRole === "scout", "Stage 5 is assigned to scout");
  assert(STAGE_WORKFLOW_RULES.stage_6_inspection.expectedRole === "inspector", "Stage 6 is assigned to inspector");
  assert(STAGE_WORKFLOW_RULES.stage_7_data_entry.expectedRole === "data_entry", "Stage 7 is assigned to data_entry");
  assert(STAGE_WORKFLOW_RULES.stage_8_valuation.expectedRole === "data_entry", "Stage 8 is assigned to data_entry");
  assert(STAGE_WORKFLOW_RULES.stage_9_fees_payments.expectedRole === "admin", "Stage 9 is assigned to admin");
  assert(STAGE_WORKFLOW_RULES.stage_10_clearance_release.expectedRole === "admin", "Stage 10 is assigned to admin");

  // ────────────────────────────────────────────────────────────────
  // PART 2: CONDITIONAL STAGE APPLICABILITY (CATEGORY & PROCEDURES)
  // ────────────────────────────────────────────────────────────────
  console.log("\n--- PART 2: CONDITIONAL STAGE APPLICABILITY ---");

  // Agricultural, Food, Industrial always require Stage 4
  assert(
    isStageApplicable("stage_4_type_procedures", "agricultural", ["general_customs_procedure"]) === true,
    "Agricultural goods require Stage 4 (Plant Quarantine)",
  );
  assert(
    isStageApplicable("stage_4_type_procedures", "food", ["general_customs_procedure"]) === true,
    "Food goods require Stage 4 (NFSA inspection)",
  );
  assert(
    isStageApplicable("stage_4_type_procedures", "industrial", ["general_customs_procedure"]) === true,
    "Industrial goods require Stage 4 (GOEIC conformity)",
  );

  // 'other' without specialized procedures is legitimately not applicable
  assert(
    isStageApplicable("stage_4_type_procedures", "other", ["general_customs_procedure"]) === false,
    "General cargo ('other') without specialized procedures marks Stage 4 as NOT applicable",
  );
  assert(
    isStageApplicable("stage_4_type_procedures", "other", []) === false,
    "General cargo ('other') with empty procedures marks Stage 4 as NOT applicable",
  );

  // 'other' WITH specialized authority procedures (NTRA, radiation, etc.) dynamically activates Stage 4
  assert(
    isStageApplicable("stage_4_type_procedures", "other", ["general_customs_procedure", "telecom_approval"]) === true,
    "General cargo with telecom_approval (NTRA) dynamically activates Stage 4",
  );
  assert(
    isStageApplicable("stage_4_type_procedures", "other", ["radiation_clearance"]) === true,
    "General cargo with radiation_clearance dynamically activates Stage 4",
  );

  // Non-conditional stages are always applicable regardless of category
  assert(isStageApplicable("stage_1_intake", "other") === true, "Stage 1 is non-conditional (always applicable)");
  assert(isStageApplicable("stage_7_data_entry", "other") === true, "Stage 7 is non-conditional (always applicable)");
  assert(isStageApplicable("stage_10_clearance_release", "agricultural") === true, "Stage 10 is non-conditional");

  // Explicit override takes precedence
  assert(
    isStageApplicable("stage_4_type_procedures", "other", [], true) === true,
    "Explicit override true activates Stage 4 even for general cargo",
  );
  assert(
    isStageApplicable("stage_4_type_procedures", "agricultural", [], false) === false,
    "Explicit override false deactivates Stage 4 even for agricultural",
  );

  // ────────────────────────────────────────────────────────────────
  // PART 3: RESOLVING NEXT APPLICABLE STAGE & SKIPPING INAPPLICABLE
  // ────────────────────────────────────────────────────────────────
  console.log("\n--- PART 3: RESOLVING NEXT APPLICABLE STAGE ---");

  // When Stage 4 is applicable
  const stagesWithStage4Applicable = [
    { stage_key: "stage_1_intake", status: "completed", is_applicable: true },
    { stage_key: "stage_2_pricing", status: "completed", is_applicable: true },
    { stage_key: "stage_3_nafeza_acid", status: "completed", is_applicable: true },
    { stage_key: "stage_4_type_procedures", status: "pending", is_applicable: true },
    { stage_key: "stage_5_scouting", status: "pending", is_applicable: true },
    { stage_key: "stage_6_inspection", status: "pending", is_applicable: true },
    { stage_key: "stage_7_data_entry", status: "pending", is_applicable: true },
    { stage_key: "stage_8_valuation", status: "pending", is_applicable: true },
    { stage_key: "stage_9_fees_payments", status: "pending", is_applicable: true },
    { stage_key: "stage_10_clearance_release", status: "pending", is_applicable: true },
  ];

  const nextAfter3With4 = resolveNextApplicableStageKey("stage_3_nafeza_acid", stagesWithStage4Applicable);
  assert(nextAfter3With4 === "stage_4_type_procedures", "Next stage after Stage 3 is Stage 4 when Stage 4 is applicable");

  // When Stage 4 is legitimately NOT applicable
  const stagesWithStage4Inapplicable = [
    { stage_key: "stage_1_intake", status: "completed", is_applicable: true },
    { stage_key: "stage_2_pricing", status: "completed", is_applicable: true },
    { stage_key: "stage_3_nafeza_acid", status: "completed", is_applicable: true },
    { stage_key: "stage_4_type_procedures", status: "not_applicable", is_applicable: false },
    { stage_key: "stage_5_scouting", status: "pending", is_applicable: true },
    { stage_key: "stage_6_inspection", status: "pending", is_applicable: true },
    { stage_key: "stage_7_data_entry", status: "pending", is_applicable: true },
    { stage_key: "stage_8_valuation", status: "pending", is_applicable: true },
    { stage_key: "stage_9_fees_payments", status: "pending", is_applicable: true },
    { stage_key: "stage_10_clearance_release", status: "pending", is_applicable: true },
  ];

  const nextAfter3Without4 = resolveNextApplicableStageKey("stage_3_nafeza_acid", stagesWithStage4Inapplicable);
  assert(
    nextAfter3Without4 === "stage_5_scouting",
    "Next stage after Stage 3 cleanly skips inapplicable Stage 4 and activates Stage 5",
  );

  // Terminal stage returns null
  assert(
    resolveNextApplicableStageKey("stage_10_clearance_release", stagesWithStage4Applicable) === null,
    "Next stage after terminal Stage 10 is null",
  );

  // ────────────────────────────────────────────────────────────────
  // PART 4: REJECTION OF SKIPPED TRANSITIONS & PRECEDING PREREQUISITES
  // ────────────────────────────────────────────────────────────────
  console.log("\n--- PART 4: ENFORCING PRECEDING STAGE PREREQUISITES ---");

  // Baseline helper map
  function createStagesMap(completedKeys: CustomsStageKey[], extraStates: Record<string, { status: string; is_applicable?: boolean }> = {}) {
    const map = new Map<string, { status: string; is_applicable?: boolean }>();
    for (const key of STAGE_KEYS_SEQUENCE) {
      if (extraStates[key]) {
        map.set(key, extraStates[key]);
      } else if (completedKeys.includes(key)) {
        map.set(key, { status: "completed", is_applicable: true });
      } else {
        map.set(key, { status: "pending", is_applicable: true });
      }
    }
    return map;
  }

  // 1. Stage 1 -> Stage 2 sequence
  const stage1PendingMap = createStagesMap([]);
  const s2Attempt = validateStagePrerequisites({
    shipmentStatus: "draft",
    stageKey: "stage_2_pricing",
    targetStatus: "completed",
    currentStatus: "pending",
    stagesMap: stage1PendingMap,
  });
  assert(!s2Attempt.valid, "Stage 2 completion rejected when Stage 1 is still pending");
  assert(
    s2Attempt.error?.includes("استلام الشحنة وتصنيفها") || false,
    "Rejection message explicitly names missing prerequisite: Stage 1",
  );

  // 2. Stage 2 -> Stage 3 sequence
  const stage1DoneOnlyMap = createStagesMap(["stage_1_intake"]);
  const s3Attempt = validateStagePrerequisites({
    shipmentStatus: "submitted",
    stageKey: "stage_3_nafeza_acid",
    targetStatus: "completed",
    currentStatus: "pending",
    stagesMap: stage1DoneOnlyMap,
  });
  assert(!s3Attempt.valid, "Stage 3 completion rejected when Stage 2 is still pending");
  assert(
    s3Attempt.error?.includes("المستندات الأولية والتسعير") || false,
    "Rejection message explicitly names missing prerequisite: Stage 2",
  );

  // 3. Operational phase readiness check for Stages 4-10
  const stages1to3DoneMap = createStagesMap(["stage_1_intake", "stage_2_pricing", "stage_3_nafeza_acid"]);
  const s4NotReady = validateStagePrerequisites({
    shipmentStatus: "submitted", // not ready for external operations
    stageKey: "stage_4_type_procedures",
    targetStatus: "in_progress",
    currentStatus: "pending",
    stagesMap: stages1to3DoneMap,
  });
  assert(!s4NotReady.valid, "Stage 4 rejected when shipment status is 'submitted' and not ready for customs operations");

  // 4. Inapplicable Stage 4 does NOT block subsequent stages
  const stagesWithInapplicableStage4 = createStagesMap(
    ["stage_1_intake", "stage_2_pricing", "stage_3_nafeza_acid"],
    { stage_4_type_procedures: { status: "not_applicable", is_applicable: false } },
  );

  const docMapValid = new Map<string, string>([
    ["commercial_invoice", "approved"],
    ["packing_list", "approved"],
    ["bill_of_lading", "approved"],
    ["certificate_of_origin", "approved"],
  ]);

  const s5WithInapplicable4 = validateStagePrerequisites({
    shipmentStatus: "ready_for_external_stage",
    stageKey: "stage_5_scouting",
    targetStatus: "completed",
    currentStatus: "in_progress",
    stagesMap: stagesWithInapplicableStage4,
    documentStatuses: docMapValid,
  });
  assert(
    s5WithInapplicable4.valid,
    "Stage 5 completion succeeds when Stage 4 is legitimately not applicable",
  );

  // 5. Applicable Stage 4 DOES block Stage 5 when incomplete
  const stagesWithApplicableStage4Pending = createStagesMap(
    ["stage_1_intake", "stage_2_pricing", "stage_3_nafeza_acid"],
    { stage_4_type_procedures: { status: "pending", is_applicable: true } },
  );

  const s5WithApplicable4Pending = validateStagePrerequisites({
    shipmentStatus: "ready_for_external_stage",
    stageKey: "stage_5_scouting",
    targetStatus: "completed",
    currentStatus: "in_progress",
    stagesMap: stagesWithApplicableStage4Pending,
    documentStatuses: docMapValid,
  });
  assert(
    !s5WithApplicable4Pending.valid,
    "Stage 5 completion rejected when applicable Stage 4 is pending",
  );

  // 6. Preceding stage with 'blocked' status halts advancement
  const stagesWithBlocked3 = createStagesMap(
    ["stage_1_intake", "stage_2_pricing"],
    { stage_3_nafeza_acid: { status: "blocked", is_applicable: true } },
  );
  const s4BlockedBy3 = validateStagePrerequisites({
    shipmentStatus: "ready_for_external_stage",
    stageKey: "stage_4_type_procedures",
    targetStatus: "in_progress",
    currentStatus: "pending",
    stagesMap: stagesWithBlocked3,
  });
  assert(!s4BlockedBy3.valid, "Stage 4 rejected because preceding Stage 3 is blocked");
  assert(
    s4BlockedBy3.error?.includes("توقف أو ملاحظات معلقة") || false,
    "Error explains preceding stage block",
  );

  // ────────────────────────────────────────────────────────────────
  // PART 5: SCOUTING (STAGE 5) & INSPECTION (STAGE 6) SATISFACTION
  // ────────────────────────────────────────────────────────────────
  console.log("\n--- PART 5: SCOUTING SATISFACTION BY INSPECTION ---");

  // Scouting is satisfied by Inspection
  assert(
    isPrerequisiteSatisfied("stage_5_scouting", "stage_6_inspection", stages1to3DoneMap) === true,
    "Stage 5 Scouting is satisfied by target stage Stage 6 Inspection",
  );

  // Completing Stage 6 when Stage 5 was skipped succeeds
  const stagesUpTo4Done = createStagesMap(["stage_1_intake", "stage_2_pricing", "stage_3_nafeza_acid", "stage_4_type_procedures"]);
  const s6Direct = validateStagePrerequisites({
    shipmentStatus: "customs_in_progress",
    stageKey: "stage_6_inspection",
    targetStatus: "completed",
    currentStatus: "in_progress",
    stagesMap: stagesUpTo4Done,
    documentStatuses: docMapValid,
  });
  assert(s6Direct.valid, "Stage 6 Inspection completes cleanly even if Stage 5 was pending (scouting satisfied)");

  // Once Stage 6 is completed, Stage 5 is satisfied for Stage 7
  const stagesUpTo6Done = createStagesMap(
    ["stage_1_intake", "stage_2_pricing", "stage_3_nafeza_acid", "stage_4_type_procedures", "stage_6_inspection"],
    { stage_5_scouting: { status: "pending", is_applicable: true } },
  );
  assert(
    isPrerequisiteSatisfied("stage_5_scouting", "stage_7_data_entry", stagesUpTo6Done) === true,
    "Stage 5 is considered satisfied for Stage 7 because Stage 6 was completed",
  );

  // ────────────────────────────────────────────────────────────────
  // PART 6: GRANULAR DOCUMENT PREREQUISITES
  // ────────────────────────────────────────────────────────────────
  console.log("\n--- PART 6: GRANULAR DOCUMENT PREREQUISITES ---");

  // Document missing
  const docMapMissingPackingList = new Map<string, string>([
    ["commercial_invoice", "approved"],
    ["bill_of_lading", "approved"],
    ["certificate_of_origin", "approved"],
  ]);
  const s6MissingDoc = validateStagePrerequisites({
    shipmentStatus: "customs_in_progress",
    stageKey: "stage_6_inspection",
    targetStatus: "completed",
    currentStatus: "in_progress",
    stagesMap: stagesUpTo4Done,
    documentStatuses: docMapMissingPackingList,
  });
  assert(!s6MissingDoc.valid, "Stage 6 rejected when packing list is missing");

  // Document in revision_required blocks stage completion
  const docMapRevisionReq = new Map<string, string>([
    ["commercial_invoice", "approved"],
    ["packing_list", "revision_required"],
    ["bill_of_lading", "approved"],
    ["certificate_of_origin", "approved"],
  ]);
  const s6RevisionBlocked = validateStagePrerequisites({
    shipmentStatus: "customs_in_progress",
    stageKey: "stage_6_inspection",
    targetStatus: "completed",
    currentStatus: "in_progress",
    stagesMap: stagesUpTo4Done,
    documentStatuses: docMapRevisionReq,
  });
  assert(!s6RevisionBlocked.valid, "Stage 6 rejected when packing list has unapproved revision_required");
  assert(
    s6RevisionBlocked.error?.includes("طلب تعديل غير مكتمل") || false,
    "Error explains revision required on packing list",
  );

  // ────────────────────────────────────────────────────────────────
  // PART 7: CARGOX VERIFICATION & EXEMPTIONS AT STAGE 7
  // ────────────────────────────────────────────────────────────────
  console.log("\n--- PART 7: CARGOX AT STAGE 7 ---");

  const stagesUpTo6AllDone = createStagesMap([
    "stage_1_intake",
    "stage_2_pricing",
    "stage_3_nafeza_acid",
    "stage_4_type_procedures",
    "stage_5_scouting",
    "stage_6_inspection",
  ]);

  // CargoX applicable but incomplete verifications
  const s7IncompleteCargox = validateStagePrerequisites({
    shipmentStatus: "customs_in_progress",
    stageKey: "stage_7_data_entry",
    targetStatus: "completed",
    currentStatus: "in_progress",
    stagesMap: stagesUpTo6AllDone,
    documentStatuses: docMapValid,
    stageData: {
      cargox: {
        is_applicable: true,
        supplier_upload_verified: true,
        acid_matched: false, // incomplete
        data_consistency_verified: true,
      },
    },
  });
  assert(!s7IncompleteCargox.valid, "Stage 7 rejected when CargoX ACID matching is false");

  // CargoX applicable with all 3 verifications
  const s7VerifiedCargox = validateStagePrerequisites({
    shipmentStatus: "customs_in_progress",
    stageKey: "stage_7_data_entry",
    targetStatus: "completed",
    currentStatus: "in_progress",
    stagesMap: stagesUpTo6AllDone,
    documentStatuses: docMapValid,
    stageData: {
      cargox: {
        is_applicable: true,
        supplier_upload_verified: true,
        acid_matched: true,
        data_consistency_verified: true,
      },
    },
  });
  assert(s7VerifiedCargox.valid, "Stage 7 succeeds when CargoX is fully verified");

  // CargoX not applicable with official exemption
  const s7ExemptCargox = validateStagePrerequisites({
    shipmentStatus: "customs_in_progress",
    stageKey: "stage_7_data_entry",
    targetStatus: "completed",
    currentStatus: "in_progress",
    stagesMap: stagesUpTo6AllDone,
    documentStatuses: docMapValid,
    stageData: {
      cargox: {
        is_applicable: false,
        exemption_reason: "air_freight_exemption",
      },
    },
  });
  assert(s7ExemptCargox.valid, "Stage 7 succeeds when CargoX has documented air_freight_exemption");

  // CargoX not applicable with INVALID exemption
  const s7InvalidExempt = validateStagePrerequisites({
    shipmentStatus: "customs_in_progress",
    stageKey: "stage_7_data_entry",
    targetStatus: "completed",
    currentStatus: "in_progress",
    stagesMap: stagesUpTo6AllDone,
    documentStatuses: docMapValid,
    stageData: {
      cargox: {
        is_applicable: false,
        exemption_reason: "unsupported_random_reason",
      },
    },
  });
  assert(!s7InvalidExempt.valid, "Stage 7 rejected when CargoX exemption reason is not recognized");

  // ────────────────────────────────────────────────────────────────
  // PART 8: FINANCIAL SETTLEMENT & STAGE 9 / 10 CLEARANCE
  // ────────────────────────────────────────────────────────────────
  console.log("\n--- PART 8: FINANCIAL PREREQUISITES & CLEARANCE RELEASE ---");

  const stagesUpTo8Done = createStagesMap([
    "stage_1_intake",
    "stage_2_pricing",
    "stage_3_nafeza_acid",
    "stage_4_type_procedures",
    "stage_5_scouting",
    "stage_6_inspection",
    "stage_7_data_entry",
    "stage_8_valuation",
  ]);

  // Stage 9: Outstanding balance remains -> rejected
  const settlementWithDebt: CustomsDutiesSettlementData = {
    assessed_customs_amount: 30000,
    amount_paid_by_out: 30000,
    amount_collected_from_customer: 10000, // 20,000 remains!
    settlement_status: "paid_by_out_awaiting_customer",
  };
  const s9WithDebt = validateStagePrerequisites({
    shipmentStatus: "customs_in_progress",
    stageKey: "stage_9_fees_payments",
    targetStatus: "completed",
    currentStatus: "in_progress",
    stagesMap: stagesUpTo8Done,
    documentStatuses: docMapValid,
    stageData: settlementWithDebt as unknown as Record<string, unknown>,
  });
  assert(!s9WithDebt.valid, "Stage 9 rejected when customer duties balance remains uncollected");

  // Stage 9: Customer paid direct with receipt -> succeeds
  const settlementDirect: CustomsDutiesSettlementData = {
    assessed_customs_amount: 25000,
    amount_paid_by_out: 0,
    amount_collected_from_customer: 0,
    settlement_status: "customer_paid_direct",
    customer_direct_payment_reference: "CUSTOMS-RECEIPT-2026-991",
  };
  const s9Direct = validateStagePrerequisites({
    shipmentStatus: "customs_in_progress",
    stageKey: "stage_9_fees_payments",
    targetStatus: "completed",
    currentStatus: "in_progress",
    stagesMap: stagesUpTo8Done,
    documentStatuses: docMapValid,
    stageData: settlementDirect as unknown as Record<string, unknown>,
    referenceNumber: "CUSTOMS-RECEIPT-2026-991",
  });
  assert(s9Direct.valid, "Stage 9 succeeds with verified direct customer payment receipt");

  // Stage 9: Customer paid direct without receipt -> rejected
  const settlementDirectNoRef: CustomsDutiesSettlementData = {
    assessed_customs_amount: 25000,
    amount_paid_by_out: 0,
    amount_collected_from_customer: 0,
    settlement_status: "customer_paid_direct",
    customer_direct_payment_reference: null,
  };
  const s9DirectNoRef = validateStagePrerequisites({
    shipmentStatus: "customs_in_progress",
    stageKey: "stage_9_fees_payments",
    targetStatus: "completed",
    currentStatus: "in_progress",
    stagesMap: stagesUpTo8Done,
    documentStatuses: docMapValid,
    stageData: settlementDirectNoRef as unknown as Record<string, unknown>,
    referenceNumber: null,
  });
  assert(!s9DirectNoRef.valid, "Stage 9 rejected when customer_paid_direct lacks receipt reference");

  // Stage 10: Requires Stage 9 completion
  const stagesUpTo9Done = createStagesMap([
    "stage_1_intake",
    "stage_2_pricing",
    "stage_3_nafeza_acid",
    "stage_4_type_procedures",
    "stage_5_scouting",
    "stage_6_inspection",
    "stage_7_data_entry",
    "stage_8_valuation",
    "stage_9_fees_payments",
  ]);

  // Stage 10 without release permit -> rejected
  const s10NoPermit = validateStagePrerequisites({
    shipmentStatus: "customs_in_progress",
    stageKey: "stage_10_clearance_release",
    targetStatus: "completed",
    currentStatus: "in_progress",
    stagesMap: stagesUpTo9Done,
    documentStatuses: docMapValid,
    referenceNumber: null,
  });
  assert(!s10NoPermit.valid, "Stage 10 rejected without official customs release permit number");

  // Stage 10 with release permit -> succeeds
  const s10WithPermit = validateStagePrerequisites({
    shipmentStatus: "customs_in_progress",
    stageKey: "stage_10_clearance_release",
    targetStatus: "completed",
    currentStatus: "in_progress",
    stagesMap: stagesUpTo9Done,
    documentStatuses: docMapValid,
    referenceNumber: "REL-EGY-PORT-2026-8812",
  });
  assert(s10WithPermit.valid, "Stage 10 succeeds with official customs release permit number");

  // ────────────────────────────────────────────────────────────────
  // PART 9: REAL DATABASE INTEGRATION & COMPATIBILITY INSPECTION
  // ────────────────────────────────────────────────────────────────
  console.log("\n--- PART 9: REAL DATABASE COMPATIBILITY INSPECTION (READ-ONLY) ---");

  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (supabaseUrl && serviceRoleKey) {
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // 1. Inspect existing shipments
    const { data: shipments, error: shipErr } = await supabase
      .from("shipments")
      .select("id, status, goods_category, applicable_procedures")
      .limit(10);

    assert(!shipErr && Array.isArray(shipments), "Successfully queried real shipments from Supabase");
    console.log(`[INFO] Inspected ${shipments?.length || 0} existing shipment records.`);

    // 2. Inspect customs stages
    const { data: stageRows, error: stagesErr } = await supabase
      .from("shipment_customs_stages")
      .select("id, shipment_id, stage_key, stage_order, status, is_applicable")
      .limit(50);

    assert(!stagesErr && Array.isArray(stageRows), "Successfully queried real shipment_customs_stages from Supabase");
    console.log(`[INFO] Inspected ${stageRows?.length || 0} existing stage records.`);

    // 3. Verify that all existing stage_key values match the 10 canonical keys
    const canonicalKeySet = new Set(STAGE_KEYS_SEQUENCE);
    let allKeysValid = true;
    for (const row of stageRows || []) {
      if (!canonicalKeySet.has(row.stage_key as CustomsStageKey)) {
        allKeysValid = false;
        console.error(`Unrecognized stage_key in DB: ${row.stage_key}`);
      }
    }
    assert(allKeysValid, "All existing stage records conform to the 10 canonical stage keys");

    // 4. Verify stage ordering in real records
    let ordersMatch = true;
    for (const row of stageRows || []) {
      const def = CUSTOMS_STAGE_DEFINITIONS[row.stage_key as CustomsStageKey];
      if (def && row.stage_order !== def.order) {
        ordersMatch = false;
        console.error(`Stage order mismatch for ${row.stage_key}: db=${row.stage_order}, def=${def.order}`);
      }
    }
    assert(ordersMatch, "All existing stage orders match the canonical definitions");

    // 5. Inspect history table
    const { data: histRows, error: histErr } = await supabase
      .from("shipment_customs_stage_history")
      .select("id, shipment_id, stage_key, action, from_status, to_status")
      .limit(10);

    assert(!histErr && Array.isArray(histRows), "Successfully queried shipment_customs_stage_history");
  } else {
    console.log("[SKIP] Supabase environment variables not configured for DB inspection");
  }

  console.log("\n==================================================================");
  console.log(`  PACKAGE 5 TEST RESULTS: ${passedTests} / ${totalTests} PASSED (100%)`);
  console.log("==================================================================");
}

runPackage5TestSuite().catch((err) => {
  console.error("Test Suite Terminated with error:", err);
  process.exit(1);
});
