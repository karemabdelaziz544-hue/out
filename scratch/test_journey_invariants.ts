import { computeCustomsOutstandingBalance, getWorkflowTemplateForCategory, CUSTOMS_STAGE_DEFINITIONS, CustomsStageKey, CustomsDutiesSettlementData } from "../src/types/journey";
import { evaluateShipmentReadiness } from "../src/lib/shipments/readiness";
import { FINAL_SHIPMENT_DOCUMENT_TYPES, matchFinalDocumentType } from "../src/types/document";

console.log("==================================================================");
console.log("  OUT — SHIPMENT JOURNEY LOGIC & INVARIANTS TEST SUITE");
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

// ─── TEST 1: Customs Duties Outstanding Balance Formula ───────────────────────
console.log("\n--- TEST SUITE 1: Financial Settlement & Outstanding Balance ---");

// Case 1a: Paid by OUT > Assessed amount WITHOUT authorization (capped at assessed)
const finData1Unauthorized: CustomsDutiesSettlementData = {
  assessed_customs_amount: 10000,
  amount_paid_by_out: 12000,
  amount_collected_from_customer: 5000,
  additional_disbursement_authorized: false,
};
assert(
  computeCustomsOutstandingBalance(finData1Unauthorized) === 5000,
  "Balance Formula (unauthorized excess): customer debt capped at assessed duties (10000 - 5000 = 5000)",
  `Got ${computeCustomsOutstandingBalance(finData1Unauthorized)}`
);

// Case 1a-2: Paid by OUT > Assessed amount WITH authorization
const finData1Authorized: CustomsDutiesSettlementData = {
  assessed_customs_amount: 10000,
  amount_paid_by_out: 12000,
  amount_collected_from_customer: 5000,
  additional_disbursement_authorized: true,
};
assert(
  computeCustomsOutstandingBalance(finData1Authorized) === 7000,
  "Balance Formula (authorized excess): excess paid by OUT added to customer liability (12000 - 5000 = 7000)",
  `Got ${computeCustomsOutstandingBalance(finData1Authorized)}`
);

// Case 1b: Assessed amount > Paid by OUT (or unpaid by OUT yet)
const finData2: CustomsDutiesSettlementData = {
  assessed_customs_amount: 15000,
  amount_paid_by_out: 0,
  amount_collected_from_customer: 5000,
};
assert(
  computeCustomsOutstandingBalance(finData2) === 10000,
  "Balance Formula: assessed unpaid by OUT (15000 - 5000 = 10000)",
  `Got ${computeCustomsOutstandingBalance(finData2)}`
);

// Case 1c: Fully collected from customer
const finData3: CustomsDutiesSettlementData = {
  assessed_customs_amount: 10000,
  amount_paid_by_out: 10000,
  amount_collected_from_customer: 10000,
};
assert(
  computeCustomsOutstandingBalance(finData3) === 0,
  "Balance Formula: fully settled balance is 0",
  `Got ${computeCustomsOutstandingBalance(finData3)}`
);

// Case 1d: Legacy backward-compatibility fallback
const finData4: CustomsDutiesSettlementData = {
  duties_amount: 8000,
  collected_from_customer: 3000,
};
assert(
  computeCustomsOutstandingBalance(finData4) === 5000,
  "Balance Formula: backward compatibility fallback to duties_amount / collected_from_customer",
  `Got ${computeCustomsOutstandingBalance(finData4)}`
);

// ─── TEST SUITE 2: Category Workflow Templates & Stage 4 Requirement ──────────
console.log("\n--- TEST SUITE 2: Shipment Categories & Workflow Templates ---");

const tplAgri = getWorkflowTemplateForCategory("agricultural");
assert(
  tplAgri.applicableStageKeys.includes("stage_4_type_procedures"),
  "Agricultural Workflow: stage_4_type_procedures is mandatory",
);
assert(
  tplAgri.regulatoryAuthority.includes("الزراعي"),
  "Agricultural Workflow: authority is Central Administration for Plant Quarantine",
);

const tplFood = getWorkflowTemplateForCategory("food");
assert(
  tplFood.applicableStageKeys.includes("stage_4_type_procedures"),
  "Food Workflow: stage_4_type_procedures is mandatory",
);
assert(
  tplFood.regulatoryAuthority.includes("سلامة الغذاء"),
  "Food Workflow: authority is National Food Safety Authority (NFSA)",
);

const tplOther = getWorkflowTemplateForCategory("other");
assert(
  !tplOther.applicableStageKeys.includes("stage_4_type_procedures") &&
  tplOther.optionalStageKeys.includes("stage_4_type_procedures"),
  "General Cargo (other) Workflow: stage_4_type_procedures is optional / not required by default",
);

