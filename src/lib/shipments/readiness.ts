/**
 * Step 9 — Nafeza & CargoX Preparation (Internal Readiness Evaluation)
 *
 * Pure evaluation function for Step 9 internal readiness checks.
 * Can be imported by both Server and Client components.
 */

import { Company } from "@/types/company";
import { DocumentItem, matchFinalDocumentType } from "@/types/document";
import { Shipment, ShipmentPricing, ShipmentAcid } from "@/types/shipment";
import {
  ShipmentReadinessResult,
  ReadinessCheckItem,
} from "@/types/readiness";

/**
 * Evaluates the 10 internal prerequisites for a shipment:
 *  1. Company Data
 *  2. Shipment Data
 *  3. Pricing
 *  4. Customer Pricing Approval
 *  5. Preliminary Invoice
 *  6. ACID Record
 *  7. Commercial Invoice
 *  8. Packing List
 *  9. Bill of Lading
 * 10. Certificate of Origin
 */
export function evaluateShipmentReadiness({
  shipment,
  company,
  pricing = null,
  acid = null,
  documents = [],
}: {
  shipment: Shipment;
  company: Company | null;
  pricing?: ShipmentPricing | null;
  acid?: ShipmentAcid | null;
  documents: DocumentItem[];
}): ShipmentReadinessResult {
  // ─── 1. Company Data Check ──────────────────────────────────────────────────
  const missingCompanyFields: string[] = [];
  if (!company?.name?.trim()) missingCompanyFields.push("اسم الشركة");
  if (!company?.commercial_registration_number?.trim()) {
    missingCompanyFields.push("رقم السجل التجاري");
  }
  if (!company?.tax_card_number?.trim()) {
    missingCompanyFields.push("رقم البطاقة الضريبية");
  }
  if (!company?.import_card_number?.trim()) {
    missingCompanyFields.push("رقم البطاقة الاستيرادية");
  }
  if (!company?.vat_number?.trim()) {
    missingCompanyFields.push("رقم ضريبة القيمة المضافة");
  }

  const companyDataReady = missingCompanyFields.length === 0;
  const companyDataCheck: ReadinessCheckItem = {
    key: "company_data",
    name: "بيانات الشركة",
    ready: companyDataReady,
    statusText: companyDataReady ? "مكتملة" : "غير مكتملة",
    explanation: companyDataReady
      ? "كافة بيانات الشركة والبطاقات الضريبية والاستيرادية مسجلة ومكتملة"
      : `بيانات ناقصة: ${missingCompanyFields.join("، ")}`,
    missingFields: missingCompanyFields,
  };

  // ─── 2. Shipment Information Check ──────────────────────────────────────────
  const missingShipmentFields: string[] = [];
  if (!shipment.supplier_name?.trim()) missingShipmentFields.push("اسم المورد");
  if (!shipment.country_of_origin?.trim()) missingShipmentFields.push("بلد المنشأ");
  if (!shipment.port_of_arrival?.trim()) missingShipmentFields.push("ميناء الوصول");
  if (!shipment.goods_description?.trim()) missingShipmentFields.push("وصف البضاعة");
  if (
    shipment.packages_count === null ||
    shipment.packages_count === undefined ||
    Number(shipment.packages_count) <= 0
  ) {
    missingShipmentFields.push("عدد الطرود");
  }
  if (!shipment.package_type?.trim()) missingShipmentFields.push("نوع الطرود");
  if (
    shipment.gross_weight === null ||
    shipment.gross_weight === undefined ||
    Number(shipment.gross_weight) <= 0
  ) {
    missingShipmentFields.push("الوزن الإجمالي");
  }

  const shipmentDataReady = missingShipmentFields.length === 0;
  const shipmentDataCheck: ReadinessCheckItem = {
    key: "shipment_data",
    name: "بيانات الشحنة",
    ready: shipmentDataReady,
    statusText: shipmentDataReady ? "مكتملة" : "غير مكتملة",
    explanation: shipmentDataReady
      ? "بيانات البضاعة والمورد والميناء والطرود والوزن مكتملة"
      : `بيانات ناقصة: ${missingShipmentFields.join("، ")}`,
    missingFields: missingShipmentFields,
  };

  // ─── 3. Pricing Check ───────────────────────────────────────────────────────
  const pricingExists = Boolean(
    pricing &&
      (pricing.final_price !== null ||
        (pricing.estimated_min_price !== null && pricing.estimated_max_price !== null)),
  );
  const pricingCheck: ReadinessCheckItem = {
    key: "pricing",
    name: "التسعير",
    ready: pricingExists,
    statusText: pricingExists ? "تم الاتفاق على السعر" : "لم يتم التسعير",
    explanation: pricingExists
      ? `تم تسعير الشحنة (السعر المتفق عليه: ${pricing?.final_price ?? `${pricing?.estimated_min_price} - ${pricing?.estimated_max_price}`} ${pricing?.currency || "EGP"})`
      : "لم يتم تقديم أو اعتماد عرض السعر للشحنة بعد",
  };

  // ─── 4. Customer Pricing Approval Check ─────────────────────────────────────
  const pricingApproved = Boolean(
    pricing &&
      (pricing.status === "customer_approved" || pricing.customer_approved_at !== null),
  );
  const customerApprovalCheck: ReadinessCheckItem = {
    key: "customer_pricing_approval",
    name: "موافقة العميل على السعر",
    ready: pricingApproved,
    statusText: pricingApproved ? "تمت الموافقة" : "بانتظار موافقة العميل",
    explanation: pricingApproved
      ? "وافق العميل على التسعير النهائي للشحنة"
      : "لم يقم العميل بالموافقة على عرض السعر بعد",
  };

  // ─── 5. Preliminary Invoice Check ───────────────────────────────────────────
  const prelimDoc =
    documents.find(
      (d) =>
        d.document_type === "preliminary_invoice" ||
        d.document_type === "فاتورة مبدئية" ||
        d.title === "الفاتورة المبدئية" ||
        d.title?.includes("مبدئية"),
    ) ||
    (documents.length > 0 && !matchFinalDocumentType(documents[0].document_type)
      ? documents[0]
      : null);

  const prelimExists = Boolean(prelimDoc);
  const prelimApproved = Boolean(prelimDoc && prelimDoc.status === "approved");
  const prelimRevision = Boolean(prelimDoc && prelimDoc.status === "revision_required");

  let prelimStatusText = "غير مرفوعة";
  let prelimExplanation = "لم يتم العثور على الفاتورة المبدئية للشحنة";
  if (prelimApproved) {
    prelimStatusText = "معتمدة";
    prelimExplanation = "تم اعتماد الفاتورة المبدئية بنجاح من إدارة العمليات";
  } else if (prelimRevision) {
    prelimStatusText = "مطلوب تعديل";
    prelimExplanation = "الفاتورة المبدئية بانتظار تعديل واستبدال من العميل";
  } else if (prelimExists) {
    prelimStatusText = "قيد المراجعة";
    prelimExplanation = "الفاتورة المبدئية مرفوعة ولكن لم يتم اعتمادها بعد";
  }

  const preliminaryInvoiceCheck: ReadinessCheckItem = {
    key: "preliminary_invoice",
    name: "الفاتورة المبدئية",
    ready: prelimApproved,
    statusText: prelimStatusText,
    explanation: prelimExplanation,
  };

  // ─── 6. ACID Record Check ───────────────────────────────────────────────────
  const acidHasNumber = Boolean(acid && acid.acid_number?.trim());
  const acidIssued = Boolean(acidHasNumber && acid?.status === "issued");

  let acidStatusText = "غير صادر";
  let acidExplanation = "لم يتم إصدار رقم ACID للشحنة بعد";
  if (acidIssued) {
    acidStatusText = "تم الإصدار";
    acidExplanation = `تم إصدار ACID بنجاح: ${acid?.acid_number}`;
  } else if (acidHasNumber) {
    acidStatusText = "قيد المعالجة";
    acidExplanation = `رقم ACID مسجل ولكن الحالة الحالية: ${acid?.status}`;
  }

  const acidCheck: ReadinessCheckItem = {
    key: "acid",
    name: "رقم ACID الجمركي",
    ready: acidIssued,
    statusText: acidStatusText,
    explanation: acidExplanation,
  };

  // ─── 7–10. Final 4 Shipment Documents Checks ────────────────────────────────
  const evaluateFinalDoc = (
    docKey: "commercial_invoice" | "packing_list" | "bill_of_lading" | "certificate_of_origin",
    titleAr: string,
  ): ReadinessCheckItem => {
    const doc = documents.find(
      (d) => matchFinalDocumentType(d.document_type) === docKey,
    );

    if (!doc) {
      return {
        key: docKey,
        name: titleAr,
        ready: false,
        statusText: "غير مرفوعة",
        explanation: `لم يقم العميل برفع ${titleAr} بعد`,
      };
    }

    if (doc.status === "approved") {
      return {
        key: docKey,
        name: titleAr,
        ready: true,
        statusText: "معتمدة",
        explanation: `تم اعتماد ${titleAr} بنجاح`,
      };
    }

    if (doc.status === "revision_required") {
      return {
        key: docKey,
        name: titleAr,
        ready: false,
        statusText: "مطلوب تعديل",
        explanation: `مطلوب تعديل ${titleAr} وبانتظار استبدالها من العميل`,
      };
    }

    return {
      key: docKey,
      name: titleAr,
      ready: false,
      statusText: "قيد المراجعة",
      explanation: `${titleAr} مرفوعة وتنتظر اعتماد إدارة العمليات`,
    };
  };

  const commInvCheck = evaluateFinalDoc(
    "commercial_invoice",
    "الفاتورة التجارية (Commercial Invoice)",
  );
  const packListCheck = evaluateFinalDoc(
    "packing_list",
    "قائمة التعبئة (Packing List)",
  );
  const bolCheck = evaluateFinalDoc(
    "bill_of_lading",
    "بوليصة الشحن (Bill of Lading)",
  );
  const cooCheck = evaluateFinalDoc(
    "certificate_of_origin",
    "شهادة المنشأ (Certificate of Origin)",
  );

  const checks = {
    company_data: companyDataCheck,
    shipment_data: shipmentDataCheck,
    pricing: pricingCheck,
    customer_pricing_approval: customerApprovalCheck,
    preliminary_invoice: preliminaryInvoiceCheck,
    acid: acidCheck,
    commercial_invoice: commInvCheck,
    packing_list: packListCheck,
    bill_of_lading: bolCheck,
    certificate_of_origin: cooCheck,
  };

  const checkValues = Object.values(checks);
  const total = checkValues.length;
  const passed = checkValues.filter((c) => c.ready).length;
  const failed = total - passed;
  const ready = passed === total;

  return {
    ready,
    checks,
    summary: { total, passed, failed },
  };
}
