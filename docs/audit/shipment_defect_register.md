# OUT Platform — Forensic Defect Register
**Audit Date**: 2026-10-25  
**Audit Scope**: Admin & Client Shipment Experience  
**Status**: Verified Inspection Findings  

---

## Severity Classification Framework

- **P0 — Critical Security / Data-Integrity Risk**: Unauthorized data exposure, unauthorized financial modifications, data corruption, or bypassing mandatory authorization.
- **P1 — Critical Workflow / Business Defect**: Broken stage progression, skipped mandatory prerequisites, disconnected customer actions (e.g. price approval, document upload), false clearance/delivery status.
- **P2 — Major Functional Defect**: Missing server-side checks, concurrency control bypass, state synchronization failures, functional gaps vs documented business process.
- **P3 — UI/UX & Usability Defect**: Stale modal state, circular navigation loops, mobile responsiveness issues, unclear status labels, misleading code comments.
- **P4 — Technical Debt & Code Hygiene**: Orphaned/dead legacy code, duplicate declarations, non-affecting code inefficiencies.

---

## Executive Summary of Identified Defects

| Issue ID | Severity | Page / Layer | Area / Stage | Status | Summary |
|---|---|---|---|---|---|
| **DEF-AUDIT-01** | **P1** | Client | Stage 02 Pricing | **VERIFIED** | Customer price approval and negotiation actions are missing from the client shipment page and modal. |
| **DEF-AUDIT-02** | **P1** | Admin | Stage 02 Pricing | **VERIFIED** | Admin cannot submit initial price estimate or set final price from shipment details page or modal. |
| **DEF-AUDIT-03** | **P1** | Client | Stages 03 & 04 Documents | **VERIFIED** | Client cannot upload or re-upload preliminary invoices or final shipment documents from client shipment page or modal. |
| **DEF-AUDIT-04** | **P2** | Admin / Backend | Stages 05–10 | **VERIFIED** | Optimistic Concurrency Control (OCC) is bypassed because `admin-stage-detail-modal.tsx` never sends `expected_updated_at`. |
| **DEF-AUDIT-05** | **P2** | Admin | Stage 10 Clearance | **VERIFIED** | Stage 10 Port Exit and Customer Delivery events cannot be unchecked/cleared once set due to persistent merge in server action. |
| **DEF-AUDIT-06** | **P2** | Backend / Rules | Stage 05 Procedures | **VERIFIED** | Backend validation for `stage_4_type_procedures` does not check for Stage 04 shipping document approvals. |
| **DEF-AUDIT-07** | **P2** | Admin / DB | Stages 01–10 Assignment | **VERIFIED** | Employee assignment controls are missing in schema and UI; role responsibility badges are purely static. |
| **DEF-AUDIT-08** | **P3** | Admin | All Modals | **VERIFIED** | Modal local state does not re-sync on server revalidation while modal remains open. |
| **DEF-AUDIT-09** | **P3** | Client | Stage 02 Navigation | **VERIFIED** | Circular navigation loop between client pricing tab and station modal without action controls. |
| **DEF-AUDIT-10** | **P3** | Shared | UI Layout & Mobile | **VERIFIED** | Modal height and dense sub-process controls cause vertical clipping on screens under 640px. |
| **DEF-AUDIT-11** | **P3** | Shared / Code | Documentation | **VERIFIED** | Misleading docstrings in root details components cite legacy `UnifiedStageModal` instead of active modals. |
| **DEF-AUDIT-12** | **P4** | Shared / Tree | Component Library | **VERIFIED** | 16 orphaned components (570+ KB) exported from `components/shipments/index.ts` but never rendered at runtime. |

---

## Detailed Defect Records

### DEF-AUDIT-01 — Customer Price Approval and Negotiation Actions Missing from Client Page
- **Issue ID**: `DEF-AUDIT-01`
- **Severity**: **P1 (Critical Workflow Defect)**
- **Page / Layer**: Client (`/my-shipments/[id]`)
- **Exact File & Line**: `src/components/shipments/shipment-details-view.tsx` (lines 588–611) & `src/components/shipments/customer-stage-detail-modal.tsx` (lines 211–224)
- **Affected Section / Action**: Stage 02 Pricing & Negotiation (`customerApproveFinalPriceAction`, `customerRequestNegotiationAction`, `customerApproveEstimateAction`)
- **Expected Behavior**: When a price estimate or final price is proposed by OUT operations, the client should have accessible action controls on their shipment details page (or within Station 02 modal) to:
  1. Approve the initial estimate (`customerApproveEstimateAction`).
  2. Request price negotiation (`customerRequestNegotiationAction`).
  3. Approve the final agreed price (`customerApproveFinalPriceAction`).