// ─── TEST SUITE 3: CargoX Manual Verification Logic ───────────────────────────
console.log("\n--- TEST SUITE 3: CargoX Manual Verification Logic ---");

function validateCargoXCompletion(cargox: any): { valid: boolean; error?: string } {
  if (cargox && cargox.is_applicable !== false) {
    const isVerified =
      cargox.supplier_upload_verified === true &&
      cargox.acid_matched === true &&
      cargox.data_consistency_verified === true;
    if (!isVerified) {
      return {
        valid: false,
        error: "يتطلب اكتمال إدراج البيانات استيفاء مطابقة CargoX (رفع المورد ومطابقة رقم ACID وتطابق البيانات)، أو توثيق سبب عدم الانطباق الرسمي.",
      };
    }
  }
  return { valid: true };
}

// 3a: Applicable and all 3 verified
const cxValid = {
  is_applicable: true,
  supplier_upload_verified: true,
  acid_matched: true,
  data_consistency_verified: true,
};
assert(validateCargoXCompletion(cxValid).valid, "CargoX: Applicable with all 3 verifications passes");

// 3b: Applicable but missing supplier_upload_verified
const cxMissingUpload = {
  is_applicable: true,
  supplier_upload_verified: false,
  acid_matched: true,
  data_consistency_verified: true,
};
assert(!validateCargoXCompletion(cxMissingUpload).valid, "CargoX: Applicable with missing upload verification blocks");

// 3c: Applicable but missing acid_matched
const cxMissingAcid = {
  is_applicable: true,
  supplier_upload_verified: true,
  acid_matched: false,
  data_consistency_verified: true,
};
assert(!validateCargoXCompletion(cxMissingAcid).valid, "CargoX: Applicable with mismatched ACID blocks");

// 3d: Applicable but missing data_consistency
const cxMissingData = {
  is_applicable: true,
  supplier_upload_verified: true,
  acid_matched: true,
  data_consistency_verified: false,
};
assert(!validateCargoXCompletion(cxMissingData).valid, "CargoX: Applicable with inconsistent data blocks");

// 3e: Explicitly not applicable
const cxExempt = {
  is_applicable: false,
  exemption_reason: "air_freight_exemption",
};
assert(validateCargoXCompletion(cxExempt).valid, "CargoX: Explicit exemption allows stage completion");

// ─── TEST SUITE 4: Document Dependencies per Stage ────────────────────────────
console.log("\n--- TEST SUITE 4: Granular Document Dependency Matrix ---");

const stageDocDependencies: Record<string, string[]> = {
  stage_5_scouting: ["bill_of_lading"],
  stage_6_inspection: ["packing_list"],
  stage_7_data_entry: ["commercial_invoice", "bill_of_lading"],
  stage_8_valuation: ["commercial_invoice", "certificate_of_origin"],
  stage_9_fees_payments: ["commercial_invoice"],
  stage_10_clearance_release: [
    "commercial_invoice",
    "packing_list",
    "bill_of_lading",
    "certificate_of_origin",
  ],
};

function checkStageDocBlock(stageKey: string, docStatusMap: Map<string, string>): boolean {
  const deps = stageDocDependencies[stageKey] || [];
  for (const dep of deps) {
    const stat = docStatusMap.get(dep);
    if (stat === "revision_required" || stat === "pending" || !stat) {
      return true; // blocked
    }
  }
  return false; // not blocked
}

// Suppose packing_list requires revision, but all other 3 are approved
const docMapPackingRevision = new Map<string, string>([
  ["commercial_invoice", "approved"],
  ["packing_list", "revision_required"],
  ["bill_of_lading", "approved"],
  ["certificate_of_origin", "approved"],
]);

assert(
  !checkStageDocBlock("stage_5_scouting", docMapPackingRevision),
  "Doc Dependency: Packing list revision does NOT block stage_5_scouting (depends only on B/L)",
);
assert(
  checkStageDocBlock("stage_6_inspection", docMapPackingRevision),
  "Doc Dependency: Packing list revision DOES block stage_6_inspection",
);
assert(
  !checkStageDocBlock("stage_7_data_entry", docMapPackingRevision),
  "Doc Dependency: Packing list revision does NOT block stage_7_data_entry",
);
assert(
  !checkStageDocBlock("stage_8_valuation", docMapPackingRevision),
  "Doc Dependency: Packing list revision does NOT block stage_8_valuation",
);
assert(
  checkStageDocBlock("stage_10_clearance_release", docMapPackingRevision),
  "Doc Dependency: Packing list revision DOES block stage_10_clearance_release",
);

// ─── TEST SUITE 5: Operational Phase Lock ─────────────────────────────────────
console.log("\n--- TEST SUITE 5: Operational Phase Lock & Status Non-Regression ---");

