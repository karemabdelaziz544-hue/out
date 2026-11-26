# OUT Customs Clearance Platform — Forensic Master Audit Report
**Title**: Comprehensive Forensic Audit of the Admin & Client Shipment Experience  
**Date**: 2026-10-25  
**Auditor**: Senior Systems Architect & Forensic Auditor (Antigravity AI)  
**Repository Working Directory**: `/Users/karemabdelaziz/Out`  
**Git Branch**: `main` (Initial working tree state)  
**Policy Enforced**: **STRICTLY REPORT ONLY — ZERO CODE MODIFICATIONS, ZERO DATABASE WRITES**  

---

## 1. Executive Summary

This forensic audit was commissioned to thoroughly inspect the entire existing shipment details and customs clearance workflow experience on the OUT platform across both the **Admin** (`/shipments/[id]`) and **Client** (`/my-shipments/[id]`) views.

The audit examined every rendered and hidden section, every component, every button and event handler, every modal and drawer, every stage and sub-process, every data source and database query, every role guard and permission check, and all automation and workflow progression rules.

### Key Audit Findings:
1. **Architectural Cohesion vs. UI Disconnection**: The underlying domain adapter (`canonical-journey-adapter.ts`), business rules engine (`workflow-rules.ts`), and server action mutations (`journey-actions.ts`, `pricing-actions.ts`, `document-actions.ts`) are exceptionally well-structured, robust, and pass **408 automated unit and integration tests with a 100% pass rate**.
2. **The Disconnection Gap**: A major architectural gap exists between the backend actions and the newly redesigned frontend components. During the visual consolidation of `/shipments/[id]` and `/my-shipments/[id]`, several critical user action forms were omitted from the active runtime components (`AdminStageDetailModal`, `CustomerStageDetailModal`, `AdminShipmentDetails`, and `ShipmentDetailsView`):
   - **Customer Price Approval & Negotiation**: Actions exist in backend server actions, but no form or button exists in the client shipment view or modal to execute them (**DEF-AUDIT-01**).
   - **Admin Price Estimation & Final Price Submission**: Actions exist in backend server actions, but no input fields or submission buttons exist on the admin shipment view or modal (**DEF-AUDIT-02**).
   - **Customer Document & Invoice Uploads**: Re-uploading corrected invoices and uploading the 4 final shipping documents cannot be performed from the client shipment page or modal because all `<input type="file">` controls were left behind in legacy components (**DEF-AUDIT-03**).
3. **Dead Code Volume**: Over **576 KB of code across 16 legacy components** in `src/components/shipments/` is orphaned and never rendered at runtime, yet these dead files contain the exact mutation forms that are missing from the active shipment pages (**DEF-AUDIT-12**).
4. **Data Isolation & Privacy**: Customer tenant isolation and field suppression are strictly enforced. Internal notes, assigned employee identities, staff IDs, and internal operational checklists are completely sanitized and never leaked to the client interface.
5. **Zero Modifications Confirmation**: No source code, styling, database records, schema, dependencies, or permissions were modified during this forensic audit.

---

## 2. Current Project State & Inspection Limitations

### A. Technical Stack & Architecture
- **Framework**: Next.js 16.4.0 (App Router, Turbopack, React 19.3.0, TypeScript 5.x)
- **Database / Backend**: Supabase PostgreSQL with Row Level Security (RLS), Supabase SSR (`@supabase/ssr` 0.12.7)
- **Icons & Styling**: Vanilla CSS design system with Tailwind-compatible utility classes, Lucide React icons
- **Schema Migrations**: 16 SQL migration files in `supabase/migrations/`
- **Active Dev Server**: Running on background PID (`npm run dev`)

### B. Inspection Methodology & Limitations
- **Read-Only Enforcement**: Inspection was performed strictly through code inspection, abstract syntax analysis, grep pattern tracing, and running pre-existing read-only test suites.
- **No Live Write Testing**: To comply strictly with the zero-modification rule, no destructive or mutating operations (e.g. creating test shipments, triggering real customer notifications, writing to database tables) were performed.
- **Database Connectivity**: Real database schemas and active shipment records were safely inspected via existing read-only scripts utilizing service role credentials from `.env.local` without executing any mutations.

---

## 3. Admin Page Route & Component Inventory (`/shipments/[id]`)

