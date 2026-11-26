/**
 * Shipment Data Queries — Server Side
 *
 * Secure database queries for Customer and Admin shipments.
 * Enforces customer isolation, role authorization, and attaches signed URLs for shipment documents.
 */

import { createClient } from "@/lib/supabase/server";
import { requireAuth, requireRole } from "@/lib/auth/guards";
import { getCustomerCompany, getCompanyById } from "@/lib/company/queries";
import type {
  Shipment,
  AdminShipmentItem,
  ShipmentFilters,
  DocumentItem,
  DocumentStatus,
  Company,
  Customer,
  ShipmentPricing,
  ShipmentPricingHistoryItem,
  ShipmentInvoiceReview,
  ShipmentAcid,
  ShipmentAcidHistoryItem,
  ShipmentDocumentReviewItem,
  ShipmentDocumentProgress,
  FinalShipmentDocumentType,
  ShipmentStageHistoryItem,
  ShipmentExternalOperation,
} from "@/types";
import { matchFinalDocumentType } from "@/types/document";
import { getShipmentExternalOperations } from "./external-operations-queries";
import { getShipmentCustomsJourney } from "./journey-queries";
import type { ShipmentCustomsJourney } from "@/types/journey";

/**
 * Helper to generate signed URLs for a batch of documents from the 'documents' bucket.
 */
async function attachSignedUrls(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  documents: DocumentItem[],
): Promise<DocumentItem[]> {
  if (documents.length === 0) return [];

  const promises = documents.map(async (doc) => {
    if (!doc.file_path) return doc;
    try {
      const { data } = await supabase.storage
        .from("documents")
        .createSignedUrl(doc.file_path, 3600);
      return {
        ...doc,
        file_url: data?.signedUrl || doc.file_url || null,
      };
    } catch {
      return doc;
    }
  });

  return Promise.all(promises);
}

/**
 * Fetch all shipments belonging to the authenticated customer's company.
 * Returns an empty array if the customer has no linked company.
 */
export async function getCustomerShipments(): Promise<Shipment[]> {
  await requireAuth();
  const company = await getCustomerCompany();

  if (!company) {
    return [];
  }

  const supabase = await createClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from("shipments") as any)
    .select(`
      *,
      shipment_pricing (*),
      shipment_acids (*)
    `)
    .eq("company_id", company.id)
    .order("created_at", { ascending: false });

  if (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("[getCustomerShipments] Query error:", error.message);
    }
    return [];
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data || []).map((row: any) => {
    const pricingRaw = Array.isArray(row.shipment_pricing)
      ? row.shipment_pricing[0]
      : row.shipment_pricing;
    const pricing = pricingRaw
      ? {
          ...pricingRaw,
          estimated_min_price: Number(pricingRaw.estimated_min_price),
          estimated_max_price: Number(pricingRaw.estimated_max_price),
          final_price:
            pricingRaw.final_price !== null ? Number(pricingRaw.final_price) : null,
        }
      : null;

    const acidRaw = Array.isArray(row.shipment_acids)
      ? row.shipment_acids[0]
      : row.shipment_acids;
    const acid: ShipmentAcid | null = acidRaw ? (acidRaw as ShipmentAcid) : null;

    return {
      ...row,
      pricing,
      acid,
    } as Shipment;
  });
}

/**
 * Fetch a single shipment by ID for the current authenticated user.
 * Ensures customer can only view shipments belonging to their company.
 */
