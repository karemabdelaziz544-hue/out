# OUT Platform — Forensic Shipment Page Component Inventory
**Audit Date**: 2026-10-25  
**Target Pages**: Admin Shipment Details (`/shipments/[id]`) & Client Shipment Details (`/my-shipments/[id]`)  
**Status**: Comprehensive Technical Inventory  

---

## 1. Architectural Overview & Page Routes

```
                             [ Next.js 16.4.0 App Router ]
                                           │
             ┌─────────────────────────────┴─────────────────────────────┐
             ▼                                                           ▼
   Admin Shipment Page                                         Client Shipment Page
   Route: /shipments/[id]                                      Route: /my-shipments/[id]
   File: src/app/(dashboard)/shipments/[id]/page.tsx          File: src/app/(dashboard)/my-shipments/[id]/page.tsx
   Auth Guard: requireRole(['admin', 'manager', ...])          Auth Guard: requireAuth() + Company Check
             │                                                           │
             ▼                                                           ▼
   AdminShipmentDetails                                        ShipmentDetailsView
   File: src/components/shipments/admin-shipment-details.tsx   File: src/components/shipments/shipment-details-view.tsx
             │                                                           │
             ├─ TenStageTimeline (10 Stages)                             ├─ CustomerSevenStationTimeline (7 Stations)
             ├─ AdminStageDetailModal (Focused Modal)                    ├─ CustomerStageDetailModal (Focused Modal)
             ├─ DocumentPreviewModal                                     ├─ DocumentPreviewModal
             └─ Subordinate Info Hub (4 Tabs)                            └─ Subordinate Info Hub (4 Tabs)
```

---

## 2. Admin Shipment Page Inventory (`/shipments/[id]`)

### A. Route Shell & Server Component
- **File**: `src/app/(dashboard)/shipments/[id]/page.tsx`
- **Layout**: `src/app/(dashboard)/layout.tsx`
- **Server Guard**:
  ```typescript
  if (currentUser.role === "customer") redirect(`/my-shipments/${id}`);
  await requireRole(["admin", "manager", "data_entry", "inspector", "scout"]);
  ```
- **Data Fetcher**: `getAdminShipmentDetails(id)` from `src/lib/shipments/queries.ts`
- **Props Loaded**: `shipment`, `company`, `customer`, `documents`, `pricing`, `pricingHistory`, `invoiceReviews`, `acid`, `acidHistory`, `documentReviews`, `stageHistory`, `externalOperations`, `journey`

### B. Root Client Component: `AdminShipmentDetails`
- **File**: `src/components/shipments/admin-shipment-details.tsx` (877 lines, 42.8 KB)
- **Local React States**:
  - `selectedStage: AuthoritativeJourneyStage | null` (active modal stage)
  - `activeTab: 'documents' | 'pricing' | 'specs' | 'activity'`
  - `previewDoc: DocumentItem | null`
  - `copiedRef: boolean`
- **Adapter Function**: `buildAuthoritativeTenStageJourney(...)` from `canonical-journey-adapter.ts`

### C. Visible Sections & Child Components
1. **Breadcrumbs & Status Header** (Section 3.A):
   - Reference Number with click-to-copy button (`navigator.clipboard.writeText`)
   - Category Badge (`GOODS_CATEGORY_LABELS`)
   - Global Shipment Status Badge (`<ShipmentStatusBadge />`)
   - Customer link (`/customers/[id]`) and Company name display
   - Primary Header CTA: *"إجراءات المرحلة الحالية ({number})"* -> opens `AdminStageDetailModal` for current stage.
2. **4-Card KPI Summary Grid** (Section 3.B):
   - Card 1: Current Stage & Timing (`currentStageObj.title`, `currentStageObj.number`)
   - Card 2: Cargo Classification & Port of Arrival (`shipment.port_of_arrival`, `categoryLabel`)
   - Card 3: Financial & Pricing Agreement (`pricing.final_price` or estimate range)
   - Card 4: ACID Number & Final Documents Ratio (`acidRecord.acid_number`, `{approvedDocsCount}/{documents.length}`)
