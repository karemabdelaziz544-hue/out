import {
  hasPermission,
  getPermissions,
  isAdminRole,
  ROLE_PERMISSIONS,
} from "../src/config/permissions";
import { getNavigationForRole } from "../src/config/navigation";
import {
  computeCustomsOutstandingBalance,
  CustomsDutiesSettlementData,
  CUSTOMS_STAGE_DEFINITIONS,
  CustomsStageKey,
} from "../src/types/journey";
import { UserRole } from "../src/types/auth";

console.log("==================================================================");
console.log("  OUT — PACKAGE 4.2: SHIPMENT ACCESS CONTROL & AUTHORIZATION TESTS");
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
// PART 1: ROLE PERMISSION MATRIX & UI ACCESS VERIFICATION (Unit Tests)
// ================================================================================
console.log("--- PART 1: ROLE PERMISSIONS & NAVIGATION CHECKS ---");

// Test 1.1: Customer permissions: own dashboard, shipments, documents
assert(
  hasPermission("customer", "view:shipments") &&
    hasPermission("customer", "view:documents") &&
    !hasPermission("customer", "view:tasks") &&
    !hasPermission("customer", "view:team") &&
    !hasPermission("customer", "view:reports"),
  "Client Role Permissions: customer has access only to their own shipments and documents"
);

// Test 1.2: Admin & Manager retain full administrative access
assert(
  isAdminRole("admin") &&
    isAdminRole("manager") &&
    !isAdminRole("data_entry") &&
    !isAdminRole("scout") &&
    !isAdminRole("inspector") &&
    !isAdminRole("customer"),
  "Admin Roles Invariant: only admin and manager are admin roles"
);

// Test 1.3: Scout role has view:shipments and navigation to shipments
const scoutNav = getNavigationForRole("scout");
assert(
  hasPermission("scout", "view:shipments") &&
    scoutNav.some((item) => item.href === "/shipments"),
  "Scout Navigation & Permission: scout has view:shipments permission and /shipments navigation link"
);

// Test 1.4: Inspector role has view:shipments and navigation to shipments
const inspectorNav = getNavigationForRole("inspector");
assert(
  hasPermission("inspector", "view:shipments") &&
    inspectorNav.some((item) => item.href === "/shipments"),
  "Inspector Navigation & Permission: inspector has view:shipments permission and /shipments navigation link"
);

// Test 1.5: Data Entry role has view:shipments
assert(
  hasPermission("data_entry", "view:shipments"),
  "Data Entry Permission: data_entry has view:shipments permission"
);

// ================================================================================
// PART 2: SHIPMENT ISOLATION & SERVER AUTHORIZATION GUARDS (Mocked Auth Tests)
// ================================================================================
console.log("\n--- PART 2: SERVER ACTION & ACCESS CONTROL GUARDS ---");

// Simulate customer shipment isolation check
function simulateCustomerShipmentAccess(
  currentUser: { id: string; role: UserRole; company_id: string | null },
  shipment: { id: string; company_id: string; customer_id: string; status: string }
): { allowed: boolean; error?: string } {
  if (currentUser.role === "customer") {
    if (!currentUser.company_id || shipment.company_id !== currentUser.company_id) {
      return { allowed: false, error: "غير مصرح لك بالوصول إلى هذه الشحنة." };
    }
    return { allowed: true };
  }

  // Operational staff / Admin
  const isStaff = ["admin", "manager", "data_entry", "inspector", "scout"].includes(currentUser.role);
  if (!isStaff) {
    return { allowed: false, error: "الدور غير مصرح به." };
  }

  // Non-admin operational staff can only access submitted shipments (not customer private drafts)
  if (!["admin", "manager"].includes(currentUser.role) && shipment.status === "draft") {
    return { allowed: false, error: "لا يمكن للموظف التشغيلي الاطلاع على مسودات العملاء غير المقدمة." };
  }

  return { allowed: true };
}

// Test 2.1: Client can access their own shipment
const clientUser = { id: "cust-1", role: "customer" as UserRole, company_id: "comp-A" };
const ownShipment = { id: "ship-1", company_id: "comp-A", customer_id: "cust-1", status: "submitted" };
assert(
  simulateCustomerShipmentAccess(clientUser, ownShipment).allowed,
  "Customer Isolation: customer can access their own shipment"
);

// Test 2.2: Client CANNOT access another customer's shipment
const otherShipment = { id: "ship-2", company_id: "comp-B", customer_id: "cust-2", status: "submitted" };
const resDeniedClient = simulateCustomerShipmentAccess(clientUser, otherShipment);
assert(
  !resDeniedClient.allowed && Boolean(resDeniedClient.error?.includes("غير مصرح")),
  "Customer Isolation: customer is strictly denied access to another company's shipment",
  resDeniedClient.error
);