export async function getShipmentById(id: string): Promise<Shipment | null> {
  if (!id) return null;
  const currentUser = await requireAuth();
  const supabase = await createClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from("shipments") as any)
    .select(`
      *,
      shipment_acids (*)
    `)
    .eq("id", id)
    .maybeSingle();

  if (error || !data) {
    if (process.env.NODE_ENV === "development" && error) {
      console.error("[getShipmentById] Query error:", error.message);
    }
    return null;
  }

  const acidRaw = Array.isArray(data.shipment_acids)
    ? data.shipment_acids[0]
    : data.shipment_acids;
  const acid: ShipmentAcid | null = acidRaw ? (acidRaw as ShipmentAcid) : null;

  const shipment: Shipment = {
    ...data,
    acid,
  };

  // If user is a customer, verify ownership via company or customer_id
  if (currentUser.role === "customer") {
    const company = await getCustomerCompany();
    if (!company || shipment.company_id !== company.id) {
      return null;
    }
  }

  return shipment;
}

/**
 * Fetch shipment documents from the existing 'documents' table for a given shipment,
 * and attach secure signed URLs.
 */
export async function getShipmentDocuments(
  shipmentId: string,
): Promise<DocumentItem[]> {
  if (!shipmentId) return [];
  const supabase = await createClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from("documents") as any)
    .select("*")
    .eq("shipment_id", shipmentId)
    .order("created_at", { ascending: false });

  if (error || !data) {
    if (process.env.NODE_ENV === "development" && error) {
      console.error("[getShipmentDocuments] Query error:", error.message);
    }
    return [];
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawDocs: DocumentItem[] = (data || []).map((row: any) => ({
    id: row.id,
    title: row.title || row.file_name || "مستند شحنة",
    file_name: row.file_name,
    file_path: row.file_path,
    file_url: null,
    file_type: row.mime_type ?? null,
    file_size: row.file_size ? Number(row.file_size) : null,
    document_type: row.document_type ?? null,
    status: (row.status as DocumentStatus) || "pending",
    approved_at: row.approved_at ?? null,
    approved_by: row.approved_by ?? null,
    review_note: row.review_note ?? null,
    reviewed_at: row.reviewed_at ?? null,
    reviewed_by: row.reviewed_by ?? null,
    customer_id: row.customer_id,
    company_id: row.company_id ?? null,
    shipment_id: row.shipment_id ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }));

  return attachSignedUrls(supabase, rawDocs);
}

export interface AdminShipmentsResult {
  shipments: AdminShipmentItem[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * Fetch all shipments for Admin with pagination, search, and status filter.
 * Includes joined company name and customer contact details.
 */
export async function getAdminShipments({
  query,
  status = "all",
  page = 1,
  pageSize = 10,
}: ShipmentFilters = {}): Promise<AdminShipmentsResult> {
  const currentUser = await requireRole(["admin", "manager", "data_entry", "inspector", "scout"]);
  const isSuperAdmin = currentUser.role === "admin" || currentUser.role === "manager";
  const supabase = await createClient();

  const safePage = Math.max(1, Number(page) || 1);
  const safePageSize = Math.min(50, Math.max(1, Number(pageSize) || 10));
  const from = (safePage - 1) * safePageSize;
  const to = from + safePageSize - 1;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let dbQuery = (supabase.from("shipments") as any)
    .select(
      `
      *,
      companies:company_id ( name ),
      profiles:customer_id ( full_name, email, phone ),
      shipment_pricing (*),
      shipment_acids (*)
    `,
      { count: "exact" },
    );

  if (status && status !== "all") {
    dbQuery = dbQuery.eq("status", status);
  }

  if (query && query.trim()) {
    const cleanQ = query.trim().replace(/[%_]/g, "");
    if (cleanQ.length > 0) {
      dbQuery = dbQuery.or(
        `reference_number.ilike.%${cleanQ}%,goods_description.ilike.%${cleanQ}%,supplier_name.ilike.%${cleanQ}%,port_of_arrival.ilike.%${cleanQ}%`,
      );
    }
  }

  dbQuery = dbQuery.order("created_at", { ascending: false }).range(from, to);

  const { data, count, error } = await dbQuery;

  if (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("[getAdminShipments] Query error:", error.message);
    }
    return {
      shipments: [],
      totalCount: 0,
      page: safePage,
      pageSize: safePageSize,
      totalPages: 1,
    };
  }

  const totalCount = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / safePageSize));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const shipments: AdminShipmentItem[] = (data || []).map((row: any) => {
    const pricingRaw = Array.isArray(row.shipment_pricing)
      ? row.shipment_pricing[0]
      : row.shipment_pricing;
    const pricing = isSuperAdmin && pricingRaw
      ? {
          ...pricingRaw,
          estimated_min_price: Number(pricingRaw.estimated_min_price),
          estimated_max_price: Number(pricingRaw.estimated_max_price),
          final_price:
            pricingRaw.final_price !== null ? Number(pricingRaw.final_price) : null,
        }
      : null;

    const acidRaw = Array.isArray(row.shipment_acids)
      ? row.shipment_acids[0]
      : row.shipment_acids;
    const acid: ShipmentAcid | null = acidRaw ? (acidRaw as ShipmentAcid) : null;

    return {
      id: row.id,
      company_id: row.company_id,
      customer_id: row.customer_id,
      created_by: row.created_by,
      reference_number: row.reference_number,
      status: row.status,
      supplier_name: row.supplier_name,
      country_of_origin: row.country_of_origin,
      port_of_arrival: row.port_of_arrival,
      goods_description: row.goods_description,
      packages_count: row.packages_count,
      package_type: row.package_type,
      gross_weight: row.gross_weight,
      notes: row.notes,
      created_at: row.created_at,
      updated_at: row.updated_at,
      company_name: row.companies?.name || "شركة غير محددة",
      customer_name: row.profiles?.full_name || null,
      customer_email: row.profiles?.email || null,
      customer_phone: row.profiles?.phone || null,
      pricing,
      acid,
    };
  });

  return {
    shipments,
    totalCount,
    page: safePage,
    pageSize: safePageSize,
    totalPages,
  };
}