3. **Operational Hero Banner** (Section 5.3):
   - Active Stage Number, Title, Assigned Role Badge
   - Dynamic explanation: *"سبب استمرار المرحلة الحالية"* & *"الإجراء والمطلوب تالياً"*
   - Operational CTA button: Calls `handleOperationalAction()` (routes to Pricing tab, Documents tab, or opens Stage Modal).
4. **Customs Clearance Stepper Timeline** (Section 3.C):
   - Component: `<TenStageTimeline />` (`src/components/shipments/ten-stage-timeline.tsx`)
   - Renders exactly 10 authoritative stages with status badges, icons, completion checks, and click-to-open handlers.
5. **Subordinate Information Hub (4 Segmented Tabs)**:
   - **Tab 1 ("المستندات الجمركية")**: Document cards grid with status badges, file sizes, and "معاينة" preview buttons.
   - **Tab 2 ("التسعير والفواتير")**: Read-only pricing cards (Initial Estimate, Final Agreed Price, Invoice Review Status, and chronological Pricing History timeline).
   - **Tab 3 ("بيانات الشحنة اللوجستية")**: 6 specification cards (Origin, Port, Supplier, Packages, Gross Weight, Description, Inspection Notes).
   - **Tab 4 ("سجل النشاط والمراحل")**: Chronological audit trail from `shipment_stage_history`.
6. **Active Modals**:
   - `<AdminStageDetailModal />`: Renders stage-specific tasks, checklists, and mutation forms for Stages 01 to 10.
   - `<DocumentPreviewModal />`: Renders embedded file preview (PDF/image) with download action.

---

## 3. Client Shipment Page Inventory (`/my-shipments/[id]`)

### A. Route Shell & Server Component
- **File**: `src/app/(dashboard)/my-shipments/[id]/page.tsx`
- **Layout**: `src/app/(dashboard)/layout.tsx`
- **Server Guard**:
  ```typescript
  await requireAuth();
  const shipment = await getShipmentById(id);
  if (!shipment) notFound(); // Enforces company ownership check
  ```
- **Parallel Data Fetchers**: `getShipmentDocuments`, `getShipmentPricing`, `getShipmentAcid`, `getShipmentStageHistory`, `getCustomerShipmentCustomsJourney`, `getShipmentInvoiceReviews`, `getShipmentPricingHistory`
- **Props Loaded**: `shipment`, `documents`, `pricing`, `pricingHistory`, `invoiceReviews`, `acid`, `stageHistory`, `customerJourney`

### B. Root Client Component: `ShipmentDetailsView`
- **File**: `src/components/shipments/shipment-details-view.tsx` (773 lines, 38.2 KB)
- **Local React States**:
  - `selectedStation: CustomerJourneyStation | null` (active station modal)
  - `activeTab: 'documents' | 'pricing' | 'specs' | 'activity'`
  - `previewDoc: DocumentItem | null`
  - `copiedRef: boolean`
- **Adapter Functions**:
  1. `buildAuthoritativeTenStageJourney(..., isCustomerView: true)` (Suppresses internal staff notes, employee IDs, and internal checklists).
  2. `buildCustomerSevenStationJourney(tenStageJourney)` (Groups 10 stages into 7 customer stations).

### C. Visible Sections & Child Components
1. **Breadcrumbs & Status Header** (Section 3.A):
   - Reference Number with click-to-copy
   - Goods Category Badge and Shipment Status Badge
   - Port of Arrival and ACID Number Chips
   - Primary Header CTA: *"متابعة محطة الشحنة ({number})"* -> opens `CustomerStageDetailModal`.
2. **4-Card KPI Summary Grid** (Section 3.B):
   - Card 1: Current Station & Remaining Stations (`currentStationObj.number`, `currentStationObj.title`)
   - Card 2: Cargo Classification & Port of Arrival
   - Card 3: Pricing Summary (`pricingInfo.main`, `pricingInfo.sub`)
   - Card 4: ACID Number & Approved Documents Count
3. **Primary Customer Action Banner** (Section 6.2):
   - Visible only when customer action is required (e.g. approve price, revise invoice, upload documents).
   - Displays action title, description, and target tab button.
4. **Customer 7-Station Stepper Timeline** (Section 3.C):
   - Component: `<CustomerSevenStationTimeline />` (`src/components/shipments/customer-seven-station-timeline.tsx`)
   - Renders 7 consolidated customer stations with progress bar and click-to-open handlers.