- **Actual Behavior**: Neither `shipment-details-view.tsx` nor `customer-stage-detail-modal.tsx` imports or executes these actions. Instead:
  - On the pricing tab of `shipment-details-view.tsx`, the action banner button says: *"فتح محطة التسعير للموافقة"* which executes `setSelectedStation(pricingStation)`.
  - Inside `CustomerStageDetailModal`, the button says: *"الانتقال لمراجعة واعتماد السعر"* which executes `onActionClick("pricing")`, closing the modal and switching to the pricing tab.
  - The actual mutation forms exist exclusively in `customer-pricing-card.tsx` and `customer-unified-stage-modal.tsx`, neither of which is imported or rendered by `/my-shipments/[id]`.
- **Evidence**:
  ```bash
  # grep_search shows customerApproveFinalPriceAction is ONLY imported in dead components:
  src/components/shipments/customer-pricing-card.tsx:19
  src/components/shipments/customer-unified-stage-modal.tsx:41
  ```
- **Root Cause**: During the journey consolidation redesign, the legacy `CustomerPricingCard` was replaced with a read-only KPI card grid, but the interactive approval and negotiation forms were omitted from the new client view and modal.
- **User Impact**: Customers are completely unable to approve pricing or submit negotiation requests on `/my-shipments/[id]`, permanently halting progression past Stage 02.
- **Verification Status**: **VERIFIED**
- **Reproduction Steps**:
  1. Log in as a customer with a shipment in `price_proposed` or `price_agreed`.
  2. Navigate to `/my-shipments/[id]`.
  3. Click "مراجعة واعتماد السعر" on the hero banner or navigate to tab "التسعير والفواتير".
  4. Click "فتح محطة التسعير للموافقة" in the tab: modal opens.
  5. In the modal, observe that there is no approval button; clicking the CTA merely switches back to the tab.
- **Recommended Remediation**:
  Embed the approval and negotiation form controls directly into `shipment-details-view.tsx` (under the pricing tab) and inside `customer-stage-detail-modal.tsx` for Station 02, connecting them to `customerApproveFinalPriceAction` and `customerRequestNegotiationAction`.

---

### DEF-AUDIT-02 — Admin Cannot Submit Price Estimate or Final Agreed Price from Shipment Page
- **Issue ID**: `DEF-AUDIT-02`
- **Severity**: **P1 (Critical Workflow Defect)**
- **Page / Layer**: Admin (`/shipments/[id]`)
- **Exact File & Line**: `src/components/shipments/admin-shipment-details.tsx` (lines 628–680) & `src/components/shipments/admin-stage-detail-modal.tsx` (lines 611–666)
- **Affected Section / Action**: Stage 02 Pricing Administration (`submitPriceEstimateAction`, `adminSetFinalPriceAction`)
- **Expected Behavior**: Operations staff should be able to input the minimum and maximum estimated price range (or final agreed price) and submit it to the client directly from `/shipments/[id]`.
- **Actual Behavior**:
  - Tab 2 ("التسعير والفواتير") in `admin-shipment-details.tsx` is completely read-only (displays estimate cards, final price card, and history).
  - In `admin-stage-detail-modal.tsx`, Stage 02 only displays existing status cards and a button *"الانتقال لإدارة تفاصيل التسعير والمفاوضات"* (`onSelectTab("pricing")`), which switches to the read-only tab.
  - Neither `submitPriceEstimateAction` nor `adminSetFinalPriceAction` is imported or invoked anywhere in the active admin shipment page or modal.
- **Evidence**:
  ```bash
  # grep_search confirms submitPriceEstimateAction is ONLY imported in dead components:
  src/components/shipments/admin-pricing-section.tsx:17
  src/components/shipments/unified-stage-modal.tsx:55
  ```