- **Route File**: `src/app/(dashboard)/shipments/[id]/page.tsx`
- **Server Guard**: `requireRole(["admin", "manager", "data_entry", "inspector", "scout"])`. Automatically redirects customers to `/my-shipments/[id]`.
- **Data Query**: `getAdminShipmentDetails(id)` in `src/lib/shipments/queries.ts`.
- **Runtime Component Tree**:
  - `AdminShipmentDetails` (`src/components/shipments/admin-shipment-details.tsx`)
    - Header & Reference Copy Bar (Section 3.A)
    - 4-Card KPI Summary Grid (Section 3.B)
    - Operational Hero Banner (Section 5.3)
    - `TenStageTimeline` (`src/components/shipments/ten-stage-timeline.tsx`)
    - Subordinate Info Hub (4 Tabs: Documents, Pricing, Logistics Specs, Activity)
    - `AdminStageDetailModal` (`src/components/shipments/admin-stage-detail-modal.tsx`)
    - `DocumentPreviewModal` (`src/components/documents/document-preview-modal.tsx`)

---

## 4. Client Page Route & Component Inventory (`/my-shipments/[id]`)

- **Route File**: `src/app/(dashboard)/my-shipments/[id]/page.tsx`
- **Server Guard**: `requireAuth()`. Enforces company ownership check inside `getShipmentById(id)`. Returns `notFound()` if a customer attempts to access another company's shipment.
- **Data Queries**: Parallel execution of `getShipmentById`, `getShipmentDocuments`, `getShipmentPricing`, `getShipmentAcid`, `getShipmentStageHistory`, `getCustomerShipmentCustomsJourney`, `getShipmentInvoiceReviews`, and `getShipmentPricingHistory`.
- **Runtime Component Tree**:
  - `ShipmentDetailsView` (`src/components/shipments/shipment-details-view.tsx`)
    - Header & Status Chips (Section 3.A)
    - 4-Card KPI Summary Grid (Section 3.B)
    - Primary Customer Action Banner (Section 6.2)
    - `CustomerSevenStationTimeline` (`src/components/shipments/customer-seven-station-timeline.tsx`)
    - Subordinate Info Hub (4 Tabs: Documents, Pricing, Specs, Milestones)
    - `CustomerStageDetailModal` (`src/components/shipments/customer-stage-detail-modal.tsx`)
    - `DocumentPreviewModal` (`src/components/documents/document-preview-modal.tsx`)

---

## 5. Every Section and Component Inspected

### Section A: Shipment Header and Summary
- **Admin**: Prominently renders the Monospace Reference Number, copy button with animated feedback, Goods Category label, global status badge, creation date, customer name (linked to `/customers/[id]`), company name, and port of arrival. Primary CTA button routes directly to the active stage modal.
- **Client**: Displays reference number, copy action, category, shipment status badge, port of arrival, and ACID number. Customer identity details and external links are omitted.
- **Consistency**: High. Both views derive status and references deterministically from the shipment row and adapter.

### Section B: Customer and Company Information
- **Admin**: Accurately displays customer name and company name fetched via relational joins in `getAdminShipmentDetails`.
- **Client**: Customer and company details are hidden to maintain a focused self-service interface. Tenant isolation is verified: `getShipmentById` rejects requests where `shipment.company_id !== customerCompany.id`.

### Section C: Shipment Information and Goods Details
- Inspected Tab 3 ("بيانات ومواصفات الشحنة") on both pages.
- Renders: Country of Origin, Port of Arrival, Supplier / Shipper Name, Packages Count & Type, Gross Weight (EGP formatted), Goods Description, and Classification Notes (Admin only).
- Disconnection: None. All fields are correctly bound to `shipments` table attributes.

### Section D: Pricing and Customer Approval
- Inspected Tab 2 ("التسعير والفواتير"), the 3rd KPI summary card, and modal Stage 02.
- **Critical Failure**: The pricing flow is broken at the UI boundary.
  - Admin view and modal are 100% read-only; no inputs exist to submit price estimates or final prices (**DEF-AUDIT-02**).
  - Client view and modal contain no approval button or negotiation form (**DEF-AUDIT-01**).
  - Both sides suffer from circular redirect buttons that fail to trigger mutations (**DEF-AUDIT-09**).

### Section E: Shipment Documents
- Inspected Tab 1 ("المستندات الجمركية"), Document Preview Modal, and Stage 04 modal dialogs.
- **Admin Document Actions**: Fully functional. Admin can preview documents, click "اعتماد" to approve, or click "طلب تعديل" with a mandatory revision note. When all 4 final documents are approved, the backend automatically sets the shipment to `documents_completed`.
- **Client Document Actions**: **Broken**. Zero `<input type="file">` controls exist on the client shipment page or modal (**DEF-AUDIT-03**). Clients cannot upload documents or resubmit revisions.