5. **Subordinate Information Hub (4 Segmented Tabs)**:
   - **Tab 1 ("مستندات الشحنة")**: Document cards grid with status badges, dates, file sizes, and preview triggers.
   - **Tab 2 ("التسعير والفواتير")**: Pricing summary cards and pending price approval alert banner.
   - **Tab 3 ("بيانات ومواصفات الشحنة")**: Origin, port, supplier, packages, weight, cargo description.
   - **Tab 4 ("سجل مراحل الشحنة")**: Customer-safe milestone timeline.
6. **Active Modals**:
   - `<CustomerStageDetailModal />`: Renders customer-friendly station description, underlying stage progress list, meta info, and document review list.
   - `<DocumentPreviewModal />`: Embedded file preview modal.

---

## 4. Comprehensive Button & Interaction Trace Matrix

| Location | Button / Control Label | Target Handler / Event | Ultimate Server Action / Mutation | Audit Status | Forensic Notes |
|---|---|---|---|---|---|
| **Admin Header** | `نسخ رقم الشحنة` (Copy Icon) | `handleCopyRef` | Clipboard API | **Functional** | Works as intended (temporary check icon feedback). |
| **Admin Header** | `إجراءات المرحلة الحالية ({N})` | `onClick={() => setSelectedStage(currentStageObj)}` | Local state setter | **Functional** | Opens `AdminStageDetailModal` for active stage. |
| **Admin Hero** | `عرض وتحديث المرحلة` / CTA | `handleOperationalAction()` | `setSelectedStage` or tab switch | **Functional** | Smooth scrolls to tab or opens stage modal. |
| **Admin Timeline** | Stage Stepper Node (01–10) | `onSelectStage(st)` | `setSelectedStage(st)` | **Functional** | Opens modal for any clicked stage. |
| **Admin Tab Bar** | Documents / Pricing / Specs / Activity | `onClick={() => setActiveTab(tab)}` | Local React State | **Functional** | Smooth tab transitions. |
| **Admin Docs Tab** | `معاينة` (Preview Doc) | `onClick={() => setPreviewDoc(doc)}` | Opens `DocumentPreviewModal` | **Functional** | Displays signed URL PDF/image. |
| **Admin Modal (St.01)** | `حفظ تصنيف الشحنة ومساراتها` | `handleUpdateClassification` | `updateShipmentClassificationAction` | **Functional** | Updates category, procedures, notes, auto-advances. |
| **Admin Modal (St.02)** | `الانتقال لإدارة تفاصيل التسعير` | `onSelectTab("pricing")` | Local tab switch | **Disconnected** | Swaps to read-only pricing tab; no mutation possible (**DEF-AUDIT-02**). |
| **Admin Modal (St.03)** | `اعتماد الفاتورة` | `handleApproveInvoice` | `adminApproveInvoiceAction` | **Functional** | Sets doc to approved and shipment to `invoice_approved`. |
| **Admin Modal (St.03)** | `طلب تعديل` (الفاتورة) | `handleRequestInvoiceRevision` | `adminRequestInvoiceRevisionAction` | **Functional** | Records revision reason; updates shipment status. |
| **Admin Modal (St.03)** | `توثيق واعتماد رقم ACID` | `handleIssueAcid` | `adminIssueAcidAction` | **Functional** | Validates 19 digits; updates ACID record. |
| **Admin Modal (St.03)** | `بدء إجراءات نافذة` | `handleStartAcidProcessing` | `adminStartAcidProcessingAction` | **Functional** | Sets ACID status to `processing`. |
| **Admin Modal (St.04)** | `اعتماد` (Document) | `handleApproveDocument(docId)` | `adminApproveShipmentDocumentAction` | **Functional** | Approves doc; auto-triggers `documents_completed` if 4/4. |
| **Admin Modal (St.04)** | `طلب تعديل` (Document) | `handleRequestDocRevision` | `adminRequestShipmentDocumentRevisionAction` | **Functional** | Sets doc to `revision_required` with mandatory note. |
| **Admin Modal (St.05)** | `حفظ تحديث إجراءات نوع البضاعة` | `handleUpdateOperationalStage("stage_4_type_procedures")` | `updateCustomsStageAction` | **Functional (Inconsistent)** | OCC bypassed (**DEF-AUDIT-04**); Stage 04 check bypassed (**DEF-AUDIT-06**). |
| **Admin Modal (St.06)** | `حفظ نتائج المعاينة الجمركية` | `handleUpdateOperationalStage("stage_6_inspection")` | `updateCustomsStageAction` | **Functional (Flawed)** | Updates inspection; OCC bypassed (**DEF-AUDIT-04**). |
| **Admin Modal (St.06)** | `حفظ نتائج الكشف الميداني` | `handleUpdateOperationalStage("stage_5_scouting")` | `updateCustomsStageAction` | **Functional (Flawed)** | Updates scouting; OCC bypassed (**DEF-AUDIT-04**). |
| **Admin Modal (St.07)** | `حفظ بيانات الإدراج وتتبع CargoX` | `handleUpdateOperationalStage("stage_7_data_entry")` | `updateCustomsStageAction` | **Functional** | Enforces CargoX exemption or verification; OCC bypassed. |
| **Admin Modal (St.08)** | `اعتماد التقييم الجمركي` | `handleUpdateOperationalStage("stage_8_valuation")` | `updateCustomsStageAction` | **Functional** | Persists customs value; OCC bypassed. |
| **Admin Modal (St.09)** | `حفظ واعتماد تسوية المستحقات` | `handleUpdateOperationalStage("stage_9_fees_payments")` | `updateCustomsStageAction` | **Functional** | Enforces 0 balance & receipt reference. OCC bypassed. |
| **Admin Modal (St.10)** | `توثيق الإفراج والتسليم النهائي` | `handleUpdateOperationalStage("stage_10_clearance_release")` | `updateCustomsStageAction` | **Functional (Irreversible)** | Mandatory release permit. Checkboxes irreversible (**DEF-AUDIT-05**). |
| **Client Header** | `نسخ رقم الشحنة` | `handleCopyRef` | Clipboard API | **Functional** | Copies reference number. |
| **Client Header** | `متابعة محطة الشحنة ({N})` | `setSelectedStation(currentStationObj)` | Local state setter | **Functional** | Opens `CustomerStageDetailModal`. |
| **Client Hero** | `مراجعة واعتماد السعر` / Action CTA | `setActiveTab(targetTab)` | Local React State | **Disconnected** | Switches tab; no action form exists (**DEF-AUDIT-01**). |
| **Client Timeline** | Station Node (01–07) | `onSelectStation(st)` | `setSelectedStation(st)` | **Functional** | Opens modal for clicked station. |
| **Client Pricing Tab**| `فتح محطة التسعير للموافقة` | `setSelectedStation(pricingStation)` | Local state setter | **Broken Loop** | Opens modal which redirects back to tab (**DEF-AUDIT-01**, **09**). |
| **Client Modal (St.02)**| `الانتقال لمراجعة واعتماد السعر` | `onActionClick("pricing")` | Tab switch | **Broken Loop** | Closes modal and returns to tab without action (**DEF-AUDIT-01**, **09**). |
| **Client Docs Tab** | `معاينة` (Preview Doc) | `setPreviewDoc(doc)` | Opens `DocumentPreviewModal` | **Functional** | Previews document. |
| **Client Docs Tab** | `رفع المستندات` / `تعديل المستند` | **MISSING** | **NONE** | **Missing** | Zero file inputs exist (**DEF-AUDIT-03**). |
| **Client Modal (St.03)**| `الانتقال لمركز المستندات لإدارة الفاتورة` | `onActionClick("documents")` | Tab switch | **Disconnected** | Tab has no upload button (**DEF-AUDIT-03**). |
| **Client Modal (St.04)**| `الانتقال لمركز المستندات للرفع أو الاستعراض`| `onActionClick("documents")` | Tab switch | **Disconnected** | Tab has no upload button (**DEF-AUDIT-03**). |

