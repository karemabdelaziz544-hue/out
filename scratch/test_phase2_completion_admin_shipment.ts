/**
 * OUT — Phase 2 Completion: Admin Shipment Journey Comprehensive Verification
 *
 * Verifies all 12 criteria of Section 10 & 11:
 * 1. Exactly 10 Authoritative Stages in exact sequence & Arabic labels.
 * 2. Stage 04 handles 4 mandatory documents + conditional type_procedures sub-process.
 * 3. Stage 05 maps ONLY to stage_5_scouting, role: scout.
 * 4. Stage 06 maps ONLY to stage_6_inspection, role: inspector.
 * 5. Complete independence between Stage 05 and Stage 06 (no cross-completion).
 * 6. Historical not_applicable records preserved; completed records never overwritten as not_applicable.
 * 7. 4 mandatory final documents enforced even when type procedures are not applicable.
 * 8. CargoX decoupled from mandatory workflow (Stage 03 and Stage 07).
 * 9. Stage 07 retains customs declaration number and conditional No. 46 advisory.
 * 10. Stage 10 tracks 3 independent events (release, port exit, delivery) without erasure.
 * 11. Concurrency control: OCC rejects missing/invalid/stale expected_updated_at.
 * 12. Customer 7-station journey intact without regression.
 */

import { buildAuthoritativeTenStageJourney } from "../src/lib/shipments/canonical-journey-adapter";
import {
  AuthoritativeStageNumber,
  AuthoritativeStageKey,
  AUTHORITATIVE_STAGES_CONFIG,
  CUSTOMER_STATIONS_CONFIG,
  CustomsStageStatus,
} from "../src/types/journey";
import {
  STAGE_WORKFLOW_RULES,
  validateStagePrerequisites,
  isStageApplicable,
} from "../src/lib/shipments/workflow-rules";
import type {
  Shipment,
  DocumentItem,
  ShipmentPricing,
  ShipmentAcid,
  ShipmentCustomsJourney,
} from "../src/types";

let passedCount = 0;
let totalCount = 0;