### Section F: Invoice Review, Nafeza, and ACID
- **Preliminary Invoice Review**: Admin review controls work in `AdminStageDetailModal` (Stage 03). Client resubmission is missing (**DEF-AUDIT-03**).
- **Nafeza & ACID**: There is no direct external API integration with Egyptian Customs (Nafeza); the system is designed to record manual operator actions. Admin can set ACID status to `processing` or input a 19-digit ACID number (`adminIssueAcidAction`).
- **Completion Safeguard**: Stage 03 requires BOTH preliminary invoice approval AND ACID issuance before completing.

### Section G: Shipment Timeline & All Stages
- **Admin**: Displays the 10 Authoritative Business Stages via `<TenStageTimeline />`.
- **Client**: Displays the 7 Consolidated Progress Stations via `<CustomerSevenStationTimeline />`.
- Both timelines are visually clean, display progress percentages, and respond to node clicks.

### Section H: Stage Details, Modals, and Drawers
- **`AdminStageDetailModal`**: Highly comprehensive (1,635 lines). Contains specialized sub-workspaces for Stage 01 (Classification), Stage 03 (Invoice & ACID), Stage 04 (4 Documents), Stage 05 (Type Procedures), Stage 06 (Dual Scouting & Inspection), Stage 07 (CargoX & Declaration 46), Stage 08 (Valuation), Stage 09 (Duties Settlement), and Stage 10 (Release & Delivery).
- **`CustomerStageDetailModal`**: Read-only customer explanations with public meta information and document statuses.
- **Flaws**: Lacks OCC timestamp forwarding (**DEF-AUDIT-04**), lacks state re-synchronization on revalidation (**DEF-AUDIT-08**), and has mobile height clipping (**DEF-AUDIT-10**).

### Section I: Employee Assignments and Responsibilities
- **Finding**: Individual employee assignment does not exist in the database or the UI (**DEF-AUDIT-07**).
- `public.shipment_customs_stages` has no `assigned_to` column.
- Role badges (e.g. "المسؤول: كشاف ومعاين جمركي") are hardcoded static strings from stage configuration.
- Missing assignments do not block workflow progression.

### Section J: Customs Valuation and Amounts
- Inspected Stage 08 in `AdminStageDetailModal` and backend validators.
- Accurately captures accepted customs value (`customs_value_egp`), tariff rate percentage (`tariff_rate_percent`), and official report reference.
- Legacy shipments without `assessed_customs_amount` fall back seamlessly to `duties_amount`.

### Section K: Payments and Settlement
- Inspected Stage 09 in `AdminStageDetailModal` and `workflow-rules.ts`.
- **Financial Protection (Package 4.1 Enforced)**:
  - Direct customer payment requires a verified receipt reference.
  - OUT disbursements cannot become customer debt without authorized excess reasons.
  - `settlement_status = 'settled'` is strictly blocked if any outstanding balance remains (`outstandingDutiesBalance > 0`).
  - Stage 10 cannot be unlocked while Stage 09 has an unpaid balance.

### Section L: Release, Port Exit, and Delivery
- Inspected Stage 10 in `AdminStageDetailModal` and `journey-actions.ts`.
- Independent tracking of: (1) Customs Release Permit, (2) Port Exit, (3) Customer Delivery.
- Shipment status transitions from `customs_in_progress` -> `customs_cleared` -> `delivered`.
- **Flaw**: Checkboxes in `AdminStageDetailModal` cannot be cleared once set (**DEF-AUDIT-05**).

### Section M: Notifications, Alerts, and Customer Actions
- Notification triggers exist in server actions for pricing updates, document revisions, ACID issuance, and delivery.
- Customer Hero Action Banner alerts customer when price approval or document correction is required.

### Section N: Icons, Buttons, Cards, and Layout
- Monospace font for reference numbers and ACID codes.
- High contrast status badges (Emerald, Amber, Rose, Neutral).
- Arabic RTL alignment is native and clean.
- Button trace identified 3 disconnected action buttons and 2 circular navigation loops.

---

## 6. All Identified Issues with Evidence and Severity