---

## 5. Complete Inventory of Orphaned / Dead Shipment Components

The following 16 files in `src/components/shipments/` are re-exported in `src/components/shipments/index.ts`, but are **NOT imported or rendered anywhere** across the application:

| File Name | File Size | Intended Purpose / Former Role | Current Status | Critical Mutation Code Trapped Inside |
|---|---|---|---|---|
| `admin-pricing-section.tsx` | 26,118 B | Admin pricing management section | **Dead Code** | Contains `submitPriceEstimateAction` & `adminSetFinalPriceAction` forms! |
| `customer-pricing-card.tsx` | 22,185 B | Customer pricing approval card | **Dead Code** | Contains `customerApproveFinalPriceAction` & `customerRequestNegotiationAction`! |
| `admin-invoice-review-section.tsx` | 36,651 B | Detailed admin invoice review section | **Dead Code** | Superseded by `AdminStageDetailModal` Stage 03. |
| `customer-invoice-review-section.tsx` | 40,462 B | Customer invoice replacement card | **Dead Code** | Contains `<input type="file">` & `customerResubmitInvoiceAction`! |
| `admin-acid-section.tsx` | 40,823 B | Detailed admin ACID management | **Dead Code** | Superseded by `AdminStageDetailModal` Stage 03. |
| `customer-acid-section.tsx` | 17,396 B | Customer ACID display card | **Dead Code** | Superseded by `CustomerStageDetailModal` Station 03. |
| `admin-final-documents-section.tsx` | 31,900 B | Admin final 4 documents review | **Dead Code** | Superseded by `AdminStageDetailModal` Stage 04. |
| `customer-final-documents-section.tsx` | 42,066 B | Customer final 4 documents upload | **Dead Code** | Contains `<input type="file">` & `customerUploadShipmentDocumentAction`! |
| `admin-readiness-section.tsx` | 19,795 B | Pre-customs readiness checklist | **Dead Code** | Superseded by stage-specific prerequisites in `workflow-rules.ts`. |
| `admin-external-operations-section.tsx` | 40,057 B | Legacy external procedures | **Dead Code** | Superseded by Stages 05–10 in `AdminStageDetailModal`. |
| `admin-customs-journey-section.tsx` | 88,150 B | Legacy 10-stage accordion table | **Dead Code** | Superseded by `TenStageTimeline` and `AdminStageDetailModal`. |
| `stage-workspace-modal.tsx` | 44,701 B | Old stage workspace dialog | **Dead Code** | Superseded by `AdminStageDetailModal`. |
| `customer-stage-modal.tsx` | 9,231 B | Old customer stage dialog | **Dead Code** | Superseded by `CustomerStageDetailModal`. |
| `unified-stage-modal.tsx` | 110,119 B | Massive 110 KB unified admin modal | **Dead Code** | Superseded by `AdminStageDetailModal` (83 KB). |
| `customer-unified-stage-modal.tsx` | 45,508 B | Old customer unified modal | **Dead Code** | Superseded by `CustomerStageDetailModal` (22 KB). |
| `shipment-workflow-stepper.tsx` | 11,348 B | Legacy horizontal stepper | **Dead Code** | Superseded by `TenStageTimeline`. |
| **Total Dead Code Volume** | **576,510 B** | **16 Orphaned Components** | **All Dead** | **Traps all pricing & document mutation forms** |

---

## 6. Shared vs. Separate Component Architecture

### A. Shared Components (Used by both Admin and Client)
1. `src/components/documents/document-preview-modal.tsx`: Document viewing dialog.
2. `src/components/shipments/shipment-status-badge.tsx`: Global status badge renderer.
3. `src/components/ui/icon.tsx`: Lucide icon abstraction.
4. `src/lib/shipments/canonical-journey-adapter.ts`: Shared domain logic generating both the 10 Admin Stages and 7 Client Stations from identical database records.

### B. Separate Components (Strictly Isolated by Role)
1. **Timeline**: `TenStageTimeline` (Admin, 10 stages) vs. `CustomerSevenStationTimeline` (Client, 7 stations).
2. **Detail Modals**: `AdminStageDetailModal` (Interactive operational actions, checklists, references, internal notes) vs. `CustomerStageDetailModal` (Read-only explanations, public meta info, document review statuses).
3. **Information Hub Tabs**: Logistics specifications, documents, and activity lists are structured independently with role-tailored field visibility.
