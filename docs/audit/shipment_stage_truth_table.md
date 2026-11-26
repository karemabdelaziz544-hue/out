# OUT Platform — Authoritative Shipment Stage Truth Table
**Audit Date**: 2026-10-25  
**Reference Workflow**: The Authoritative 10-Stage Business Reference (Admin) + 7 Customer Progress Stations (Client)  
**Status**: Forensic Audit Specification  

---

## The 10 Authoritative Business Stages vs. 7 Customer Stations Truth Table

| # | Business Stage Name (Arabic) | Admin Display Label | Client Display Group (7 Stations) | Underlying Database Source | Status Mode | Completion Criteria | Required Prerequisites | Conditional? | Current Status Derivation Rule | Next-Stage Eligibility Rule | Primary Code Files / Functions | Verified Defects |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **01** | **استقبال طلب الشحنة** | 01 — استقبال طلب الشحنة | محطة 01: تقديم طلب الشحنة | `shipments.goods_category`, `shipments.classification_reviewed_at`, `shipment_customs_stages (stage_1_intake)` | Persisted & Derived | `status === 'completed'` in `stage_1_intake` OR `classification_reviewed_at != null` AND status not in `['draft', 'submitted']` | None (Initial stage) | No | Initial active stage for all shipments; in progress while classification is unconfirmed | Auto-activates Stage 02 upon classification confirmation | `canonical-journey-adapter.ts:149`, `journey-actions.ts:45` (`updateShipmentClassificationAction`) | None (Working as designed) |
| **02** | **التسعير وموافقة العميل** | 02 — التسعير وموافقة العميل | محطة 02: التسعير والموافقة | `shipment_pricing`, `shipment_pricing_history`, `shipment_customs_stages (stage_2_pricing)` | Persisted & Derived | `pricing.status === 'customer_approved'` OR `customer_approved_at != null` OR `shipment.status` advanced to `awaiting_invoice_review` or later | Stage 01 completed | No | `awaiting_external_response` if price proposed; `needs_correction` if negotiation requested; `in_progress` while estimating | Auto-activates Stage 03 upon explicit customer approval | `pricing-actions.ts:599` (`customerApproveFinalPriceAction`), `canonical-journey-adapter.ts:155` | **DEF-AUDIT-01** (Client cannot approve/negotiate on page), **DEF-AUDIT-02** (Admin cannot submit price from page) |
| **03** | **مراجعة الفاتورة وإجراءات نافذة** | 03 — مراجعة الفاتورة وإجراءات نافذة | محطة 03: الفاتورة ونافذة وACID | `shipment_invoice_reviews`, `shipment_acids`, `documents`, `shipment_customs_stages (stage_3_nafeza_acid)` | Persisted & Derived | `(isInvoiceApproved && isAcidIssued)` OR `stage_3_nafeza_acid.status === 'completed'` | Stage 02 completed (`customer_approved`) | No | `awaiting_external_response` if preliminary invoice missing or ACID processing; `needs_correction` if invoice revision requested | Auto-advances to Stage 04 when both invoice is approved and 19-digit ACID is issued | `invoice-review-actions.ts`, `acid-actions.ts`, `canonical-journey-adapter.ts:174` | **DEF-AUDIT-03** (Client cannot upload revised invoice from page) |
| **04** | **مراجعة مستندات الشحنة** | 04 — مراجعة مستندات الشحنة | محطة 04: المستندات والإجراءات المطلوبة (Part 1) | `documents` (with types `commercial_invoice`, `packing_list`, `bill_of_lading`, `certificate_of_origin`), `shipment_document_reviews` | **Purely Derived** (Zero fake DB customs stage row) | Approved count of final 4 documents >= 4 (`approvedFinalDocsCount >= 4`) | Stage 03 completed (ACID issued) | No | `awaiting_external_response` if uploaded < 4; `needs_correction` if any final document is `revision_required` | Unlocks Stage 05 when all 4 documents have `approved` review status | `document-actions.ts`, `canonical-journey-adapter.ts:204` | **DEF-AUDIT-03** (Client cannot upload/replace documents on page) |
| **05** | **إجراءات حسب نوع البضاعة** | 05 — إجراءات حسب نوع البضاعة | محطة 04: المستندات والإجراءات المطلوبة (Part 2) | `shipment_customs_stages (stage_4_type_procedures)` | Persisted & Derived | `!isApplicable` (auto-complete for general goods) OR `status === 'completed'` | Stage 04 completed (final docs approved) | **Yes** (Agricultural, Food, Industrial, or NTRA/Specialized) | `not_applicable` for general cargo; `awaiting_external_response` while waiting for authority committees; `needs_correction` on sample discrepancy | Advances to Stage 06 upon committee approval or non-applicability | `workflow-rules.ts:201` (`isStageApplicable`), `journey-actions.ts:237` | **DEF-AUDIT-06** (Backend validator fails to enforce Stage 04 doc completion prerequisite) |
| **06** | **الكشف والمعاينة** | 06 — الكشف والمعاينة | محطة 05: الكشف والمعاينة وإدراج البيانات (Part 1) | `shipment_customs_stages (stage_5_scouting)` & `(stage_6_inspection)` | Persisted & Derived (Dual Sub-processes) | `stage_6_inspection.status === 'completed'` (Inspection satisfies scouting) OR `['customs_cleared', 'delivered'].includes(shipment.status)` | Stage 04 completed & Stage 05 completed (or not applicable) | No (Sub-activities dual) | `in_progress` while scouting or inspection is underway; `needs_correction` if physical weight/item discrepancy found | Advances to Stage 07 when customs inspection report is officially registered | `canonical-journey-adapter.ts:220`, `journey-actions.ts:693`, `admin-stage-detail-modal.tsx:1054` | **DEF-AUDIT-04** (OCC bypassed), **DEF-AUDIT-07** (No employee assignment) |
| **07** | **إدراج البيانات والإجراءات المطلوبة** | 07 — إدراج البيانات والإجراءات المطلوبة | محطة 05: الكشف والمعاينة وإدراج البيانات (Part 2) | `shipment_customs_stages (stage_7_data_entry)` | Persisted | `status === 'completed'` in `stage_7_data_entry` with verified CargoX compliance or official exemption | Stage 06 completed (Inspection finished) | No (CargoX has conditional exemption) | `in_progress` while tariff data entry is pending; `needs_correction` on tariff code discrepancy | Advances to Stage 08 once declaration draft and CargoX verification are complete | `workflow-rules.ts:371`, `journey-actions.ts:384`, `canonical-journey-adapter.ts:226` | **DEF-AUDIT-04** (OCC bypassed) |
| **08** | **التقييم الجمركي** | 08 — التقييم الجمركي | محطة 06: التقييم الجمركي والتسوية (Part 1) | `shipment_customs_stages (stage_8_valuation)` | Persisted | `status === 'completed'` with approved customs value and tariff assessment | Stage 07 completed (Data entry done) | No | `in_progress` while customs value is assessed; `needs_correction` if valuation is disputed | Advances to Stage 09 once formal customs valuation report is approved | `workflow-rules.ts:138`, `canonical-journey-adapter.ts:231`, `admin-stage-detail-modal.tsx:1337` | **DEF-AUDIT-04** (OCC bypassed) |
| **09** | **تسوية المستحقات** | 09 — تسوية المستحقات | محطة 06: التقييم الجمركي والتسوية (Part 2) | `shipment_customs_stages (stage_9_fees_payments)` (with `customs_duties_settlement` JSON payload) | Persisted | `status === 'completed'` AND `outstandingDutiesBalance <= 0` AND valid receipt reference exists | Stage 08 completed (Valuation approved) | No | `awaiting_external_response` if paid by OUT awaiting customer collection; `needs_correction` on payment discrepancy | Unlocks Stage 10 final clearance ONLY when zero unpaid duties liability remains | `types/journey.ts:40` (`computeCustomsOutstandingBalance`), `workflow-rules.ts:397`, `journey-actions.ts:271` | **DEF-AUDIT-04** (OCC bypassed) |
| **10** | **الإفراج والخروج والتسليم** | 10 — الإفراج والخروج والتسليم | محطة 07: الإفراج وخروج الشحنة والتسليم | `shipment_customs_stages (stage_10_clearance_release)`, `shipments.status` | Persisted & Synchronized | `status === 'completed'` in `stage_10_clearance_release` with mandatory release permit number; `delivered_at` sets shipment to `delivered` | Stage 09 completed (Full settlement verified) | No | `in_progress` while clearance permit is in issuance; updates to `customs_cleared` then `delivered` | Terminal stage (Journey 100% complete) | `workflow-rules.ts:431`, `journey-actions.ts:432, 779`, `admin-stage-detail-modal.tsx:1550` | **DEF-AUDIT-05** (Delivery/Port exit checkboxes cannot be cleared once set) |