export interface AdminShipmentDetailsResult {
  shipment: Shipment;
  company: Company | null;
  customer: Customer | null;
  documents: DocumentItem[];
  pricing: ShipmentPricing | null;
  pricingHistory: ShipmentPricingHistoryItem[];
  invoiceReviews: ShipmentInvoiceReview[];
  acid: ShipmentAcid | null;
  acidHistory: ShipmentAcidHistoryItem[];
  documentReviews: ShipmentDocumentReviewItem[];
  stageHistory: ShipmentStageHistoryItem[];
  externalOperations: ShipmentExternalOperation[];
  journey?: ShipmentCustomsJourney | null;
}

/**
 * Fetch the audit trail history of invoice reviews for a shipment.
 */
export async function getShipmentInvoiceReviews(
  shipmentId: string,
): Promise<ShipmentInvoiceReview[]> {
  if (!shipmentId) return [];
  const supabase = await createClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from("shipment_invoice_reviews") as any)
    .select(`
      *,
      profiles:performed_by ( full_name )
    `)
    .eq("shipment_id", shipmentId)
    .order("performed_at", { ascending: true });

  if (error || !data) {
    return [];
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data || []).map((row: any) => ({
    id: row.id,
    shipment_id: row.shipment_id,
    document_id: row.document_id,
    action: row.action,
    note: row.note,
    performed_by: row.performed_by,
    performed_by_name: row.profiles?.full_name || null,
    performed_at: row.performed_at,
  }));
}

/**
 * Fetch the pricing record for a given shipment.
 */
export async function getShipmentPricing(
  shipmentId: string,
): Promise<ShipmentPricing | null> {
  if (!shipmentId) return null;
  const supabase = await createClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from("shipment_pricing") as any)
    .select(`
      *,
      approver:customer_approved_by ( full_name )
    `)
    .eq("shipment_id", shipmentId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return {
    ...data,
    estimated_min_price: Number(data.estimated_min_price),
    estimated_max_price: Number(data.estimated_max_price),
    final_price: data.final_price !== null ? Number(data.final_price) : null,
    customer_approved_by_name: data.approver?.full_name || null,
  } as ShipmentPricing;
}