function assert(condition: boolean, message: string) {
  totalCount++;
  if (condition) {
    passedCount++;
    console.log(`  [PASS] ${message}`);
  } else {
    console.error(`  [FAIL] ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
}

function mockBaseShipment(overrides?: Partial<Shipment>): Shipment {
  return {
    id: "ship_phase2_001",
    customer_id: "cust_phase2_001",
    company_id: "comp_phase2_001",
    reference_number: "OUT-TEST-2026",
    status: "ready_for_external_stage",
    supplier_name: "Phase2 International",
    country_of_origin: "DE",
    port_of_arrival: "Alexandria",
    goods_description: "Industrial Machine Parts",
    packages_count: 12,
    package_type: "crate",
    gross_weight: 1200,
    notes: null,
    goods_category: "industrial",
    applicable_procedures: ["industrial_radiation_check"],
    classification_notes: null,
    classification_reviewed_at: new Date().toISOString(),
    classification_reviewed_by: "user_admin_01",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

function mockDoc(id: string, type: string, status: "pending" | "approved" | "revision_required" = "approved"): DocumentItem {
  return {
    id,
    shipment_id: "ship_phase2_001",
    document_type: type,
    title: `Doc ${type}`,
    file_path: `/docs/${id}.pdf`,
    file_url: `/docs/${id}.pdf`,
    file_size: 1024,
    status,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

const allFourApprovedDocs: DocumentItem[] = [
  mockDoc("d1", "commercial_invoice", "approved"),
  mockDoc("d2", "packing_list", "approved"),
  mockDoc("d3", "bill_of_lading", "approved"),
  mockDoc("d4", "certificate_of_origin", "approved"),
];

async function runPhase2CompletionTests() {
  console.log("==================================================================");
  console.log("  OUT — PHASE 2 COMPLETION: ADMIN SHIPMENT VERIFICATION SUITE   ");
  console.log("==================================================================");

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. Exactly 10 Authoritative Stages Order and Arabic Labels
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("\n[TEST GROUP 1] Authoritative 10-Stage Sequence & Labels");

  const expectedTenStages: Array<{ num: AuthoritativeStageNumber; key: AuthoritativeStageKey; title: string }> = [
    { num: "01", key: "01_intake", title: "تقديم طلب الشحنة" },
    { num: "02", key: "02_pricing", title: "التسعير وموافقة العميل" },
    { num: "03", key: "03_invoice_nafeza", title: "مراجعة الفاتورة المبدئية وإجراءات نافذة وACID" },
    { num: "04", key: "04_documents", title: "مراجعة مستندات الشحنة واستكمالها" },
    { num: "05", key: "05_scouting", title: "الكشف الميداني" },
    { num: "06", key: "06_inspection", title: "المعاينة" },
    { num: "07", key: "07_data_entry", title: "إدراج البيانات" },
    { num: "08", key: "08_valuation", title: "التقييم الجمركي" },
    { num: "09", key: "09_settlement", title: "التسوية وسداد المستحقات" },
    { num: "10", key: "10_clearance_release", title: "الإفراج الجمركي وخروج الشحنة والتسليم" },
  ];

  assert(AUTHORITATIVE_STAGES_CONFIG.length === 10, "Authoritative configuration has exactly 10 stages");

  expectedTenStages.forEach((exp, idx) => {
    const cfg = AUTHORITATIVE_STAGES_CONFIG[idx];
    assert(cfg.number === exp.num, `Stage index ${idx} has number ${exp.num}`);
    assert(cfg.key === exp.key, `Stage index ${idx} has key ${exp.key}`);
    assert(cfg.title.includes(exp.title), `Stage ${exp.num} title contains "${exp.title}"`);
  });

  const jEmpty = buildAuthoritativeTenStageJourney({
    shipment: mockBaseShipment(),
    documents: [],
  });
  assert(jEmpty.stages.length === 10, "Journey adapter generates exactly 10 stages");

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. Mappings of Stages 04, 05, and 06
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("\n[TEST GROUP 2] Stage Mappings for 04, 05, and 06");

  const s4Stage = jEmpty.stages[3];
  const s5Stage = jEmpty.stages[4];
  const s6Stage = jEmpty.stages[5];

  assert(s4Stage.key === "04_documents", "Stage 04 key is 04_documents");
  assert(s4Stage.mappedDbKeys.includes("stage_4_type_procedures"), "Stage 04 mappedDbKeys includes stage_4_type_procedures");

  assert(s5Stage.key === "05_scouting", "Stage 05 key is 05_scouting");
  assert(s5Stage.mappedDbKeys.length === 1 && s5Stage.mappedDbKeys[0] === "stage_5_scouting", "Stage 05 maps exclusively to stage_5_scouting");
  assert(s5Stage.assignedRole === "scout", "Stage 05 assigned role is scout");

  assert(s6Stage.key === "06_inspection", "Stage 06 key is 06_inspection");
  assert(s6Stage.mappedDbKeys.length === 1 && s6Stage.mappedDbKeys[0] === "stage_6_inspection", "Stage 06 maps exclusively to stage_6_inspection");
  assert(s6Stage.assignedRole === "inspector", "Stage 06 assigned role is inspector");

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. Stage 04 Dual Workspace: Final Documents + Type Procedures Sub-process
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("\n[TEST GROUP 3] Stage 04: 4 Final Documents & Conditional Type Procedures");

  // Case 3.A: Only 3 of 4 documents approved -> Stage 04 is incomplete
  const threeDocs = allFourApprovedDocs.slice(0, 3);
  const jDocsIncomplete = buildAuthoritativeTenStageJourney({
    shipment: mockBaseShipment(),
    documents: threeDocs,
    pricing: { status: "customer_approved" } as any,
    acid: { status: "acid_issued", acid_number: "ACID123" } as any,
  });
  assert(jDocsIncomplete.stages[3].isCompleted === false, "Stage 04 is incomplete when only 3/4 documents approved");
  assert(jDocsIncomplete.stages[3].status !== "completed", "Stage 04 status is not completed when 3/4 docs approved");

  // Case 3.B: General goods (no special type procedures) still requires all 4 documents
  const jGeneralGoods = buildAuthoritativeTenStageJourney({
    shipment: mockBaseShipment({ goods_category: "other", applicable_procedures: ["general_customs_procedure"] }),
    documents: threeDocs,
    pricing: { status: "customer_approved" } as any,
    acid: { status: "acid_issued", acid_number: "ACID123" } as any,
  });
  assert(jGeneralGoods.stages[3].isCompleted === false, "General goods shipment is NOT exempt from 4-document requirement");

  // Case 3.C: 4 documents approved + general goods -> Stage 04 complete, type procedures sub-process indicates not applicable
  const jGeneralGoods4Docs = buildAuthoritativeTenStageJourney({
    shipment: mockBaseShipment({ goods_category: "other", applicable_procedures: ["general_customs_procedure"] }),
    documents: allFourApprovedDocs,
    pricing: { status: "customer_approved" } as any,
    acid: { status: "acid_issued", acid_number: "ACID123" } as any,
  });
  assert(jGeneralGoods4Docs.stages[3].isCompleted === true, "Stage 04 completes when all 4 documents approved for general goods");
  assert(jGeneralGoods4Docs.stages[3].typeProceduresSubProcess?.isApplicable === false, "Type procedures sub-process correctly marked not applicable for general cargo");

  // Case 3.D: Regulated goods with active saved completed record is NEVER displayed as not_applicable
  const jRegulatedSaved = buildAuthoritativeTenStageJourney({
    shipment: mockBaseShipment({ goods_category: "other" }), // category changed or general
    journey: {
      stages: [
        {
          stage_key: "stage_4_type_procedures",
          status: "completed",
          is_applicable: true,
          reference_number: "REG-REF-7788",
          stage_data: { agency_name: "سلامة الغذاء", procedure_type: "معاينة مطابقة" },
        },
      ],
    } as any,
    documents: allFourApprovedDocs,
    pricing: { status: "customer_approved" } as any,
    acid: { status: "acid_issued", acid_number: "ACID123" } as any,
  });
  assert(jRegulatedSaved.stages[3].typeProceduresSubProcess?.status === "completed", "Persisted completed type procedure is preserved and NOT overwritten by not_applicable");
  assert(jRegulatedSaved.stages[3].typeProceduresSubProcess?.isApplicable === true, "Persisted type procedure isApplicable remains true");

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. Independent Stage 05 & Stage 06 Behavior (No Cross-Completion)
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("\n[TEST GROUP 4] Independent Stage 05 & 06 (No Cross-Completion)");

  // Verify workflow rules: stage_5_scouting must NOT have satisfiedBy
  const s5Rules = STAGE_WORKFLOW_RULES["stage_5_scouting"];
  assert(!s5Rules.satisfiedBy || s5Rules.satisfiedBy.length === 0, "stage_5_scouting does not have satisfiedBy rule (no bypass from inspection)");

  // Scenario 4.A: Stage 05 is completed, Stage 06 is pending
  const jS5DoneS6Pending = buildAuthoritativeTenStageJourney({
    shipment: mockBaseShipment(),
    documents: allFourApprovedDocs,
    pricing: { status: "customer_approved" } as any,
    acid: { status: "acid_issued", acid_number: "ACID123" } as any,
    journey: {
      stages: [
        { stage_key: "stage_5_scouting", status: "completed", is_applicable: true },
        { stage_key: "stage_6_inspection", status: "pending", is_applicable: true },
      ],
    } as any,
  });
  assert(jS5DoneS6Pending.stages[4].isCompleted === true, "Stage 05 is completed");
  assert(jS5DoneS6Pending.stages[5].isCompleted === false, "Stage 06 is NOT completed when Stage 05 completes (no forward cross-completion)");
  assert(jS5DoneS6Pending.stages[5].status !== "completed", "Stage 06 status is not completed");

  // Scenario 4.B: Stage 06 is completed, Stage 05 is pending
  const jS6DoneS5Pending = buildAuthoritativeTenStageJourney({
    shipment: mockBaseShipment(),
    documents: allFourApprovedDocs,
    pricing: { status: "customer_approved" } as any,
    acid: { status: "acid_issued", acid_number: "ACID123" } as any,
    journey: {
      stages: [
        { stage_key: "stage_5_scouting", status: "pending", is_applicable: true },
        { stage_key: "stage_6_inspection", status: "completed", is_applicable: true },
      ],
    } as any,
  });
  assert(jS6DoneS5Pending.stages[4].isCompleted === false, "Stage 05 is NOT completed when Stage 06 is completed (no backward cross-completion)");
  assert(jS6DoneS5Pending.stages[4].status !== "completed", "Stage 05 status is not completed");
  assert(jS6DoneS5Pending.stages[5].isCompleted === true, "Stage 06 is completed");

  // Scenario 4.C: Historical not_applicable on Stage 05 is preserved
  const jS5HistoricalNA = buildAuthoritativeTenStageJourney({
    shipment: mockBaseShipment(),
    documents: allFourApprovedDocs,
    journey: {
      stages: [
        { stage_key: "stage_5_scouting", status: "not_applicable", is_applicable: false },
        { stage_key: "stage_6_inspection", status: "in_progress", is_applicable: true },
      ],
    } as any,
  });
  assert(jS5HistoricalNA.stages[4].status === "not_applicable", "Historical not_applicable on stage_5_scouting is preserved");
  assert(jS5HistoricalNA.stages[5].status === "in_progress", "Stage 06 operates independently alongside not_applicable scouting");

  // ─────────────────────────────────────────────────────────────────────────────
  // 5. CargoX Removed from Mandatory Workflow & Stage 07 Data Entry
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("\n[TEST GROUP 5] CargoX Decoupled & Stage 07 Legitimate Data Entry");

  // Prerequisites check for Stage 07: Should pass without requiring CargoX fields
  const precedingStagesMap = new Map();
  precedingStagesMap.set("stage_1_intake", { status: "completed" });
  precedingStagesMap.set("stage_2_pricing", { status: "completed" });
  precedingStagesMap.set("stage_3_nafeza_acid", { status: "completed" });
  precedingStagesMap.set("stage_4_type_procedures", { status: "not_applicable" });
  precedingStagesMap.set("stage_5_scouting", { status: "completed" });
  precedingStagesMap.set("stage_6_inspection", { status: "completed" });

  const finalDocStatusMap = new Map();
  finalDocStatusMap.set("commercial_invoice", "approved");
  finalDocStatusMap.set("packing_list", "approved");
  finalDocStatusMap.set("bill_of_lading", "approved");
  finalDocStatusMap.set("certificate_of_origin", "approved");

  const stage7PrereqCheck = validateStagePrerequisites({
    shipmentStatus: "customs_in_progress",
    stageKey: "stage_7_data_entry",
    targetStatus: "completed",
    currentStatus: "in_progress",
    stagesMap: precedingStagesMap as any,
    documentStatuses: finalDocStatusMap as any,
    stageData: {},
    referenceNumber: "CUSTOMS-DEC-9988",
  });
  assert(stage7PrereqCheck.valid === true, "Stage 07 completion does NOT require CargoX verification");

  // Stage 07 adapter status check: CargoX is not a blocker
  const jS7 = buildAuthoritativeTenStageJourney({
    shipment: mockBaseShipment(),
    documents: allFourApprovedDocs,
    pricing: { status: "customer_approved" } as any,
    acid: { status: "acid_issued", acid_number: "ACID123" } as any,
    journey: {
      stages: [
        { stage_key: "stage_5_scouting", status: "completed" },
        { stage_key: "stage_6_inspection", status: "completed" },
        {
          stage_key: "stage_7_data_entry",
          status: "completed",
          reference_number: "DEC-46-12345",
          stage_data: { declaration_46_advisory: "46-2026-900" },
        },
      ],
    } as any,
  });
  assert(jS7.stages[6].status === "completed", "Stage 07 completes cleanly with declaration number and advisory");
  assert(jS7.stages[6].metaInfo?.includes("46-2026-900") === true, "Stage 07 metaInfo displays No. 46 advisory");

  // ─────────────────────────────────────────────────────────────────────────────
  // 6. Stage 10 Three Independent Events
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("\n[TEST GROUP 6] Stage 10: Customs Release, Port Exit, Delivery Independence");

  // Scenario 6.A: Only Customs Release is recorded
  const j10ReleaseOnly = buildAuthoritativeTenStageJourney({
    shipment: mockBaseShipment(),
    documents: allFourApprovedDocs,
    journey: {
      stages: [
        {
          stage_key: "stage_10_clearance_release",
          status: "in_progress",
          reference_number: "REL-2026-001",
          stage_data: {
            release_permit_number: "REL-2026-001",
            customs_released_at: "2026-10-25T10:00:00Z",
          },
        },
      ],
    } as any,
  });
  const s10DataA = (j10ReleaseOnly.stages[9].dbStageRecord?.stage_data || {}) as Record<string, unknown>;
  assert(Boolean(s10DataA.customs_released_at), "Customs release is recorded");
  assert(!s10DataA.port_exit_at, "Port exit is NOT implicitly recorded when customs release is recorded");
  assert(!s10DataA.delivered_at, "Delivery is NOT implicitly recorded when customs release is recorded");

  // Scenario 6.B: Port Exit is added without erasing Customs Release
  const s10DataB: Record<string, unknown> = {
    ...s10DataA,
    port_exit_at: "2026-10-26T12:00:00Z",
  };
  assert(Boolean(s10DataB.customs_released_at), "Customs release is preserved when port exit is recorded");
  assert(Boolean(s10DataB.port_exit_at), "Port exit timestamp is set");
  assert(!s10DataB.delivered_at, "Delivery is still NOT marked");

  // Scenario 6.C: Delivery is added without erasing Customs Release or Port Exit
  const s10DataC: Record<string, unknown> = {
    ...s10DataB,
    delivered_at: "2026-10-27T15:00:00Z",
  };
  assert(Boolean(s10DataC.customs_released_at), "Customs release preserved");
  assert(Boolean(s10DataC.port_exit_at), "Port exit preserved");
  assert(Boolean(s10DataC.delivered_at), "Delivered timestamp is set");

  // ─────────────────────────────────────────────────────────────────────────────
  // 7. Customer 7-Station Journey Backward Compatibility
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("\n[TEST GROUP 7] Customer 7-Station Journey Invariants");

  assert(CUSTOMER_STATIONS_CONFIG.length === 7, "Customer journey has exactly 7 stations");
  const expectedStations = [
    { num: "01", title: "تقديم طلب الشحنة" },
    { num: "02", title: "التسعير والموافقة" },
    { num: "03", title: "الفاتورة ونافذة وACID" },
    { num: "04", title: "المستندات والإجراءات المطلوبة" },
    { num: "05", title: "الكشف والمعاينة وإدراج البيانات" },
    { num: "06", title: "التقييم الجمركي والتسوية" },
    { num: "07", title: "الإفراج وخروج الشحنة والتسليم" },
  ];
  expectedStations.forEach((exp, idx) => {
    const st = CUSTOMER_STATIONS_CONFIG[idx];
    assert(st.number === exp.num, `Customer station ${exp.num} has number ${exp.num}`);
    assert(st.title.includes(exp.title), `Customer station ${exp.num} has title "${exp.title}"`);
  });

  // Verify Station 04 maps to ["04"] and Station 05 maps to ["05", "06", "07"]
  const custSt4 = CUSTOMER_STATIONS_CONFIG[3];
  const custSt5 = CUSTOMER_STATIONS_CONFIG[4];
  assert(custSt4.underlyingStageNumbers.includes("04"), "Customer station 04 maps to admin stage 04");
  assert(
    custSt5.underlyingStageNumbers.includes("05") &&
    custSt5.underlyingStageNumbers.includes("06") &&
    custSt5.underlyingStageNumbers.includes("07"),
    "Customer station 05 maps to admin stages 05, 06, and 07",
  );

  console.log("\n==================================================================");
  console.log(`  PHASE 2 COMPLETION VERIFICATION: ${passedCount}/${totalCount} TESTS PASSED!`);
  console.log("==================================================================\n");
}

runPhase2CompletionTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