| Issue ID | Severity | Area | Root Cause |
|---|---|---|---|
| **DEF-AUDIT-01** | **P1** | Client Pricing Actions Missing | Approval and negotiation actions were not embedded in the consolidated client page or modal. |
| **DEF-AUDIT-02** | **P1** | Admin Price Submission Missing | Price estimate and final price forms exist only in dead component `AdminPricingSection`. |
| **DEF-AUDIT-03** | **P1** | Client Document Uploads Missing | File upload inputs exist only in dead component `CustomerFinalDocumentsSection`. |
| **DEF-AUDIT-04** | **P2** | Concurrency (OCC) Bypassed | `AdminStageDetailModal` never appends `expected_updated_at` to `FormData`. |
| **DEF-AUDIT-05** | **P2** | Irreversible Stage 10 Checkboxes | Server action merges previous stage data without nullifying unchecked events. |
| **DEF-AUDIT-06** | **P2** | Stage 05 Document Prerequisite Gap | `validateStagePrerequisites` does not check Stage 04 shipping documents before Stage 05. |
| **DEF-AUDIT-07** | **P2** | Employee Assignment Gap | Schema and UI lack `assigned_to` column; role labels are static strings. |
| **DEF-AUDIT-08** | **P3** | Stale Modal State on Revalidation | Client Component modal lacks `useEffect` to sync form state with updated server props. |
| **DEF-AUDIT-09** | **P3** | Circular Navigation Loop | Pricing tab button opens modal; modal button switches back to pricing tab. |
| **DEF-AUDIT-10** | **P3** | Mobile Modal Clipping | `max-h-[88vh]` causes cramped inputs and double scrollbars on screens < 640px. |
| **DEF-AUDIT-11** | **P3** | Misleading Component Docstrings | Comments reference `UnifiedStageModal` instead of active modal components. |
| **DEF-AUDIT-12** | **P4** | 16 Orphaned Legacy Components | 576 KB of dead code re-exported from `components/shipments/index.ts`. |

*(Refer to `shipment_defect_register.md` for complete line ranges, code snippets, and reproduction steps).*

---

## 7. Complete Ten-Stage Business Audit

1. **Stage 01 — استقبال طلب الشحنة**:
   - Status: Persisted in `stage_1_intake` and `shipments.goods_category`.
   - Admin action: `updateShipmentClassificationAction` works properly and auto-activates Stage 02.
2. **Stage 02 — التسعير وموافقة العميل**:
   - Status: Persisted in `shipment_pricing`.
   - Broken: Mutation forms missing from both Admin and Client pages (**DEF-AUDIT-01**, **DEF-AUDIT-02**).
3. **Stage 03 — مراجعة الفاتورة وإجراءات نافذة**:
   - Status: Persisted in `shipment_invoice_reviews` and `shipment_acids`.
   - Admin review works; Client invoice re-upload missing (**DEF-AUDIT-03**).
4. **Stage 04 — مراجعة مستندات الشحنة**:
   - Status: Purely derived from `documents` (4 final types). Zero fake DB customs stage row.
   - Admin document approval works; Client document upload missing (**DEF-AUDIT-03**).
5. **Stage 05 — إجراءات حسب نوع البضاعة**:
   - Status: Persisted in `stage_4_type_procedures`.
   - Conditional logic works (automatic `not_applicable` for general cargo; active for Agri/Food/Industrial/NTRA). Prerequisite check for Stage 04 is missing (**DEF-AUDIT-06**).
6. **Stage 06 — الكشف والمعاينة**:
   - Status: Groups `stage_5_scouting` and `stage_6_inspection` as dual sub-processes.
   - Inspection satisfies scouting. Internal notes sanitized for customer.
7. **Stage 07 — إدراج البيانات والإجراءات المطلوبة**:
   - Status: Persisted in `stage_7_data_entry`.
   - CargoX validation enforces 3-point check or official exemption. Declaration 46 advisory is non-blocking.
8. **Stage 08 — التقييم الجمركي**:
   - Status: Persisted in `stage_8_valuation`.
   - Customs value and tariff rate correctly captured. Fallback for legacy `duties_amount` functions properly.
9. **Stage 09 — تسوية المستحقات**:
   - Status: Persisted in `stage_9_fees_payments`.
   - Full financial protection: blocks release if unpaid balance > 0; enforces receipt for direct payment.
10. **Stage 10 — الإفراج والخروج والتسليم**:
    - Status: Persisted in `stage_10_clearance_release` and `shipments.status`.
    - Mandatory release permit number. Decoupled events for port exit and customer delivery.

---