- **Root Cause**: `AdminPricingSection` and `UnifiedStageModal` were superseded, but their input fields and submit actions were not migrated into `AdminStageDetailModal` or `admin-shipment-details.tsx`.
- **User Impact**: Administrators cannot enter price estimates or finalize prices from the shipment details interface.
- **Verification Status**: **VERIFIED**
- **Reproduction Steps**:
  1. Open an admin shipment in `awaiting_pricing`.
  2. Navigate to `/shipments/[id]`.
  3. Open Stage 02 in `AdminStageDetailModal` or open the Pricing tab.
  4. Observe that no input fields for `estimated_min_price`, `estimated_max_price`, or `final_price` exist.
- **Recommended Remediation**:
  Incorporate the pricing submission forms (minimum price, maximum price, currency, final agreed price) into `AdminStageDetailModal` (Stage 02) and/or `admin-shipment-details.tsx` (Pricing Tab), binding them to `submitPriceEstimateAction` and `adminSetFinalPriceAction`.

---

### DEF-AUDIT-03 — Client Cannot Upload Preliminary Invoice Revisions or Final Shipping Documents
- **Issue ID**: `DEF-AUDIT-03`
- **Severity**: **P1 (Critical Workflow Defect)**
- **Page / Layer**: Client (`/my-shipments/[id]`)
- **Exact File & Line**: `src/components/shipments/shipment-details-view.tsx` (lines 433–534) & `src/components/shipments/customer-stage-detail-modal.tsx` (lines 227–402)
- **Affected Section / Action**: Stage 03 Invoice Resubmission (`customerResubmitInvoiceAction`) and Stage 04 Final Documents Upload (`customerUploadShipmentDocumentAction`)
- **Expected Behavior**:
  1. When preliminary invoice status is `revision_required`, the customer can select a corrected file and submit it (`customerResubmitInvoiceAction`).
  2. In Stage 04, the customer can upload the 4 mandatory documents (Commercial Invoice, Packing List, Bill of Lading, Certificate of Origin) or replace revision-required documents (`customerUploadShipmentDocumentAction`).
- **Actual Behavior**:
  - `shipment-details-view.tsx` and `customer-stage-detail-modal.tsx` contain **zero** `<input type="file">` elements.
  - In both components, document cards only provide a "معاينة" (preview) button.
  - The UI prompts the customer with text: *"يمكنك رفع المستندات المطلوبة عبر فتح المرحلة ذات الصلة"* and *"الانتقال لمركز المستندات للرفع أو الاستعراض"*, but neither location provides any file upload input.
- **Evidence**:
  ```bash
  # grep_search shows <input type="file"> is completely absent from active client details components:
  src/components/shipments/shipment-details-view.tsx -> 0 file inputs
  src/components/shipments/customer-stage-detail-modal.tsx -> 0 file inputs
  ```
- **Root Cause**: The upload controls were defined in `customer-final-documents-section.tsx`, `customer-invoice-review-section.tsx`, and `customer-unified-stage-modal.tsx`, all of which were disconnected when the consolidated UI was introduced.
- **User Impact**: Customers are completely blocked from uploading documents or resolving revision requests from the shipment page.
- **Verification Status**: **VERIFIED**
- **Reproduction Steps**:
  1. Open a client shipment requiring document upload or preliminary invoice revision.
  2. Navigate to `/my-shipments/[id]`.
  3. Inspect the Documents tab and Station 03 / Station 04 in the modal.
  4. Observe that only preview buttons exist; no file picker or upload CTA is present.
- **Recommended Remediation**:
  Add secure file upload and replacement dialogs to `customer-stage-detail-modal.tsx` (Stations 03 and 04) and `shipment-details-view.tsx` (Documents Tab), calling `customerResubmitInvoiceAction` and `customerUploadShipmentDocumentAction`.

---