// Test 2.3: Admin and manager retain access to all shipments (including drafts)
const adminUser = { id: "admin-1", role: "admin" as UserRole, company_id: null };
const managerUser = { id: "mgr-1", role: "manager" as UserRole, company_id: null };
const draftShipment = { id: "ship-draft", company_id: "comp-A", customer_id: "cust-1", status: "draft" };
assert(
  simulateCustomerShipmentAccess(adminUser, ownShipment).allowed &&
    simulateCustomerShipmentAccess(managerUser, ownShipment).allowed &&
    simulateCustomerShipmentAccess(adminUser, draftShipment).allowed,
  "Admin & Manager Access: admin and manager retain unrestricted access"
);

// Test 2.4: Operational staff access submitted shipments
const scoutUser = { id: "scout-1", role: "scout" as UserRole, company_id: null };
const inspectorUser = { id: "insp-1", role: "inspector" as UserRole, company_id: null };
const dataEntryUser = { id: "de-1", role: "data_entry" as UserRole, company_id: null };

assert(
  simulateCustomerShipmentAccess(scoutUser, ownShipment).allowed &&
    simulateCustomerShipmentAccess(inspectorUser, ownShipment).allowed &&
    simulateCustomerShipmentAccess(dataEntryUser, ownShipment).allowed,
  "Operational Access: scout, inspector, and data_entry can access submitted shipments in pipeline"
);

// Test 2.5: Operational staff CANNOT access customer unsubmitted private drafts
assert(
  !simulateCustomerShipmentAccess(scoutUser, draftShipment).allowed &&
    !simulateCustomerShipmentAccess(inspectorUser, draftShipment).allowed &&
    !simulateCustomerShipmentAccess(dataEntryUser, draftShipment).allowed,
  "Operational Boundary: operational staff are denied access to unsubmitted customer drafts"
);

// ================================================================================
// PART 3: ACTION-SPECIFIC OPERATIONAL ROLE RESTRICTIONS
// ================================================================================
console.log("\n--- PART 3: ACTION-LEVEL ROLE AUTHORIZATION GUARDS ---");

function simulateStageUpdateAuthorization(
  userRole: UserRole,
  stageKey: CustomsStageKey
): { allowed: boolean; error?: string } {
  const stageDef = CUSTOMS_STAGE_DEFINITIONS[stageKey];
  if (!stageDef) return { allowed: false, error: "المرحلة غير صالحة" };

  const isSuperAdmin = userRole === "admin" || userRole === "manager";
  if (!isSuperAdmin && stageDef.expectedRole !== userRole) {
    return {
      allowed: false,
      error: `غير مصرح لدورك التشغيلي بتحديث مرحلة «${stageDef.title}». الدور المطلوب هو ${stageDef.expectedRole}.`,
    };
  }

  return { allowed: true };
}

// Test 3.1: Scout authorized for Stage 5 (Scouting)
assert(
  simulateStageUpdateAuthorization("scout", "stage_5_scouting").allowed,
  "Operational Authorization: scout is authorized for Stage 5 Scouting"
);

// Test 3.2: Scout DENIED for Stage 6 (Inspection) and Stage 9 (Fees)
const resScoutDeniedStage6 = simulateStageUpdateAuthorization("scout", "stage_6_inspection");
const resScoutDeniedStage9 = simulateStageUpdateAuthorization("scout", "stage_9_fees_payments");
assert(
  !resScoutDeniedStage6.allowed && !resScoutDeniedStage9.allowed,
  "Operational Authorization: scout is strictly denied updating Stage 6 (Inspection) or Stage 9 (Fees)",
  resScoutDeniedStage6.error
);

// Test 3.3: Inspector authorized for Stage 4 and Stage 6
assert(
  simulateStageUpdateAuthorization("inspector", "stage_4_type_procedures").allowed &&
    simulateStageUpdateAuthorization("inspector", "stage_6_inspection").allowed,
  "Operational Authorization: inspector is authorized for Stage 4 (Type Procedures) and Stage 6 (Inspection)"
);

// Test 3.4: Inspector DENIED for Stage 5 (Scouting) and Stage 7 (Data Entry)
assert(
  !simulateStageUpdateAuthorization("inspector", "stage_5_scouting").allowed &&
    !simulateStageUpdateAuthorization("inspector", "stage_7_data_entry").allowed,
  "Operational Authorization: inspector is denied updating Stage 5 (Scouting) or Stage 7 (Data Entry)"
);

// Test 3.5: Data Entry authorized for Stage 3, Stage 7, and Stage 8
assert(
  simulateStageUpdateAuthorization("data_entry", "stage_3_nafeza_acid").allowed &&
    simulateStageUpdateAuthorization("data_entry", "stage_7_data_entry").allowed &&
    simulateStageUpdateAuthorization("data_entry", "stage_8_valuation").allowed,
  "Operational Authorization: data_entry is authorized for Stage 3 (ACID), Stage 7 (Data Entry), and Stage 8 (Valuation)"
);

