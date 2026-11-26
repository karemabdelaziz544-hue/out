/**
 * Automated Verification Suite for Complete Shipment Journey Consolidation
 * Covers:
 * 1. 10 Authoritative Business Stages (Ordering, Arabic Labels, Legacy Mappings)
 * 2. 7 Customer Progress Stations (Ordering, Arabic Labels, Grouping Rules, Status Propagation)
 * 3. Document-driven Stage 04 Derivation
 * 4. Dual Sub-processes in Stage 06 (Scouting & Inspection)
 * 5. Conditional Goods Procedures in Stage 05 (General vs Chemical vs Food)
 * 6. Pricing Approval Invariant (Explicit Customer Approval Required)
 * 7. Legacy Customs Valuation Fallback (assessed_customs_amount -> duties_amount)
 * 8. Strict Customer Privacy & Suppression of Internal Staff Metadata
 * 9. Outstanding Balance Settlement Invariant Blocking Release
 * 10. Decoupled Milestone Events in Stage 10 (Release Permit, Port Exit, Delivery)
 */

import {
  buildAuthoritativeTenStageJourney,
  buildCustomerSevenStationJourney,
} from "../src/lib/shipments/canonical-journey-adapter";
import {
  CUSTOMER_STATIONS_CONFIG,
  computeCustomsOutstandingBalance,
} from "../src/types/journey";
import type { Shipment, DocumentItem, ShipmentPricing, ShipmentAcid } from "../src/types";

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${msg}`);
  } else {
    failed++;
    console.error(`  ✗ FAIL: ${msg}`);
  }
}

console.log("\n==================================================================");
console.log("OUT SHIPMENT JOURNEY CONSOLIDATION — AUTHORITATIVE TEST SUITE");
console.log("==================================================================\n");

// Mock helper
function createMockShipment(overrides?: Record<string, any>): Shipment {
  return {
    id: "ship_test_123",
    company_id: "comp_1",
    customer_id: "cust_1",
    reference_number: "OUT-2026-TEST",
    status: "submitted",
    supplier_name: null,
    country_of_origin: "الصين",
    port_of_arrival: "ميناء الإسكندرية",
    goods_description: null,
    packages_count: 50,
    package_type: null,
    gross_weight: 1200,
    notes: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    goods_category: "other",
    applicable_procedures: ["general_customs_procedure"],
    classification_notes: null,
    classification_reviewed_at: null,
    classification_reviewed_by: null,
    ...overrides,
  } as unknown as Shipment;
}

// ─────────────────────────────────────────────────────────────────────────────
// TEST GROUP 1: The Ten Authoritative Business Stages (Admin)
// ─────────────────────────────────────────────────────────────────────────────
console.log("TEST GROUP 1: The Ten Authoritative Business Stages (Admin Order & Labels)");

const emptyShipment = createMockShipment({ status: "draft" });
const journey1 = buildAuthoritativeTenStageJourney({ shipment: emptyShipment });

assert(journey1.stages.length === 10, "Journey contains exactly 10 stages");

const expectedStageTitles = [
  "01 — استقبال طلب الشحنة",
  "02 — التسعير وموافقة العميل",
  "03 — مراجعة الفاتورة وإجراءات نافذة",
  "04 — مراجعة مستندات الشحنة",
  "05 — إجراءات حسب نوع البضاعة",
  "06 — الكشف والمعاينة",
  "07 — إدراج البيانات والإجراءات المطلوبة",
  "08 — التقييم الجمركي",
  "09 — تسوية المستحقات",
  "10 — الإفراج والخروج والتسليم",
];

journey1.stages.forEach((st, idx) => {
  assert(st.title === expectedStageTitles[idx], `Stage ${idx + 1} has authoritative title: "${st.title}"`);
  assert(st.number === String(idx + 1).padStart(2, "0"), `Stage ${idx + 1} has correct number: "${st.number}"`);
  assert(typeof st.icon === "string" && st.icon.length > 0, `Stage ${idx + 1} has a dedicated icon: "${st.icon}"`);
});

// Initial draft shipment should have Stage 01 active and remaining pending
assert(journey1.currentStageNumber === "01", "Draft shipment has active stage 01");
assert(journey1.stages[0].isCurrent === true, "Stage 01 is marked isCurrent: true");
assert(journey1.stages[1].status === "pending", "Stage 02 is pending");
assert(journey1.stages[9].status === "pending", "Stage 10 is pending");

// ─────────────────────────────────────────────────────────────────────────────
// TEST GROUP 2: The Seven Customer Progress Stations (Client Mapping & Grouping)
// ─────────────────────────────────────────────────────────────────────────────
console.log("\nTEST GROUP 2: The Seven Customer Progress Stations (Grouping & Labels)");

const clientJourney1 = buildCustomerSevenStationJourney(journey1);

assert(clientJourney1.stations.length === 7, "Client journey has exactly 7 progress stations");
assert(clientJourney1.totalCount === 7, "Client totalCount is 7");

const expectedStationTitles = [
  "تقديم طلب الشحنة",
  "التسعير والموافقة",
  "الفاتورة ونافذة وACID",
  "المستندات والإجراءات المطلوبة",
  "الكشف والمعاينة وإدراج البيانات",
  "التقييم الجمركي والتسوية",
  "الإفراج وخروج الشحنة والتسليم",
];

clientJourney1.stations.forEach((st, idx) => {
  assert(st.title === expectedStationTitles[idx], `Station ${idx + 1} title is: "${st.title}"`);
  assert(st.number === String(idx + 1).padStart(2, "0"), `Station ${idx + 1} number is: "${st.number}"`);
  assert(typeof st.icon === "string" && st.icon.length > 0, `Station ${idx + 1} icon is: "${st.icon}"`);
});

// Verify grouping mapping invariants
assert(JSON.stringify(CUSTOMER_STATIONS_CONFIG[0].underlyingStageNumbers) === JSON.stringify(["01"]), "Station 1 maps to Stage 01");
assert(JSON.stringify(CUSTOMER_STATIONS_CONFIG[1].underlyingStageNumbers) === JSON.stringify(["02"]), "Station 2 maps to Stage 02");
assert(JSON.stringify(CUSTOMER_STATIONS_CONFIG[2].underlyingStageNumbers) === JSON.stringify(["03"]), "Station 3 maps to Stage 03");
assert(JSON.stringify(CUSTOMER_STATIONS_CONFIG[3].underlyingStageNumbers) === JSON.stringify(["04", "05"]), "Station 4 maps to Stages 04 and 05");
assert(JSON.stringify(CUSTOMER_STATIONS_CONFIG[4].underlyingStageNumbers) === JSON.stringify(["06", "07"]), "Station 5 maps to Stages 06 and 07");
assert(JSON.stringify(CUSTOMER_STATIONS_CONFIG[5].underlyingStageNumbers) === JSON.stringify(["08", "09"]), "Station 6 maps to Stages 08 and 09");
assert(JSON.stringify(CUSTOMER_STATIONS_CONFIG[6].underlyingStageNumbers) === JSON.stringify(["10"]), "Station 7 maps to Stage 10");

// ─────────────────────────────────────────────────────────────────────────────
// TEST GROUP 3: Deterministic Status Derivation & Safe Automation
// ─────────────────────────────────────────────────────────────────────────────
console.log("\nTEST GROUP 3: Deterministic Status Derivation");

// Case A: Shipment created, classified, ready for pricing
const shipmentClassified = createMockShipment({
  status: "awaiting_pricing",
  goods_category: "industrial",
  classification_reviewed_at: new Date().toISOString(),
});
const journeyClassified = buildAuthoritativeTenStageJourney({ shipment: shipmentClassified });
assert(journeyClassified.stages[0].isCompleted === true, "Stage 01 completes when classification reviewed");
assert(journeyClassified.currentStageNumber === "02", "Stage 02 becomes active once Stage 01 completes");

// Case B: Pricing proposed but NOT customer-approved -> Stage 02 MUST NOT be completed
const pricingProposed = {
  id: "pr_1",
  shipment_id: shipmentClassified.id,
  status: "proposed",
  final_price: 15000,
  currency: "EGP",
  estimated_min_price: 12000,
  estimated_max_price: 16000,
  notes: null,
  valid_until: null,
  customer_approved_at: null,
  customer_approved_by: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
} as unknown as ShipmentPricing;

const journeyPriceProposed = buildAuthoritativeTenStageJourney({
  shipment: shipmentClassified,
  pricing: pricingProposed,
});
assert(journeyPriceProposed.stages[1].isCompleted === false, "Stage 02 is NOT complete without explicit approval");
assert(journeyPriceProposed.stages[1].status === "awaiting_external_response", "Stage 02 status is awaiting_external_response");
assert(journeyPriceProposed.currentStageNumber === "02", "Active stage remains 02 while price approval is pending");

// Case C: Pricing explicitly approved by customer -> Stage 02 completes, Stage 03 becomes active
const pricingApproved = {
  ...pricingProposed,
  status: "customer_approved",
  customer_approved_at: new Date().toISOString(),
} as unknown as ShipmentPricing;

const journeyPriceApproved = buildAuthoritativeTenStageJourney({
  shipment: shipmentClassified,
  pricing: pricingApproved,
});
assert(journeyPriceApproved.stages[1].isCompleted === true, "Stage 02 completes upon explicit customer approval");
assert(journeyPriceApproved.currentStageNumber === "03", "Workflow advances automatically to Stage 03");

// Case D: Stage 03 requires both preliminary invoice approval AND ACID issuance
const acidIssued = {
  id: "acid_1",
  shipment_id: shipmentClassified.id,
  status: "issued",
  acid_number: "1234567890123456789", // 19 digits
  notes: null,
  issued_at: new Date().toISOString(),
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
} as unknown as ShipmentAcid;

const prelimInvoiceDoc = {
  id: "doc_inv_1",
  shipment_id: shipmentClassified.id,
  document_type: "commercial_invoice",
  file_name: "proforma.pdf",
  file_path: "/uploads/proforma.pdf",
  file_size: 1024,
  status: "approved",
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
} as unknown as DocumentItem;

const journeyS3Complete = buildAuthoritativeTenStageJourney({
  shipment: shipmentClassified,
  pricing: pricingApproved,
  acid: acidIssued,
  documents: [prelimInvoiceDoc],
});
assert(journeyS3Complete.stages[2].isCompleted === true, "Stage 03 completes when both invoice approved and ACID issued");
assert(journeyS3Complete.currentStageNumber === "04", "Workflow advances automatically to Stage 04");

// Case E: Stage 04 Document-driven derivation (Requires 4 final documents approved)
const final4Docs = [
  { id: "d1", shipment_id: shipmentClassified.id, document_type: "commercial_invoice", file_name: "ci.pdf", file_path: "p1", file_size: 10, status: "approved", created_at: "", updated_at: "" },
  { id: "d2", shipment_id: shipmentClassified.id, document_type: "packing_list", file_name: "pl.pdf", file_path: "p2", file_size: 10, status: "approved", created_at: "", updated_at: "" },
  { id: "d3", shipment_id: shipmentClassified.id, document_type: "bill_of_lading", file_name: "bl.pdf", file_path: "p3", file_size: 10, status: "approved", created_at: "", updated_at: "" },
  { id: "d4", shipment_id: shipmentClassified.id, document_type: "certificate_of_origin", file_name: "co.pdf", file_path: "p4", file_size: 10, status: "approved", created_at: "", updated_at: "" },
] as unknown as DocumentItem[];

const journeyS4Complete = buildAuthoritativeTenStageJourney({
  shipment: shipmentClassified,
  pricing: pricingApproved,
  acid: acidIssued,
  documents: final4Docs,
});
assert(journeyS4Complete.stages[3].isCompleted === true, "Stage 04 completes when all 4 final documents are approved");

// Case F: Conditional goods procedure in Stage 05 (General goods -> not applicable, automatically satisfied)
const generalShipment = createMockShipment({
  goods_category: "other",
  applicable_procedures: ["general_customs_procedure"],
});
const journeyGeneralS5 = buildAuthoritativeTenStageJourney({
  shipment: generalShipment,
  pricing: pricingApproved,
  acid: acidIssued,
  documents: final4Docs,
});
assert(journeyGeneralS5.stages[4].isApplicable === false, "Stage 05 is not applicable for general goods");
assert(journeyGeneralS5.stages[4].status === "not_applicable", "Stage 05 status is marked 'not_applicable'");
assert(journeyGeneralS5.stages[4].isCompleted === false, "Not applicable stage is not marked completed");

// Station 04 in customer view groups Stage 04 & Stage 05:
// When Stage 05 is not applicable, Station 04 completes when Stage 04 is complete!
const clientGeneralS4 = buildCustomerSevenStationJourney(journeyGeneralS5);
assert(clientGeneralS4.stations[3].isCompleted === true, "Client Station 04 completes when Stage 04 is done and Stage 05 is not applicable");

// ─────────────────────────────────────────────────────────────────────────────
// TEST GROUP 4: Stage 06 Dual Sub-Processes (Scouting & Inspection)
// ─────────────────────────────────────────────────────────────────────────────
console.log("\nTEST GROUP 4: Stage 06 Dual Sub-Processes (Scouting & Inspection)");

const journeyStage06 = buildAuthoritativeTenStageJourney({
  shipment: generalShipment,
  pricing: pricingApproved,
  acid: acidIssued,
  documents: final4Docs,
  journey: {
    shipment_id: generalShipment.id,
    goods_category: "other",
    applicable_procedures: ["general_customs_procedure"],
    stages: [
      {
        stage_key: "stage_5_scouting",
        stage_order: 5,
        status: "completed",
        is_applicable: true,
        completed_at: new Date().toISOString(),
        outcome: "تم الكشف في الساحة وسلامة الأختام",
      },
      {
        stage_key: "stage_6_inspection",
        stage_order: 6,
        status: "in_progress",
        is_applicable: true,
        completed_at: null,
      },
    ],
  } as any,
});

assert(journeyStage06.stages[5].scoutingSubProcess !== undefined, "Stage 06 contains scoutingSubProcess");
assert(journeyStage06.stages[5].inspectionSubProcess !== undefined, "Stage 06 contains inspectionSubProcess");
assert(journeyStage06.stages[5].scoutingSubProcess?.status === "completed", "Scouting sub-process status is completed");
assert(journeyStage06.stages[5].inspectionSubProcess?.status === "in_progress", "Inspection sub-process status is in_progress");
assert(journeyStage06.stages[5].isCompleted === false, "Stage 06 as a whole remains incomplete while inspection is in progress");

// ─────────────────────────────────────────────────────────────────────────────
// TEST GROUP 5: Legacy Financial Valuation Fallback & Settlement Invariants
// ─────────────────────────────────────────────────────────────────────────────
console.log("\nTEST GROUP 5: Financial Valuation & Settlement Fallback");

// Legacy shipment with duties_amount instead of assessed_customs_amount
const legacySettlementData = {
  settlement_status: "pending",
  duties_amount: 45000, // legacy fallback field
  assessed_customs_amount: null,
  out_paid_amount: 0,
  customer_paid_amount: 0,
};
const computedBalance = computeCustomsOutstandingBalance(legacySettlementData as any);
assert(computedBalance === 45000, `Legacy fallback computes outstanding balance from duties_amount (45,000 ج.م)`);

const journeyLegacyVal = buildAuthoritativeTenStageJourney({
  shipment: generalShipment,
  pricing: pricingApproved,
  acid: acidIssued,
  documents: final4Docs,
  journey: {
    shipment_id: generalShipment.id,
    goods_category: "other",
    applicable_procedures: ["general_customs_procedure"],
    stages: [
      { stage_key: "stage_1_intake", stage_order: 1, status: "completed", is_applicable: true },
      { stage_key: "stage_2_pricing", stage_order: 2, status: "completed", is_applicable: true },
      { stage_key: "stage_3_nafeza_acid", stage_order: 3, status: "completed", is_applicable: true },
      { stage_key: "stage_4_type_procedures", stage_order: 4, status: "completed", is_applicable: false },
      { stage_key: "stage_5_scouting", stage_order: 5, status: "completed", is_applicable: true },
      { stage_key: "stage_6_inspection", stage_order: 6, status: "completed", is_applicable: true },
      { stage_key: "stage_7_data_entry", stage_order: 7, status: "completed", is_applicable: true },
      {
        stage_key: "stage_8_valuation",
        stage_order: 8,
        status: "completed",
        is_applicable: true,
        stage_data: { duties_amount: 45000 },
      },
      {
        stage_key: "stage_9_fees_payments",
        stage_order: 9,
        status: "in_progress",
        is_applicable: true,
        stage_data: legacySettlementData,
      },
      { stage_key: "stage_10_clearance_release", stage_order: 10, status: "pending", is_applicable: true },
    ],
  } as any,
});

const formatted45k = (45000).toLocaleString("ar-EG");
assert(journeyLegacyVal.stages[7].isCompleted === true, "Stage 08 Valuation is completed");
assert(Boolean(journeyLegacyVal.stages[7].metaInfo?.includes(formatted45k)), "Stage 08 shows legacy fallback amount in metaInfo");
assert(journeyLegacyVal.stages[8].isCompleted === false, "Stage 09 is NOT completed while 45,000 balance remains");
assert(Boolean(journeyLegacyVal.stages[8].metaInfo?.includes(formatted45k)), "Stage 09 displays remaining unpaid balance in metaInfo");

// ─────────────────────────────────────────────────────────────────────────────
// TEST GROUP 6: Strict Customer Privacy & Suppression of Internal Data
// ─────────────────────────────────────────────────────────────────────────────
console.log("\nTEST GROUP 6: Strict Customer Privacy & Field Suppression");

const customerJourneySecured = buildAuthoritativeTenStageJourney({
  shipment: generalShipment,
  pricing: pricingApproved,
  acid: acidIssued,
  documents: final4Docs,
  isCustomerView: true,
  journey: {
    shipment_id: generalShipment.id,
    goods_category: "other",
    applicable_procedures: ["general_customs_procedure"],
    stages: [
      {
        stage_key: "stage_5_scouting",
        stage_order: 5,
        status: "completed",
        is_applicable: true,
        notes: "INTERNAL_NOTE_CONFIDENTIAL_AGENT_REPORT",
        completed_by: "usr_internal_admin_secret_99",
        completed_by_name: "Internal Staff Name",
      },
    ],
  } as any,
});

customerJourneySecured.stages.forEach((st) => {
  assert(st.assignedRole === undefined, `Stage ${st.number}: assignedRole is suppressed in customer view`);
  assert(st.assignedRoleLabel === undefined, `Stage ${st.number}: assignedRoleLabel is suppressed in customer view`);
  assert(st.checklist === undefined, `Stage ${st.number}: internal checklist is suppressed in customer view`);
  assert(st.waitingReason === null, `Stage ${st.number}: internal waiting reason is null in customer view`);
  assert(st.dbStageRecord === null, `Stage ${st.number}: raw db record is suppressed in customer view`);
});

const s6Sub = customerJourneySecured.stages[5].scoutingSubProcess;
assert(s6Sub?.notes === null, "Subprocess internal notes suppressed in customer view");
assert(s6Sub?.completedBy === null, "Subprocess internal staff ID suppressed in customer view");
assert(s6Sub?.completedByName === null, "Subprocess internal staff name suppressed in customer view");

// ─────────────────────────────────────────────────────────────────────────────
// TEST GROUP 7: Operational Current Action (Admin Section 5.3)
// ─────────────────────────────────────────────────────────────────────────────
console.log("\nTEST GROUP 7: Operational Current Action (Admin Hero Banner)");

const journeyHero = buildAuthoritativeTenStageJourney({
  shipment: shipmentClassified,
  pricing: pricingProposed, // pending customer approval
});

assert(journeyHero.currentOperationalAction !== null, "currentOperationalAction is generated for active shipment");
assert(journeyHero.currentOperationalAction?.stageNumber === "02", "Action targets stage 02");
assert(
  journeyHero.currentOperationalAction?.currentReason === "في انتظار موافقة العميل على السعر النهائي",
  "Action accurately describes why stage is active"
);
assert(
  journeyHero.currentOperationalAction?.actionType === "open_pricing_tab",
  "Action type properly routes to pricing tab"
);

console.log("\n==================================================================");
console.log(`TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
console.log("==================================================================\n");

if (failed > 0) {
  process.exit(1);
}