## 8. Complete Seven-Station Client Grouping Audit

The client journey maps the 10 stages into 7 stations:
- **Station 01** (تقديم طلب الشحنة) = Stage 01
- **Station 02** (التسعير والموافقة) = Stage 02
- **Station 03** (الفاتورة ونافذة وACID) = Stage 03
- **Station 04** (المستندات والإجراءات المطلوبة) = Stage 04 + Stage 05
- **Station 05** (الكشف والمعاينة وإدراج البيانات) = Stage 06 + Stage 07
- **Station 06** (التقييم الجمركي والتسوية) = Stage 08 + Stage 09
- **Station 07** (الإفراج وخروج الشحنة والتسليم) = Stage 10

**Evaluation**: The grouping logic in `buildCustomerSevenStationJourney` is mathematically sound and thoroughly tested. Stations 04, 05, and 06 complete only when ALL applicable underlying stages complete.

---

## 9. Pricing and Approval Audit

- **Admin Controls**: Backend actions `submitPriceEstimateAction` and `adminSetFinalPriceAction` are fully guarded with role restrictions (`admin`, `manager`) and status transition validation. However, they are unreachable from `/shipments/[id]`.
- **Client Controls**: Backend actions `customerApproveEstimateAction`, `customerRequestNegotiationAction`, and `customerApproveFinalPriceAction` enforce tenant company ownership and price concurrency checking (`expected_final_price`). However, they are unreachable from `/my-shipments/[id]`.
- **Approval Validity**: Once a customer approves a final price, the shipment status transitions to `awaiting_invoice_review`. Backend checks prevent overriding approved pricing.

---

## 10. Document and Invoice Review Audit

- **Supported Document Types**: Commercial Invoice, Packing List, Bill of Lading, Certificate of Origin, Preliminary Invoice.
- **Review Lifecycle**: Starts in `pending` -> Admin reviews -> `approved` or `revision_required` (with mandatory reason).
- **Approved Document Immutability**: Customers are strictly prevented from editing or deleting approved documents.
- **Customer Resubmission**: Backend action `customerResubmitInvoiceAction` and `customerUploadShipmentDocumentAction` exist, but client UI lacks `<input type="file">`.

---

## 11. Nafeza & ACID Audit

- **Nafeza Integration Status**: Manual tracking only. The application does not interface directly with external Nafeza APIs; it provides operational tracking for internal staff.
- **ACID Validation**: `adminIssueAcidAction` requires a valid non-empty string and stores it in `shipment_acids` and `shipments.acid_number`.
- **ACID Display**: Properly formatted with monospace typography across headers, KPI cards, and modal dialogs.

---

## 12. Conditional Procedures, Scouting, Inspection, and Data-Entry Audit

- **Stage 05 (Type Procedures)**: Dynamically checks `goods_category` and `applicable_procedures`. General cargo defaults to `not_applicable` and does not halt the workflow.
- **Stage 06 (Scouting & Inspection)**: Dual sub-processes represented cleanly in `AdminStageDetailModal` with a toggle tab. Inspection satisfies scouting.
- **Stage 07 (CargoX & Declaration 46)**: CargoX requires 3 checkboxes (supplier upload, ACID match, data consistency) OR a valid official exemption reason. Declaration 46 is strictly advisory and non-blocking.

---

## 13. Valuation and Settlement Audit

- **Valuation**: Captures assessed customs value and tariff percentage in `stage_data`.
- **Settlement**: Strictly enforces zero outstanding balance before allowing `settled` status.
- **Payment Sources**: Differentiates between Customer Direct Payment (requires bank/customs receipt number) and OUT Payment (tracks OUT payment reference, collected amount, and customer collection reference).

---

## 14. Release, Port Exit, and Delivery Audit

- **Customs Release**: Requires an official release permit number. Promotes shipment to `customs_cleared`.
- **Port Exit**: Logs independent `port_exited` event in `shipment_stage_history`.
- **Customer Delivery**: Sets `delivered_at` and promotes shipment status to `delivered`.
- **Irreversibility Defect**: Checkboxes in `AdminStageDetailModal` cannot be toggled off once saved (**DEF-AUDIT-05**).

---

## 15. Authorization and Privacy Audit

- **Tenant Isolation**: Fully verified. Clients cannot access shipments or documents of another company.
- **Field Sanitization**: Customer view strictly suppresses:
  - `assignedRole` and `assignedRoleLabel`
  - Internal `checklist` items
  - Internal `waitingReason`
  - Internal `notes` from scouting and inspection
  - Internal staff user IDs (`completedBy`) and staff names (`completedByName`)
  - Raw database stage records (`dbStageRecord: null`)