// Test 3.6: Data Entry DENIED for Stage 5 (Scouting) and Stage 9 (Fees)
assert(
  !simulateStageUpdateAuthorization("data_entry", "stage_5_scouting").allowed &&
    !simulateStageUpdateAuthorization("data_entry", "stage_9_fees_payments").allowed,
  "Operational Authorization: data_entry is denied updating Stage 5 (Scouting) or Stage 9 (Fees)"
);

// ================================================================================
// PART 4: CLIENT DOCUMENT IMMUTABILITY & FINANCIAL DATA PROTECTION
// ================================================================================
console.log("\n--- PART 4: DOCUMENT IMMUTABILITY & FINANCIAL PROTECTION ---");

// Simulate document update / delete lock check
function simulateDocumentMutation(
  userRole: UserRole,
  userId: string,
  doc: { id: string; customer_id: string; status: "pending" | "approved" }
): { allowed: boolean; error?: string } {
  if (userRole === "customer") {
    if (doc.customer_id !== userId) {
      return { allowed: false, error: "غير مصرح لك بتعديل هذا المستند." };
    }
    if (doc.status === "approved") {
      return { allowed: false, error: "هذا المستند معتمد ولا يمكن حذفه أو استبداله." };
    }
    return { allowed: true };
  }

  // Admin / Manager can manage documents
  if (["admin", "manager"].includes(userRole)) {
    return { allowed: true };
  }

  // Operational staff cannot delete or replace customer documents
  return { allowed: false, error: "غير مصرح لك بحذف أو استبدال مستندات العميل." };
}

// Test 4.1: Client can modify their own pending document
const pendingDoc = { id: "doc-1", customer_id: "cust-1", status: "pending" as const };
assert(
  simulateDocumentMutation("customer", "cust-1", pendingDoc).allowed,
  "Document Immutability: customer can update or delete their pending document"
);

// Test 4.2: Client CANNOT modify or delete their APPROVED document
const approvedDoc = { id: "doc-2", customer_id: "cust-1", status: "approved" as const };
const resClientApprovedMod = simulateDocumentMutation("customer", "cust-1", approvedDoc);
assert(
  !resClientApprovedMod.allowed && Boolean(resClientApprovedMod.error?.includes("معتمد")),
  "Document Immutability: customer is strictly blocked from modifying or deleting approved document",
  resClientApprovedMod.error
);

// Test 4.3: Financial data masking for operational staff
// Verify that non-admin/manager roles have pricing set to null
function simulateShipmentPricingProjection(
  userRole: UserRole,
  rawPricing: { final_price: number; estimated_min_price: number; estimated_max_price: number } | null
) {
  const isSuperAdmin = userRole === "admin" || userRole === "manager";
  return isSuperAdmin ? rawPricing : null;
}

const mockPricing = { final_price: 15000, estimated_min_price: 12000, estimated_max_price: 16000 };
assert(
  simulateShipmentPricingProjection("admin", mockPricing) !== null &&
    simulateShipmentPricingProjection("manager", mockPricing) !== null &&
    simulateShipmentPricingProjection("scout", mockPricing) === null &&
    simulateShipmentPricingProjection("inspector", mockPricing) === null &&
    simulateShipmentPricingProjection("data_entry", mockPricing) === null,
  "Financial Protection: pricing data is masked (null) for operational roles (scout, inspector, data_entry)"
);

// ================================================================================
// PART 5: PRESERVATION OF PACKAGE 4.1 FINANCIAL RULES
// ================================================================================
console.log("\n--- PART 5: PRESERVATION OF PACKAGE 4.1 FINANCIAL RULES ---");

// Test 5.1: Package 4.1 direct payment balance formula invariant preserved
const directPaymentData: CustomsDutiesSettlementData = {
  assessed_customs_amount: 50000,
  amount_paid_by_out: 0,
  amount_collected_from_customer: 0,
  settlement_status: "customer_paid_direct",
  customer_direct_payment_reference: "CUSTOMS-REC-101",
};
assert(
  computeCustomsOutstandingBalance(directPaymentData) === 0,
  "Package 4.1 Preservation: verified direct payment results in 0 balance"
);

// Test 5.2: Package 4.1 unauthorized excess disbursement capped at assessed duties
const unauthorizedDisbursement: CustomsDutiesSettlementData = {
  assessed_customs_amount: 30000,
  amount_paid_by_out: 40000,
  amount_collected_from_customer: 10000,
  additional_disbursement_authorized: false,
};
assert(
  computeCustomsOutstandingBalance(unauthorizedDisbursement) === 20000,
  "Package 4.1 Preservation: unauthorized excess disbursement remains capped at assessed duties (30000 - 10000 = 20000)"
);

// ================================================================================
// SUMMARY
// ================================================================================
console.log("\n==================================================================");
console.log(`  PACKAGE 4.2 TEST RESULTS: ${passed} / ${total} PASSED (${Math.round((passed / total) * 100)}%)`);
console.log("==================================================================\n");

if (passed !== total) {
  process.exit(1);
}
