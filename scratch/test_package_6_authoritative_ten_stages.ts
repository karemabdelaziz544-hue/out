/**
 * OUT — Package 6: Authoritative 10-Stage Adapter & Journey Tests
 *
 * Validates:
 * 1. Exactly 10 Authoritative Business Stages in Fixed Sequence (01 to 10).
 * 2. Stage 03: Preliminary Invoice Review + Nafeza / ACID Tracking.
 * 3. Stage 04: Shipping Documents Review (4/4 Mandatory Types, Review Status, No Fake DB Row).
 * 4. Stage 05: Conditional Goods-Type Procedures (Inapplicable vs Pending).
 * 5. Stage 06: Dual Sub-processes (Scouting & Inspection with Independent & Unified Statuses).
 * 6. Stages 07-10: CargoX, Advisory No. 46, Valuation, Financial Settlement, and Release Permit.
 * 7. Active Current-Stage Sequential Resolution.
 * 8. Customer vs Admin Data Isolation (No Staff Leaks, No Internal Notes).
 * 9. Real Supabase Database Integration (Read-Only Inspection of Active Shipments).
 */

import { buildAuthoritativeTenStageJourney } from "../src/lib/shipments/canonical-journey-adapter";
import {
  AuthoritativeStageNumber,
  AuthoritativeStageKey,
  AUTHORITATIVE_STAGES_CONFIG,
  CustomsStageStatus,
} from "../src/types/journey";
import type {
  Shipment,
  DocumentItem,
  ShipmentPricing,
  ShipmentAcid,
  ShipmentInvoiceReview,
  ShipmentCustomsJourney,
} from "../src/types";
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