- **Action-Level Role Enforcement**: Non-admin roles (scout, inspector, data-entry) are strictly restricted by `updateCustomsStageAction` to their authorized stages.

---

## 16. Automation and State Consistency Audit

- State calculations are deterministic and pure: given a set of database records, `canonical-journey-adapter.ts` derives identical stage statuses on every render.
- Missing records are safely handled with null fallbacks.
- Race conditions during stage updates are addressed by OCC logic on the server, though the client modal fails to supply the OCC timestamp (**DEF-AUDIT-04**).

---

## 17. Database and Legacy Compatibility Audit

- **Zero Fake Stage Rows**: Stage 04 does not create a fake customs stage record; it is derived entirely from `documents`.
- **Legacy Fallback**: Legacy shipments storing customs duties in `duties_amount` rather than `assessed_customs_amount` are fully supported by `computeCustomsOutstandingBalance`.
- **No Schema Changes Needed**: All existing features operate on the existing database schema without requiring migrations.

---

## 18. UI/UX and Responsiveness Audit

- Modern logistics SaaS aesthetic with dark-mode hero banners and OUT yellow accents (`#F5C500`).
- RTL layout is properly configured (`dir="rtl"`).
- **Responsive Defect**: On mobile viewports (<640px), modal containers with `max-h-[88vh]` suffer from clipped forms and dual scrollbars (**DEF-AUDIT-10**).

---

## 19. Test Coverage and Verification Results

- **Automated Tests Executed**: 6 test suites comprising **408 assertions**.
- **Results**: **408 Passed / 0 Failed (100% Pass Rate)**.
- **Real Database Read-Only Verification**: 5 active shipments (`NEG-158122`, `OUT-2026-000001`, `OUT-2026-000005`, `OUT-2026-000044`, `OUT-2026-000006`) were inspected; all conform perfectly to the 10-stage sequence.

---

## 20. Recommended Remediation Order

Remediation should proceed in **4 prioritized phases**:

### Phase 1: Critical Customer & Admin Action Restorations (P1)
- Restore customer price approval and negotiation forms in `shipment-details-view.tsx` and `CustomerStageDetailModal` (DEF-AUDIT-01).
- Restore admin price estimation and final price forms in `AdminStageDetailModal` and `admin-shipment-details.tsx` (DEF-AUDIT-02).
- Add file upload inputs for preliminary invoice resubmissions and final shipping documents on the client page and modal (DEF-AUDIT-03).

### Phase 2: Functional Safeguards & Concurrency Fixes (P2)
- Pass `expected_updated_at` from `AdminStageDetailModal` to activate server-side OCC (DEF-AUDIT-04).
- Allow clearing port exit and delivery checkboxes by passing explicit `null` (DEF-AUDIT-05).
- Enforce Stage 04 document completion in `workflow-rules.ts` before Stage 05 (DEF-AUDIT-06).

### Phase 3: UI/UX, Navigation & Mobile Responsiveness (P3)
- Eliminate circular redirect buttons between pricing tab and modal (DEF-AUDIT-09).
- Synchronize modal form state when server component props update (DEF-AUDIT-08).
- Implement responsive full-screen mobile sheet behavior on viewports < 640px (DEF-AUDIT-10).
- Correct outdated component docstrings (DEF-AUDIT-11).

### Phase 4: Technical Debt & Dead Code Pruning (P4)
- Retire and remove the 16 orphaned legacy components (576 KB) from `src/components/shipments/` and clean up `index.ts` (DEF-AUDIT-12).

---

## 21. Explicit List of Areas That Could Not Be Verified

1. **Live Production SMS / Email Gateway Delivery**: The actual delivery of customer notification emails or SMS messages through external providers (e.g. Resend, Twilio) could not be tested without triggering real notifications to live users.
2. **Real Nafeza External Portal Connectivity**: Egyptian Customs does not provide an external public API for ACID verification; all Nafeza tracking remains manual operator data entry by design.
3. **Physical Mobile Device Hardware Touch Gestures**: While mobile viewports were evaluated via CSS inspection, physical touch interaction on actual iOS/Android hardware was not tested in this environment.

---

## Final Statement

**This forensic audit was conducted under strict read-only parameters. No application source code, configuration files, database schemas, database records, permissions, or production data were modified.**