### DEF-AUDIT-04 — Optimistic Concurrency Control (OCC) Bypassed in Stage Mutations
- **Issue ID**: `DEF-AUDIT-04`
- **Severity**: **P2 (Major Functional Defect / Concurrency Risk)**
- **Page / Layer**: Admin / Backend (`updateCustomsStageAction`)
- **Exact File & Line**: `src/components/shipments/admin-stage-detail-modal.tsx` (lines 330–368) & `src/lib/shipments/journey-actions.ts` (lines 258, 537–546)
- **Affected Section / Action**: Operational stage mutations (`handleUpdateOperationalStage`)
- **Expected Behavior**: The client sends the record's current `updated_at` timestamp as `expected_updated_at`. If another user modified the stage in the interim, the server rejects the mutation with an OCC collision error.
- **Actual Behavior**: `admin-stage-detail-modal.tsx` constructs `FormData` but never appends `expected_updated_at`. In `journey-actions.ts`, `expectedUpdatedAt` defaults to `null`, causing the OCC check at line 537 to be bypassed on every invocation.
- **Evidence**:
  ```typescript
  // In journey-actions.ts:
  const expectedUpdatedAt = formData.get("expected_updated_at")?.toString().trim() || null;
  if (expectedUpdatedAt && existingStage?.updated_at) { ... } // Bypassed because expectedUpdatedAt is null
  ```
- **Root Cause**: The form handler in `admin-stage-detail-modal.tsx` neglected to append `expected_updated_at: dbRecord?.updated_at`.
- **User Impact**: Multiple operations staff editing the same shipment stage concurrently will silently overwrite each other's work without notification.
- **Verification Status**: **VERIFIED**
- **Recommended Remediation**:
  Append `fd.append("expected_updated_at", dbRecord?.updated_at || "")` inside `handleUpdateOperationalStage` in `admin-stage-detail-modal.tsx`.

---

### DEF-AUDIT-05 — Stage 10 Port Exit and Customer Delivery Events Cannot Be Cleared
- **Issue ID**: `DEF-AUDIT-05`
- **Severity**: **P2 (Major Functional Defect)**
- **Page / Layer**: Admin (`/shipments/[id]`)
- **Exact File & Line**: `src/components/shipments/admin-stage-detail-modal.tsx` (lines 360–365) & `src/lib/shipments/journey-actions.ts` (line 780)
- **Affected Section / Action**: Stage 10 Checkboxes (`portExitEvent`, `deliveryEvent`)
- **Expected Behavior**: If an admin accidentally checks "تم خروج الشحنة" or "تم تسليم الشحنة" and later unchecks it, the timestamp should be cleared/nulled out in `stage_data`.
- **Actual Behavior**: If unchecked, `extraData` simply omits the key. When the server action executes `mergedStageData = { ...(existingStage?.stage_data || {}), ...stageData }`, the previous timestamp in `existingStage.stage_data` is preserved, making the action irreversible from the UI.
- **Evidence**:
  ```typescript
  // admin-stage-detail-modal.tsx lines 363-364:
  if (portExitEvent) extraData.port_exit_at = new Date().toISOString();
  if (deliveryEvent) extraData.delivered_at = new Date().toISOString();
  // If false, extraData has no key, and journey-actions.ts line 780 preserves existing value:
  const mergedStageData = { ...(existingStage?.stage_data || {}), ...stageData };
  ```
- **Root Cause**: Lack of explicit `null` setting when a boolean event checkbox is toggled off.
- **User Impact**: Accidental clicks on port exit or delivery checkboxes cannot be undone via the user interface.
- **Verification Status**: **VERIFIED**
- **Recommended Remediation**:
  Explicitly pass `port_exit_at: portExitEvent ? (dbRecord?.stage_data?.port_exit_at || new Date().toISOString()) : null` and `delivered_at: deliveryEvent ? (dbRecord?.stage_data?.delivered_at || new Date().toISOString()) : null`.

---