---

## Detailed Mapping Analysis: The 7 Customer Stations Grouping

The customer experience consolidates the 10 operational stages into **7 visual stations** to deliver a streamlined SaaS tracking experience without compromising administrative granularity:

```
[Customer Stations (7)]                       [Authoritative Business Stages (10)]
Station 01: تقديم طلب الشحنة        ════════> Stage 01: استقبال طلب الشحنة
Station 02: التسعير والموافقة         ════════> Stage 02: التسعير وموافقة العميل
Station 03: الفاتورة ونافذة وACID     ════════> Stage 03: مراجعة الفاتورة وإجراءات نافذة
Station 04: المستندات والإجراءات     ════════> Stage 04: مراجعة مستندات الشحنة (Final 4 Docs)
                                       ════════> Stage 05: إجراءات حسب نوع البضاعة (Conditional)
Station 05: الكشف والمعاينة والإدراج ════════> Stage 06: الكشف والمعاينة (Scouting & Inspection)
                                       ════════> Stage 07: إدراج البيانات والإجراءات المطلوبة
Station 06: التقييم الجمركي والتسوية  ════════> Stage 08: التقييم الجمركي
                                       ════════> Stage 09: تسوية المستحقات
Station 07: الإفراج والتسليم النهائي  ════════> Stage 10: الإفراج والخروج والتسليم
```

### Station Completion Logic:
- **Station 01**: Completes when Stage 01 is completed.
- **Station 02**: Completes when Stage 02 is completed (customer approves pricing).
- **Station 03**: Completes when Stage 03 is completed (preliminary invoice approved + ACID issued).
- **Station 04**: Completes when Stage 04 is completed (all 4 final documents approved) **AND** Stage 05 is completed (or legitimately `not_applicable`).
- **Station 05**: Completes when Stage 06 is completed (inspection done) **AND** Stage 07 is completed (data entry & CargoX done).
- **Station 06**: Completes when Stage 08 is completed (valuation approved) **AND** Stage 09 is completed (duties fully settled with 0 balance).
- **Station 07**: Completes when Stage 10 is completed (customs release permit issued, port exit recorded, delivery confirmed).