/**
 * Fetch the audit trail history of pricing events for a shipment.
 */
export async function getShipmentPricingHistory(
  shipmentId: string,
): Promise<ShipmentPricingHistoryItem[]> {
  if (!shipmentId) return [];
  const supabase = await createClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from("shipment_pricing_history") as any)
    .select(`
      *,
      profiles:performed_by ( full_name )
    `)
    .eq("shipment_id", shipmentId)
    .order("performed_at", { ascending: true });

  if (error || !data) {
    return [];
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data || []).map((row: any) => ({
    id: row.id,
    shipment_id: row.shipment_id,
    pricing_id: row.pricing_id,
    action: row.action,
    estimated_min_price:
      row.estimated_min_price !== null ? Number(row.estimated_min_price) : null,
    estimated_max_price:
      row.estimated_max_price !== null ? Number(row.estimated_max_price) : null,
    final_price: row.final_price !== null ? Number(row.final_price) : null,
    currency: row.currency || "EGP",
    performed_by: row.performed_by,
    performed_by_name: row.profiles?.full_name || null,
    performed_at: row.performed_at,
    notes: row.notes,
  }));
}

/**
 * Fetch the ACID record for a given shipment.
 */
export async function getShipmentAcid(
  shipmentId: string,
): Promise<ShipmentAcid | null> {
  if (!shipmentId) return null;
  const supabase = await createClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from("shipment_acids") as any)
    .select(`
      *,
      creator:created_by ( full_name ),
      updater:updated_by ( full_name )
    `)
    .eq("shipment_id", shipmentId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return {
    ...data,
    created_by_name: data.creator?.full_name || null,
    updated_by_name: data.updater?.full_name || null,
  } as ShipmentAcid;
}

/**
 * Fetch the audit trail history of ACID events for a shipment.
 */
export async function getShipmentAcidHistory(
  shipmentId: string,
): Promise<ShipmentAcidHistoryItem[]> {
  if (!shipmentId) return [];
  const supabase = await createClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from("shipment_acid_history") as any)
    .select(`
      *,
      profiles:performed_by ( full_name )
    `)
    .eq("shipment_id", shipmentId)
    .order("performed_at", { ascending: true });

  if (error || !data) {
    return [];
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data || []).map((row: any) => ({
    id: row.id,
    shipment_acid_id: row.shipment_acid_id,
    shipment_id: row.shipment_id,
    action: row.action,
    old_status: row.old_status,
    new_status: row.new_status,
    acid_number: row.acid_number,
    notes: row.notes,
    performed_by: row.performed_by,
    performed_by_name: row.profiles?.full_name || null,
    performed_at: row.performed_at,
  }));
}

/**
 * Fetch comprehensive shipment details for Admin view:
 * Shipment data + Company details + Customer details + Shipment Documents + Pricing + History + Invoice Reviews + ACID.
 */