### DEF-AUDIT-06 — Stage 05 Backend Validation Does Not Check Stage 04 Document Approval
- **Issue ID**: `DEF-AUDIT-06`
- **Severity**: **P2 (Workflow Inconsistency)**
- **Page / Layer**: Backend / Workflow Rules (`validateStagePrerequisites`)
- **Exact File & Line**: `src/lib/shipments/workflow-rules.ts` (lines 88–99, 335–365)
- **Affected Section / Action**: Prerequisites for `stage_4_type_procedures` (Business Stage 05)
- **Expected Behavior**: Per the business rules and UI description ("تتطلب استكمال واعتماد مستندات الشحنة الأربعة النهائية أولاً"), completing Stage 05 should require that all 4 final shipping documents are approved (Stage 04).
- **Actual Behavior**: `stage_4_type_procedures` defines `prerequisiteStages: ["stage_3_nafeza_acid"]` and `requiredDocumentTypes: []`. Because Stage 04 is derived from the `documents` table without a dedicated stage key in `STAGE_KEYS_SEQUENCE`, `validateStagePrerequisites` does not check for Stage 04 completion before allowing Stage 05 to complete.
- **Root Cause**: Architectural mismatch between the 10 database stage keys (where order 4 is `stage_4_type_procedures`) and the 10 Authoritative Business Stages (where stage 04 is document review and stage 05 is type procedures).
- **User Impact**: Staff can advance and complete regulatory type procedures even if the final commercial invoice, packing list, or bill of lading is pending or rejected.
- **Verification Status**: **VERIFIED**
- **Recommended Remediation**:
  Add `requiredDocumentTypes: ["commercial_invoice", "packing_list", "bill_of_lading", "certificate_of_origin"]` to `stage_4_type_procedures` in `STAGE_WORKFLOW_RULES`.

---

### DEF-AUDIT-07 — Employee Assignment Controls Missing in Schema and UI
- **Issue ID**: `DEF-AUDIT-07`
- **Severity**: **P2 (Functional Gap vs Business Expectations)**
- **Page / Layer**: Admin / Database (`public.shipment_customs_stages`)
- **Exact File & Line**: `supabase/migrations/0015_create_customs_journey_and_classification.sql` & `src/components/shipments/admin-stage-detail-modal.tsx`
- **Affected Section / Action**: Employee Assignment & Accountability (Section 2.I of Audit)
- **Expected Behavior**: If individual employee assignments are part of the operational workflow (as indicated by role badges in the UI like "المسؤول: كشاف ومعاين جمركي"), managers should be able to select and assign a specific staff member to each stage or sub-process.
- **Actual Behavior**:
  - `public.shipment_customs_stages` has no `assigned_to` column (only `expected_role`, `completed_by`, `updated_by`).
  - No assignment picker exists in `admin-stage-detail-modal.tsx`.
  - The displayed role badges are purely static strings derived from the stage definition.
- **Root Cause**: The database migration `0015` established role types (`expected_role`) but did not implement an assignment relationship to `public.profiles`.
- **User Impact**: Operations managers cannot assign specific inspectors or scouts to individual shipments in the software; assignment tracking is offline.
- **Verification Status**: **VERIFIED**
- **Recommended Remediation**:
  If per-employee assignment is required by business stakeholders, introduce an `assigned_to uuid REFERENCES public.profiles(id)` column with an assignment UI in `AdminStageDetailModal`.

---

### DEF-AUDIT-08 — Modal Local State Stale on Server Revalidation
- **Issue ID**: `DEF-AUDIT-08`
- **Severity**: **P3 (UI/UX Usability Defect)**
- **Page / Layer**: Admin (`/shipments/[id]`)
- **Exact File & Line**: `src/components/shipments/admin-stage-detail-modal.tsx` (lines 88–187)
- **Affected Section / Action**: Form state initialization
- **Expected Behavior**: When an admin submits a stage update and Next.js revalidates the page props, keeping the modal open should reflect the freshly returned data.
- **Actual Behavior**: The modal uses initial values in `useState` without a `useEffect` synchronization hook. Form inputs retain their pre-submission or stale state until the user closes and re-opens the modal.
- **Root Cause**: Missing prop synchronization effect in Client Component.
- **User Impact**: Operators who keep the modal open after saving see stale values and may inadvertently re-submit old data.
- **Verification Status**: **VERIFIED**
- **Recommended Remediation**:
  Add a `useEffect` dependency on `stage.dbStageRecord` and `stage.key` to re-synchronize state when props update.

---