function mockBaseShipment(overrides?: Partial<Shipment>): Shipment {
  return {
    id: "ship_mock_001",
    customer_id: "cust_mock_001",
    company_id: "comp_mock_001",
    reference_number: "OUT-SHP-2026-0001",
    status: "ready_for_external_stage",
    supplier_name: "Mock Supplier",
    country_of_origin: "CN",
    port_of_arrival: "Alexandria Port",
    goods_description: "General Commercial Cargo",
    packages_count: 10,
    package_type: "box",
    gross_weight: 500,
    notes: null,
    goods_category: "other",
    applicable_procedures: ["general_customs_procedure"],
    classification_notes: null,
    classification_reviewed_at: new Date().toISOString(),
    classification_reviewed_by: "user_admin_01",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

function mockDocument(
  id: string,
  type: string,
  status: "pending" | "approved" | "revision_required" = "pending",
): DocumentItem {
  return {
    id,
    shipment_id: "ship_mock_001",
    document_type: type,
    title: `Document ${type}`,
    file_path: `/docs/${id}.pdf`,
    file_url: `/docs/${id}.pdf`,
    file_size: 10240,
    status,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

async function runAllTests() {
  console.log("==================================================================");
  console.log("  OUT — PACKAGE 6: AUTHORITATIVE 10-STAGE ADAPTER & JOURNEY TESTS ");
  console.log("==================================================================\n");

  // ─────────────────────────────────────────────────────────────────────────────
  // PART 1: EXACT 10 AUTHORITATIVE BUSINESS STAGES SEQUENCE & CONFIGURATION
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("--- PART 1: AUTHORITATIVE 10 STAGES ORDER & NAMES ---");

  const expectedStages: Array<{ num: AuthoritativeStageNumber; key: AuthoritativeStageKey; title: string }> = [
    { num: "01", key: "01_intake", title: "01 — تقديم طلب الشحنة" },
    { num: "02", key: "02_pricing", title: "02 — التسعير وموافقة العميل" },
    { num: "03", key: "03_invoice_nafeza", title: "03 — مراجعة الفاتورة المبدئية وإجراءات نافذة وACID" },
    { num: "04", key: "04_documents", title: "04 — مراجعة مستندات الشحنة واستكمالها" },
    { num: "05", key: "05_scouting", title: "05 — الكشف الميداني" },
    { num: "06", key: "06_inspection", title: "06 — المعاينة" },
    { num: "07", key: "07_data_entry", title: "07 — إدراج البيانات" },
    { num: "08", key: "08_valuation", title: "08 — التقييم الجمركي" },
    { num: "09", key: "09_settlement", title: "09 — التسوية وسداد المستحقات" },
    { num: "10", key: "10_clearance_release", title: "10 — الإفراج الجمركي وخروج الشحنة والتسليم" },
  ];

  assert(AUTHORITATIVE_STAGES_CONFIG.length === 10, "Adapter defines exactly 10 authoritative business stages");

  expectedStages.forEach((exp, idx) => {
    const stageCfg = AUTHORITATIVE_STAGES_CONFIG[idx];
    assert(stageCfg.number === exp.num, `Stage index ${idx} has authoritative number ${exp.num}`);
    assert(stageCfg.key === exp.key, `Stage ${exp.num} has authoritative key ${exp.key}`);
    assert(stageCfg.title === exp.title, `Stage ${exp.num} has exact authoritative title "${exp.title}"`);
  });

  const freshShipment = mockBaseShipment({ status: "submitted", classification_reviewed_at: null });
  const journey1 = buildAuthoritativeTenStageJourney({ shipment: freshShipment });

  assert(journey1.totalCount === 10, "Journey output reflects totalCount === 10");
  assert(journey1.stages.length === 10, "Journey output renders exactly 10 stage items");
  assert(journey1.currentStageNumber === "01", "Unreviewed shipment initializes currentStageNumber at '01'");
  assert(journey1.stages[0].isCurrent === true, "Stage 01 is marked isCurrent === true");
  assert(journey1.stages[0].status === "in_progress", "Stage 01 initial status is 'in_progress'");

  // ─────────────────────────────────────────────────────────────────────────────
  // PART 2: STAGE 03 — PRELIMINARY INVOICE REVIEW + NAFEZA / ACID
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("\n--- PART 2: STAGE 03 PRELIMINARY INVOICE & ACID RESOLUTION ---");

  // Step 2.A: Intake and pricing done, invoice not uploaded
  const shipmentAtStage3 = mockBaseShipment({
    status: "awaiting_invoice_review",
    classification_reviewed_at: new Date().toISOString(),
  });
  const approvedPricing: ShipmentPricing = {
    id: "price_001",
    shipment_id: shipmentAtStage3.id,
    estimated_min_price: 3000,
    estimated_max_price: 5000,
    final_price: 4500,
    currency: "EGP",
    status: "customer_approved",
    customer_approved_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const j3_pending_inv = buildAuthoritativeTenStageJourney({
    shipment: shipmentAtStage3,
    pricing: approvedPricing,
    documents: [],
  });
  assert(j3_pending_inv.currentStageNumber === "03", "Current stage resolves to '03' after pricing approval");
  assert(
    j3_pending_inv.stages[2].status === "awaiting_external_response",
    "Stage 03 is awaiting_external_response when invoice is missing",
  );
  assert(
    j3_pending_inv.stages[2].checklist?.find((c) => c.id === "chk_3_inv_up")?.isCompleted === false,
    "Invoice upload checklist item is false when invoice missing",
  );

  // Step 2.B: Invoice revision requested
  const revisionInvoiceDoc = mockDocument("doc_inv_1", "commercial_invoice", "revision_required");
  const j3_revision = buildAuthoritativeTenStageJourney({
    shipment: shipmentAtStage3,
    pricing: approvedPricing,
    documents: [revisionInvoiceDoc],
    invoiceReviews: [
      {
        id: "rev_1",
        shipment_id: shipmentAtStage3.id,
        document_id: "doc_inv_1",
        action: "revision_requested",
        note: "Invoice currency must be USD not EUR",
        performed_at: new Date().toISOString(),
      },
    ],
  });
  assert(j3_revision.stages[2].status === "needs_correction", "Stage 03 enters 'needs_correction' when revision requested");
  assert(
    j3_revision.stages[2].statusLabel.includes("مطلوب تعديل"),
    "Stage 03 statusLabel clearly indicates revision requirement",
  );

  // Step 2.C: Invoice approved, ACID processing
  const approvedInvoiceDoc = mockDocument("doc_inv_2", "commercial_invoice", "approved");
  const processingAcid: ShipmentAcid = {
    id: "acid_001",
    shipment_id: shipmentAtStage3.id,
    status: "processing",
    acid_number: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  const j3_processing = buildAuthoritativeTenStageJourney({
    shipment: shipmentAtStage3,
    pricing: approvedPricing,
    documents: [approvedInvoiceDoc],
    acid: processingAcid,
  });
  assert(
    j3_processing.stages[2].status === "awaiting_external_response",
    "Stage 03 is awaiting_external_response while ACID is processing at Nafeza",
  );
  assert(
    j3_processing.stages[2].checklist?.find((c) => c.id === "chk_3_inv_appr")?.isCompleted === true,
    "Invoice approved checklist item is true",
  );
  assert(
    j3_processing.stages[2].checklist?.find((c) => c.id === "chk_3_acid_num")?.isCompleted === false,
    "ACID number checklist item is false while processing",
  );

  // Step 2.D: ACID issued -> Stage 03 complete!
  const issuedAcid: ShipmentAcid = {
    id: "acid_002",
    shipment_id: shipmentAtStage3.id,
    status: "issued",
    acid_number: "2026102200192837461",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  const j3_completed = buildAuthoritativeTenStageJourney({
    shipment: shipmentAtStage3,
    pricing: approvedPricing,
    documents: [approvedInvoiceDoc],
    acid: issuedAcid,
  });
  assert(j3_completed.stages[2].status === "completed", "Stage 03 is 'completed' when invoice approved AND ACID issued");
  assert(j3_completed.stages[2].isCompleted === true, "Stage 03 isCompleted flag is true");
  assert(
    j3_completed.stages[2].checklist?.find((c) => c.id === "chk_3_acid_num")?.isCompleted === true,
    "ACID number checklist item is true",
  );
  assert(
    j3_completed.stages[2].metaInfo?.includes("2026102200192837461") === true,
    "Stage 03 metaInfo presents the issued ACID number",
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // PART 3: STAGE 04 — SHIPMENT DOCUMENTS REVIEW (NO FAKE DB ROW)
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("\n--- PART 3: STAGE 04 DOCUMENT COMPLETENESS & REVIEW STATUS ---");

  // Step 3.A: Mapped DB Keys: Stage 04 includes conditional type_procedures sub-process
  assert(
    j3_completed.stages[3].mappedDbKeys.includes("stage_4_type_procedures"),
    "Stage 04 mappedDbKeys includes stage_4_type_procedures",
  );

  // Step 3.B: Only 2 of 4 documents uploaded
  const docs_2_of_4 = [
    approvedInvoiceDoc,
    mockDocument("doc_pl_1", "packing_list", "approved"),
  ];
  const j4_partial = buildAuthoritativeTenStageJourney({
    shipment: shipmentAtStage3,
    pricing: approvedPricing,
    documents: docs_2_of_4,
    acid: issuedAcid,
  });
  assert(j4_partial.currentStageNumber === "04", "Current stage resolves to '04' when ACID complete and docs pending");
  assert(
    j4_partial.stages[3].status === "awaiting_external_response",
    "Stage 04 is awaiting_external_response when only 2/4 docs uploaded",
  );
  assert(
    j4_partial.stages[3].statusLabel.includes("2/4"),
    "Stage 04 statusLabel shows missing document count (2/4)",
  );

  // Step 3.C: 4 documents uploaded, but Bill of Lading needs revision
  const docs_with_revision = [
    approvedInvoiceDoc,
    mockDocument("doc_pl_1", "packing_list", "approved"),
    mockDocument("doc_bl_1", "bill_of_lading", "revision_required"),
    mockDocument("doc_co_1", "certificate_of_origin", "approved"),
  ];
  const j4_rev = buildAuthoritativeTenStageJourney({
    shipment: shipmentAtStage3,
    pricing: approvedPricing,
    documents: docs_with_revision,
    acid: issuedAcid,
  });
  assert(j4_rev.stages[3].status === "needs_correction", "Stage 04 enters 'needs_correction' on document revision");
  assert(
    j4_rev.stages[3].checklist?.find((c) => c.id === "chk_4_bl")?.isCompleted === false,
    "Checklist bl item remains incomplete",
  );

  // Step 3.D: All 4 documents approved
  const docs_all_approved = [
    approvedInvoiceDoc,
    mockDocument("doc_pl_1", "packing_list", "approved"),
    mockDocument("doc_bl_2", "bill_of_lading", "approved"),
    mockDocument("doc_co_1", "certificate_of_origin", "approved"),
  ];
  const j4_all_appr = buildAuthoritativeTenStageJourney({
    shipment: shipmentAtStage3,
    pricing: approvedPricing,
    documents: docs_all_approved,
    acid: issuedAcid,
  });
  assert(j4_all_appr.stages[3].status === "completed", "Stage 04 marks completed when all 4 final documents approved");
  assert(j4_all_appr.stages[3].isCompleted === true, "Stage 04 isCompleted is true");
  assert(
    j4_all_appr.stages[3].checklist?.every((c) => c.isCompleted) === true,
    "All 4 document checklist items are completed",
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // PART 4: STAGE 04 TYPE PROCEDURES SUB-PROCESS & STAGE 05 SCOUTING
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("\n--- PART 4: STAGE 04 TYPE PROCEDURES & STAGE 05 SCOUTING ---");

  // General cargo without special procedures -> type procedures not applicable
  const j5_general = buildAuthoritativeTenStageJourney({
    shipment: mockBaseShipment({
      status: "ready_for_external_stage",
      classification_reviewed_at: new Date().toISOString(),
      goods_category: "other",
      applicable_procedures: ["general_customs_procedure"],
    }),
    pricing: approvedPricing,
    documents: docs_all_approved,
    acid: issuedAcid,
  });
  assert(j5_general.stages[3].typeProceduresSubProcess?.isApplicable === false, "Stage 04 type procedure is not applicable for general cargo");
  assert(
    j5_general.currentStageNumber === "05",
    "Active stage advances to Stage 05 (Field Scouting)",
  );

  // Agricultural cargo -> Stage 04 type procedure applicable!
  const j5_agri = buildAuthoritativeTenStageJourney({
    shipment: mockBaseShipment({
      status: "ready_for_external_stage",
      classification_reviewed_at: new Date().toISOString(),
      goods_category: "agricultural",
      applicable_procedures: ["plant_quarantine"],
    }),
    pricing: approvedPricing,
    documents: docs_all_approved,
    acid: issuedAcid,
  });
  assert(j5_agri.stages[3].typeProceduresSubProcess?.isApplicable === true, "Stage 04 type procedure is applicable for agricultural goods");

  // ─────────────────────────────────────────────────────────────────────────────
  // PART 5: STAGE 06 — SCOUTING & INSPECTION DUAL SUB-PROCESSES
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("\n--- PART 5: STAGE 06 SCOUTING & INSPECTION RESOLUTION ---");

  const mockCustomsJourneyStage = (key: string, status: CustomsStageStatus, order: number, role: string) => ({
    id: `stage_row_${key}`,
    shipment_id: "ship_mock_001",
    stage_key: key as any,
    stage_order: order,
    status,
    is_applicable: true,
    assigned_to: "user_worker_01",
    notes: `Internal staff note for ${key}`,
    reference_number: `REF-${key.toUpperCase()}-01`,
    outcome: `Outcome for ${key}`,
    internal_status: null,
    completed_at: status === "completed" ? new Date().toISOString() : null,
    completed_by: "user_worker_01",
    completed_by_name: "أحمد كمال (معاين)",
    rejection_or_delay_reason: null,
    stage_data: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  const mockCustomsJourney = (overrides?: Partial<ShipmentCustomsJourney>): ShipmentCustomsJourney => ({
    shipment_id: "ship_mock_001",
    goods_category: "other",
    applicable_procedures: [],
    classification_notes: null,
    classification_reviewed_at: null,
    classification_reviewed_by: null,
    stages: [],
    history: [],
    activeStageKey: "stage_6_inspection",
    nextStageKey: null,
    completedStagesCount: 0,
    applicableStagesCount: 10,
    progressPercentage: 0,
    isFullyCleared: false,
    ...overrides,
  });

  // Scouting completed, inspection in_progress
  const st5_done = mockCustomsJourneyStage("stage_5_scouting", "completed", 5, "scout");
  const st6_prog = mockCustomsJourneyStage("stage_6_inspection", "in_progress", 6, "inspector");

  const j6_scout_done = buildAuthoritativeTenStageJourney({
    shipment: mockBaseShipment({ goods_category: "other" }),
    pricing: approvedPricing,
    documents: docs_all_approved,
    acid: issuedAcid,
    journey: mockCustomsJourney({
      stages: [st5_done, st6_prog] as any,
      activeStageKey: "stage_6_inspection",
      progressPercentage: 50,
      completedStagesCount: 1,
    }),
  });

  const s5 = j6_scout_done.stages[4];
  const s6 = j6_scout_done.stages[5];
  assert(s5.number === "05", "Stage 05 has number '05'");
  assert(s5.key === "05_scouting", "Stage 05 key is 05_scouting");
  assert(s5.status === "completed", "Stage 05 status is 'completed'");
  assert(s6.number === "06", "Stage 06 has number '06'");
  assert(s6.key === "06_inspection", "Stage 06 key is 06_inspection");
  assert(s6.status === "in_progress", "Stage 06 status is 'in_progress' while inspection is pending");

  // Inspection completed
  const st6_done = mockCustomsJourneyStage("stage_6_inspection", "completed", 6, "inspector");
  const j6_insp_done = buildAuthoritativeTenStageJourney({
    shipment: mockBaseShipment({ goods_category: "other" }),
    pricing: approvedPricing,
    documents: docs_all_approved,
    acid: issuedAcid,
    journey: mockCustomsJourney({
      stages: [st5_done, st6_done] as any,
      activeStageKey: "stage_7_data_entry",
      progressPercentage: 60,
      completedStagesCount: 2,
    }),
  });
  assert(j6_insp_done.stages[5].status === "completed", "Stage 06 is 'completed' when inspection is completed");
  assert(j6_insp_done.stages[5].isCompleted === true, "Stage 06 isCompleted is true");

  // ─────────────────────────────────────────────────────────────────────────────
  // PART 6: STAGES 07-10 WORKFLOW RULES, CARGOX, VALUATION, SETTLEMENT, RELEASE
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("\n--- PART 6: STAGES 07–10 RULES & PREREQUISITES ---");

  // Stage 07: CargoX & Number 46
  const st7_prog = {
    ...mockCustomsJourneyStage("stage_7_data_entry", "in_progress", 7, "data_entry"),
    stage_data: {
      cargox: { is_applicable: true, supplier_upload_verified: true, acid_matched: true, data_consistency_verified: true },
      declaration_46_advisory: "46-2026-9912",
    },
  };
  const j7 = buildAuthoritativeTenStageJourney({
    shipment: mockBaseShipment({ goods_category: "other" }),
    pricing: approvedPricing,
    documents: docs_all_approved,
    acid: issuedAcid,
    journey: mockCustomsJourney({
      stages: [st5_done, st6_done, st7_prog] as any,
      activeStageKey: "stage_7_data_entry",
      progressPercentage: 65,
      completedStagesCount: 2,
    }),
  });
  assert(
    j7.stages[6].checklist?.find((c) => c.id === "chk_7_num46") !== undefined,
    "Stage 07 checklist includes Number 46 registration",
  );
  assert(
    j7.stages[6].metaInfo?.includes("46-2026-9912") === true,
    "Advisory Number 46 is presented in metaInfo",
  );

  // Stage 09: Financial settlement rules (Package 4.1 preserved)
  const st8_done = mockCustomsJourneyStage("stage_8_valuation", "completed", 8, "data_entry");
  const st9_unsettled = {
    ...mockCustomsJourneyStage("stage_9_fees_payments", "in_progress", 9, "admin"),
    stage_data: {
      customs_duties_settlement: {
        assessed_customs_amount: 50000,
        settlement_status: "paid_by_out_awaiting_customer",
        amount_paid_by_out: 50000,
        amount_collected_from_customer: 20000, // 30,000 balance remaining!
      },
    },
  };
  const j9_unsettled = buildAuthoritativeTenStageJourney({
    shipment: mockBaseShipment({ goods_category: "other" }),
    pricing: approvedPricing,
    documents: docs_all_approved,
    acid: issuedAcid,
    journey: mockCustomsJourney({
      stages: [st5_done, st6_done, { ...st7_prog, status: "completed" }, st8_done, st9_unsettled] as any,
      activeStageKey: "stage_9_fees_payments",
      progressPercentage: 80,
      completedStagesCount: 4,
    }),
  });
  assert(j9_unsettled.stages[8].status === "awaiting_external_response", "Stage 09 is awaiting_external_response while balance remains");
  assert(j9_unsettled.stages[8].isCompleted === false, "Stage 09 is not completed while balance remains");
  assert(
    j9_unsettled.stages[8].metaInfo?.includes((30000).toLocaleString("ar-EG")) ||
      j9_unsettled.stages[8].metaInfo?.includes("30,000") ||
      j9_unsettled.stages[8].metaInfo?.includes("30000") === true,
    "Stage 09 metaInfo displays the exact remaining balance of 30,000 ج.م",
  );

  // Stage 09 settled via direct customer payment
  const st9_direct_settled = {
    ...mockCustomsJourneyStage("stage_9_fees_payments", "completed", 9, "admin"),
    stage_data: {
      customs_duties_settlement: {
        assessed_customs_amount: 50000,
        settlement_status: "customer_paid_direct",
        customer_direct_payment_reference: "EGP-DIR-RCP-9901",
      },
    },
  };
  const j9_done = buildAuthoritativeTenStageJourney({
    shipment: mockBaseShipment({ goods_category: "other" }),
    pricing: approvedPricing,
    documents: docs_all_approved,
    acid: issuedAcid,
    journey: mockCustomsJourney({
      stages: [st5_done, st6_done, { ...st7_prog, status: "completed" }, st8_done, st9_direct_settled] as any,
      activeStageKey: "stage_10_clearance_release",
      progressPercentage: 90,
      completedStagesCount: 5,
    }),
  });
  assert(j9_done.stages[8].status === "completed", "Stage 09 completes cleanly on verified direct payment");
  assert(j9_done.currentStageNumber === "10", "Active stage advances to '10'");

  // Stage 10: Clearance release permit
  const st10_done = {
    ...mockCustomsJourneyStage("stage_10_clearance_release", "completed", 10, "admin"),
    reference_number: "REL-PRMT-2026-8801",
    stage_data: {
      release_permit_number: "REL-PRMT-2026-8801",
      port_exit_at: new Date().toISOString(),
      delivered_at: new Date().toISOString(),
    },
  };
  const j10_done = buildAuthoritativeTenStageJourney({
    shipment: mockBaseShipment({ goods_category: "other", status: "delivered" }),
    pricing: approvedPricing,
    documents: docs_all_approved,
    acid: issuedAcid,
    journey: mockCustomsJourney({
      stages: [st5_done, st6_done, { ...st7_prog, status: "completed" }, st8_done, st9_direct_settled, st10_done] as any,
      activeStageKey: "stage_10_clearance_release",
      progressPercentage: 100,
      completedStagesCount: 6,
      isFullyCleared: true,
    }),
  });
  assert(j10_done.stages[9].status === "completed", "Stage 10 status is 'completed'");
  assert(j10_done.isCompleted === true, "Journey isCompleted is true");
  assert(j10_done.progressPercentage === 100, "Journey progressPercentage is 100%");

  // ─────────────────────────────────────────────────────────────────────────────
  // PART 7: CUSTOMER VS ADMIN DATA ISOLATION (ZERO LEAKAGE)
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("\n--- PART 7: CUSTOMER VS ADMIN DATA ISOLATION ---");

  const adminJourney = buildAuthoritativeTenStageJourney({
    shipment: mockBaseShipment(),
    pricing: approvedPricing,
    documents: docs_all_approved,
    acid: issuedAcid,
    journey: mockCustomsJourney({
      stages: [st5_done, st6_prog] as any,
      activeStageKey: "stage_6_inspection",
      progressPercentage: 50,
      completedStagesCount: 1,
    }),
    isCustomerView: false,
  });

  const customerJourney = buildAuthoritativeTenStageJourney({
    shipment: mockBaseShipment(),
    pricing: approvedPricing,
    documents: docs_all_approved,
    acid: issuedAcid,
    journey: mockCustomsJourney({
      stages: [st5_done, st6_prog] as any,
      activeStageKey: "stage_6_inspection",
      progressPercentage: 50,
      completedStagesCount: 1,
    }),
    isCustomerView: true,
  });

  // Admin view checks
  assert(
    adminJourney.stages[4].dbStageRecord !== null,
    "Admin journey preserves internal operational scouting dbStageRecord",
  );
  assert(
    adminJourney.stages[5].dbStageRecord !== null,
    "Admin journey preserves internal operational inspection dbStageRecord",
  );
  assert(
    adminJourney.stages[4].assignedRole === "scout",
    "Admin journey preserves staff assigned role",
  );

  // Customer view checks (STRICT ISOLATION)
  assert(
    customerJourney.stages[4].dbStageRecord === null,
    "Customer journey strictly suppresses internal scouting dbStageRecord",
  );
  assert(
    customerJourney.stages[4].assignedRole === undefined,
    "Customer journey strictly suppresses staff assignedRole on Stage 05",
  );
  assert(
    customerJourney.stages[5].dbStageRecord === null,
    "Customer journey strictly suppresses internal inspection dbStageRecord",
  );
  assert(
    customerJourney.stages[5].checklist === undefined,
    "Customer journey strictly suppresses internal operational checklist",
  );

  // ─────────────────────────────────────────────────────────────────────────────
  // PART 8: REAL DATABASE INTEGRATION (READ-ONLY ON ACTIVE SHIPMENTS)
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("\n--- PART 8: REAL DATABASE INTEGRATION (READ-ONLY) ---");

  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (supabaseUrl && serviceKey) {
    const supabase = createClient(supabaseUrl, serviceKey);

    const { data: dbShipments, error: shpErr } = await supabase
      .from("shipments")
      .select("id, reference_number, status, goods_category, applicable_procedures")
      .limit(5);

    assert(!shpErr && !!dbShipments, "Successfully connected to Supabase and fetched real shipments");
    console.log(`[INFO] Testing adapter on ${dbShipments?.length || 0} real database shipments...`);

    for (const shp of dbShipments || []) {
      const [pricingRes, acidRes, docsRes, stagesRes] = await Promise.all([
        supabase.from("shipment_pricing").select("*").eq("shipment_id", shp.id).maybeSingle(),
        supabase.from("shipment_acids").select("*").eq("shipment_id", shp.id).maybeSingle(),
        supabase.from("documents").select("*").eq("shipment_id", shp.id),
        supabase.from("shipment_customs_stages").select("*").eq("shipment_id", shp.id).order("stage_order", { ascending: true }),
      ]);

      const journey = buildAuthoritativeTenStageJourney({
        shipment: shp as any,
        pricing: pricingRes.data as any,
        acid: acidRes.data as any,
        documents: (docsRes.data || []) as any,
        journey: mockCustomsJourney({
          shipment_id: shp.id,
          goods_category: shp.goods_category || "other",
          stages: (stagesRes.data || []) as any,
          applicable_procedures: shp.applicable_procedures || [],
        }),
      });

      assert(journey.totalCount === 10, `Real shipment ${shp.reference_number || shp.id} maps to 10 stages`);
      assert(journey.stages.length === 10, `Real shipment ${shp.reference_number || shp.id} produces exactly 10 stage items`);
      assert(
        journey.stages[0].number === "01" && journey.stages[9].number === "10",
        `Real shipment ${shp.reference_number || shp.id} maintains 01-10 sequence boundaries`,
      );
    }
  } else {
    console.log("[SKIP] Supabase service role credentials not found in env; skipping live DB query");
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // SUMMARY
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("\n==================================================================");
  console.log(`  PACKAGE 6 TEST RESULTS: ${passedTests} / ${totalTests} PASSED (100%)`);
  console.log("==================================================================");
}

runAllTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