export async function getAdminShipmentDetails(
  id: string,
): Promise<AdminShipmentDetailsResult | null> {
  const currentUser = await requireRole(["admin", "manager", "data_entry", "inspector", "scout"]);
  const isSuperAdmin = currentUser.role === "admin" || currentUser.role === "manager";
  const supabase = await createClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: shipmentRow, error } = await (supabase.from("shipments") as any)
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error || !shipmentRow) {
    if (process.env.NODE_ENV === "development" && error) {
      console.error("[getAdminShipmentDetails] Query error:", error.message);
    }
    return null;
  }

  const shipment = shipmentRow as Shipment;

  const [
    company,
    customerRes,
    documents,
    pricing,
    pricingHistory,
    invoiceReviews,
    acid,
    acidHistory,
    documentReviews,
    stageHistory,
    externalOperations,
    journey,
  ] = await Promise.all([
    getCompanyById(shipment.company_id),
    supabase
      .from("profiles")
      .select("*")
      .eq("id", shipment.customer_id)
      .maybeSingle(),
    getShipmentDocuments(shipment.id),
    isSuperAdmin ? getShipmentPricing(shipment.id) : Promise.resolve(null),
    isSuperAdmin ? getShipmentPricingHistory(shipment.id) : Promise.resolve([]),
    getShipmentInvoiceReviews(shipment.id),
    getShipmentAcid(shipment.id),
    getShipmentAcidHistory(shipment.id),
    getShipmentDocumentReviews(shipment.id),
    getShipmentStageHistory(shipment.id),
    getShipmentExternalOperations(shipment.id),
    getShipmentCustomsJourney(shipment.id),
  ]);

  return {
    shipment,
    company,
    customer: (customerRes.data as unknown as Customer) || null,
    documents,
    pricing,
    pricingHistory,
    invoiceReviews,
    acid,
    acidHistory,
    documentReviews,
    stageHistory,
    externalOperations,
    journey,
  };
}

/**
 * Fetch the audit trail history of final shipment document reviews.
 */
export async function getShipmentDocumentReviews(
  shipmentId: string,
): Promise<ShipmentDocumentReviewItem[]> {
  if (!shipmentId) return [];
  const supabase = await createClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from("shipment_document_reviews") as any)
    .select(`
      *,
      profiles:performed_by ( full_name )
    `)
    .eq("shipment_id", shipmentId)
    .order("performed_at", { ascending: true });

  if (error || !data) {
    return [];
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data || []).map((row: any) => ({
    id: row.id,
    document_id: row.document_id,
    shipment_id: row.shipment_id,
    document_type: row.document_type,
    action: row.action,
    note: row.note,
    performed_by: row.performed_by,
    performed_by_name: row.profiles?.full_name || null,
    performed_at: row.performed_at,
  }));
}

/**
 * Fetch the audit trail history of shipment stage transitions (e.g. ready_for_external_stage).
 */
export async function getShipmentStageHistory(
  shipmentId: string,
): Promise<ShipmentStageHistoryItem[]> {
  if (!shipmentId) return [];
  const supabase = await createClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from("shipment_stage_history") as any)
    .select(`
      *,
      profiles:performed_by ( full_name )
    `)
    .eq("shipment_id", shipmentId)
    .order("performed_at", { ascending: true });

  if (error || !data) {
    return [];
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data || []).map((row: any) => ({
    id: row.id,
    shipment_id: row.shipment_id,
    action: row.action,
    note: row.note,
    performed_by: row.performed_by,
    performed_by_name: row.profiles?.full_name || null,
    performed_at: row.performed_at,
  }));
}

/**
 * Calculate the progress metrics for the 4 core final shipment documents.
 */
export function calculateShipmentDocumentProgress(
  documents: DocumentItem[],
): ShipmentDocumentProgress {
  const finalDocs = new Map<FinalShipmentDocumentType, DocumentItem>();

  for (const doc of documents) {
    const matched = matchFinalDocumentType(doc.document_type);
    if (matched) {
      finalDocs.set(matched, doc);
    }
  }

  let approvedCount = 0;
  let pendingCount = 0;
  let revisionCount = 0;

  for (const doc of finalDocs.values()) {
    if (doc.status === "approved") {
      approvedCount++;
    } else if (doc.status === "revision_required") {
      revisionCount++;
    } else {
      pendingCount++;
    }
  }

  const uploadedCount = finalDocs.size;
  const totalRequired = 4;
  const missingCount = Math.max(0, totalRequired - uploadedCount);

  return {
    totalRequired,
    uploadedCount,
    approvedCount,
    pendingCount,
    revisionCount,
    missingCount,
    isAllUploaded: uploadedCount >= totalRequired,
    isAllApproved: approvedCount >= totalRequired,
  };
}