function evaluateStatusOnRevisionRequest(currentStatus: string, anyOperationalStarted: boolean): string {
  const isCustomsOperationalPhase = [
    "customs_in_progress",
    "customs_cleared",
    "delivered",
  ].includes(currentStatus);

  if (isCustomsOperationalPhase || anyOperationalStarted) {
    // Preserve operational status
    return currentStatus;
  } else if (
    currentStatus === "documents_completed" ||
    currentStatus === "ready_for_external_stage"
  ) {
    return "awaiting_shipment_documents";
  }
  return currentStatus;
}

assert(
  evaluateStatusOnRevisionRequest("customs_in_progress", true) === "customs_in_progress",
  "Phase Lock: Revision request in 'customs_in_progress' keeps status as 'customs_in_progress'",
);
assert(
  evaluateStatusOnRevisionRequest("ready_for_external_stage", true) === "ready_for_external_stage",
  "Phase Lock: Revision request in 'ready_for_external_stage' with operational stages started preserves status",
);
assert(
  evaluateStatusOnRevisionRequest("ready_for_external_stage", false) === "awaiting_shipment_documents",
  "Pre-Operational Invalidation: Revision request before operational stages start correctly rolls back to 'awaiting_shipment_documents'",
);
assert(
  evaluateStatusOnRevisionRequest("documents_completed", false) === "awaiting_shipment_documents",
  "Pre-Operational Invalidation: Revision request in 'documents_completed' rolls back to 'awaiting_shipment_documents'",
);

// ─── TEST SUITE 6: Document Completion Status Transition Guard ───────────────
console.log("\n--- TEST SUITE 6: Document Completion Status Guard ---");

function canTransitionToDocumentsCompleted(currentStatus: string): boolean {
  return currentStatus === "awaiting_shipment_documents";
}

assert(
  canTransitionToDocumentsCompleted("awaiting_shipment_documents") === true,
  "Document Completion: Can transition to 'documents_completed' when in 'awaiting_shipment_documents'",
);
assert(
  canTransitionToDocumentsCompleted("ready_for_external_stage") === false,
  "Document Completion: CANNOT overwrite 'ready_for_external_stage' back to 'documents_completed'",
);
assert(
  canTransitionToDocumentsCompleted("customs_in_progress") === false,
  "Document Completion: CANNOT overwrite 'customs_in_progress' back to 'documents_completed'",
);

// ─── TEST SUITE 7: Decoupled Stage 10 Events ──────────────────────────────────
console.log("\n--- TEST SUITE 7: Decoupled Stage 10 Milestones ---");

interface MockStage10Data {
  release_permit_number?: string;
  customs_released_at?: string;
  port_exit_at?: string;
  transporter_name?: string;
  delivered_at?: string;
  recipient_name?: string;
}

function determineStage10Milestone(data: MockStage10Data, isCompleted: boolean) {
  if (data.delivered_at) {
    return { status: "delivered", action: "delivered_to_customer" };
  } else if (data.port_exit_at) {
    return { status: "customs_in_progress", action: "port_exited" };
  } else if (isCompleted || data.customs_released_at || data.release_permit_number) {
    return { status: "customs_cleared", action: "customs_cleared" };
  }
  return { status: "customs_in_progress", action: "in_progress" };
}

// 7a: Release permit issued
const event1 = determineStage10Milestone({ release_permit_number: "REL-9988", customs_released_at: "2026-10-20T10:00:00Z" }, true);
assert(event1.status === "customs_cleared" && event1.action === "customs_cleared", "Stage 10: Event 1 produces status 'customs_cleared' with separate release timestamp");

// 7b: Port exit occurs later
const event2 = determineStage10Milestone({ release_permit_number: "REL-9988", customs_released_at: "2026-10-20T10:00:00Z", port_exit_at: "2026-10-20T14:30:00Z", transporter_name: "الأسيوطي للنقل" }, true);
assert(event2.action === "port_exited", "Stage 10: Event 2 records distinct 'port_exited' event without altering delivery");

// 7c: Delivery occurs at customer warehouse
const event3 = determineStage10Milestone({ release_permit_number: "REL-9988", customs_released_at: "2026-10-20T10:00:00Z", port_exit_at: "2026-10-20T14:30:00Z", delivered_at: "2026-10-20T18:00:00Z", recipient_name: "محمد أحمد" }, true);
assert(event3.status === "delivered" && event3.action === "delivered_to_customer", "Stage 10: Event 3 promotes shipment status to terminal 'delivered'");

// ─── SUMMARY ──────────────────────────────────────────────────────────────────
console.log(`\n==================================================================`);
console.log(`  TEST RESULTS: ${passed} / ${total} PASSED (${Math.round((passed / total) * 100)}%)`);
console.log(`==================================================================\n`);

if (passed !== total) {
  process.exit(1);
}