### DEF-AUDIT-09 — Circular Navigation Loop Between Client Pricing Tab and Station Modal
- **Issue ID**: `DEF-AUDIT-09`
- **Severity**: **P3 (UI/UX Usability Defect)**
- **Page / Layer**: Client (`/my-shipments/[id]`)
- **Exact File & Line**: `src/components/shipments/shipment-details-view.tsx` (lines 600–609) & `src/components/shipments/customer-stage-detail-modal.tsx` (lines 211–224)
- **Affected Section / Action**: Station 02 CTA button loop
- **Expected Behavior**: Clicking the pricing CTA should present the approval/negotiation action form.
- **Actual Behavior**: The pricing tab CTA opens the modal, and the modal CTA closes the modal and switches back to the pricing tab, creating an infinite circular loop with no actual action possible.
- **Root Cause**: Manifestation of DEF-AUDIT-01 in user navigation.
- **User Impact**: High customer frustration and perceived application breakage.
- **Verification Status**: **VERIFIED**
- **Recommended Remediation**:
  Replace redirect buttons with actionable modal forms as specified in DEF-AUDIT-01.

---

### DEF-AUDIT-10 — Modal Vertical Scroll and Padding Clipping on Small Screens
- **Issue ID**: `DEF-AUDIT-10`
- **Severity**: **P3 (UI/UX Usability Defect)**
- **Page / Layer**: Shared (`AdminStageDetailModal` & `CustomerStageDetailModal`)
- **Exact File & Line**: `src/components/shipments/admin-stage-detail-modal.tsx` (line 386) & `src/components/shipments/customer-stage-detail-modal.tsx` (line 82)
- **Affected Section / Action**: Mobile layout responsiveness (`max-h-[88vh]`, `max-h-[85vh]`)
- **Expected Behavior**: Modals should scroll smoothly on mobile screens (viewport < 640px) without cramped inputs or clipped action buttons.
- **Actual Behavior**: Dense multi-sub-process forms (Stage 06, Stage 07, Stage 09) within `max-h-[88vh]` cause inner and outer dual-scrollbars and cramped touch targets on mobile viewports.
- **Root Cause**: Desktop-first modal container styling without full-screen mobile sheet adaptation.
- **User Impact**: Field scouts or inspectors using mobile devices experience difficult form interaction.
- **Verification Status**: **VERIFIED**
- **Recommended Remediation**:
  Apply responsive full-screen or bottom-sheet styling on viewports under 640px (`sm:max-w-2xl sm:rounded-3xl max-sm:h-full max-sm:max-h-full max-sm:rounded-none`).

---

### DEF-AUDIT-11 — Misleading Docstrings in Root Details Components
- **Issue ID**: `DEF-AUDIT-11`
- **Severity**: **P3 (Documentation / Code Maintenance)**
- **Page / Layer**: Shared (`admin-shipment-details.tsx` line 19 & `shipment-details-view.tsx` line 19)
- **Affected Section / Action**: Component Header Documentation
- **Expected Behavior**: Docstrings accurately document the runtime components (`AdminStageDetailModal` and `CustomerStageDetailModal`).
- **Actual Behavior**: Docstrings still reference dead components: `"Click-to-open focused UnifiedStageModal (Section 3.D)"` and `"Click-to-open CustomerUnifiedStageModal (Section 3.D)"`.
- **Root Cause**: Leftover comments from previous refactoring phases.
- **User Impact**: Misleads developers and code reviewers.
- **Verification Status**: **VERIFIED**
- **Recommended Remediation**:
  Update docstrings to reference the actual active components.

---

### DEF-AUDIT-12 — 16 Orphaned / Superseded Legacy Components Exported in Barrel File
- **Issue ID**: `DEF-AUDIT-12`
- **Severity**: **P4 (Technical Debt & Code Hygiene)**
- **Page / Layer**: Shared (`src/components/shipments/index.ts`)
- **Exact File & Line**: `src/components/shipments/index.ts` (lines 7–23)
- **Affected Section / Action**: Component library exports (570+ KB of dead code)
- **Expected Behavior**: Only active, supported components should be exported; dead components should be cleanly retired.
- **Actual Behavior**: 16 large legacy components (including `unified-stage-modal.tsx` at 110 KB and `admin-customs-journey-section.tsx` at 88 KB) remain in the codebase and are re-exported from `index.ts`.
- **Root Cause**: Iterative component replacements without pruning deprecated files.
- **User Impact**: Increases build bundle analysis confusion and maintenance overhead.
- **Verification Status**: **VERIFIED**
- **Recommended Remediation**:
  Once the active modals incorporate the missing mutation forms (DEF-AUDIT-01, 02, 03), safely delete or archive the 16 orphaned files and clean up `src/components/shipments/index.ts`.
