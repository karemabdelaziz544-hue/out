/**
 * Documents Data Queries
 *
 * Server-side queries for the Documents Management Center and Customer Documents.
 * Directly queries Supabase and generates secure signed URLs for preview.
 */

import { createClient } from "@/lib/supabase/server";
import type {
  DocumentItem,
  DocumentStats,
  DocumentFilters,
  DocumentsData,
} from "@/types";

/**
 * Helper to generate signed URLs for a batch of documents.
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
 * Fetch documents summary statistics.
 */
export async function getDocumentStats(): Promise<DocumentStats> {
  try {
    const supabase = await createClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { count: total, error } = await (supabase.from("documents") as any)
      .select("*", { count: "exact", head: true });

    if (error) {
      return {
        totalDocuments: 0,
        pendingDocuments: 0,
        approvedDocuments: 0,
        customerDocuments: 0,
        shipmentDocuments: 0,
      };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { count: pendingCount } = await (supabase.from("documents") as any)
      .select("*", { count: "exact", head: true })
      .eq("status", "pending");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { count: approvedCount } = await (supabase.from("documents") as any)
      .select("*", { count: "exact", head: true })
      .eq("status", "approved");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { count: customerCount } = await (supabase.from("documents") as any)
      .select("*", { count: "exact", head: true })
      .not("customer_id", "is", null);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { count: shipmentCount } = await (supabase.from("documents") as any)
      .select("*", { count: "exact", head: true })
      .not("shipment_id", "is", null);

    return {
      totalDocuments: total ?? 0,
      pendingDocuments: pendingCount ?? 0,
      approvedDocuments: approvedCount ?? 0,
      customerDocuments: customerCount ?? 0,
      shipmentDocuments: shipmentCount ?? 0,
    };
  } catch (err) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[getDocumentStats] Exception:", err);
    }
    return {
      totalDocuments: 0,
      pendingDocuments: 0,
      approvedDocuments: 0,
      customerDocuments: 0,
      shipmentDocuments: 0,
    };
  }
}

/**
 * Fetch all documents (for Admin Documents Center).
 */
export async function getDocuments(
  filters: DocumentFilters = {},
): Promise<DocumentsData> {
  const {
    query = "",
    documentType,
    status = "all",
    page = 1,
    pageSize = 10,
  } = filters;

  const sanitizedPage = Math.max(1, page);
  const from = (sanitizedPage - 1) * pageSize;
  const to = from + pageSize - 1;

  try {
    const supabase = await createClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let dbQuery = (supabase.from("documents") as any)
      .select(
        `
        id,
        title,
        file_name,
        file_path,
        file_size,
        mime_type,
        document_type,
        status,
        approved_at,
        approved_by,
        customer_id,
        company_id,
        shipment_id,
        created_at,
        updated_at,
        profiles:customer_id (
          full_name,
          email,
          phone
        ),
        approver:approved_by (
          full_name
        )
      `,
        { count: "exact" },
      );

    if (status && status !== "all") {
      dbQuery = dbQuery.eq("status", status);
    }

    if (documentType && documentType !== "all") {
      dbQuery = dbQuery.eq("document_type", documentType);
    }

    const trimmed = query.trim();
    if (trimmed) {
      dbQuery = dbQuery.or(
        `title.ilike.%${trimmed}%,file_name.ilike.%${trimmed}%,document_type.ilike.%${trimmed}%`,
      );
    }

    dbQuery = dbQuery
      .order("created_at", { ascending: false })
      .range(from, to);

    const { data, count, error } = await dbQuery;

    if (error) {
      if (process.env.NODE_ENV === "development") {
        console.warn("[getDocuments] Query error:", error.message);
      }
      return {
        documents: [],
        totalCount: 0,
        page: sanitizedPage,
        pageSize,
        totalPages: 1,
        availableTypes: [],
      };
    }

    const totalCount = count ?? 0;
    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rawDocuments: DocumentItem[] = (data || []).map((row: any) => ({
      id: row.id,
      title: row.title || row.file_name || "مستند بدون عنوان",
      file_name: row.file_name,
      file_path: row.file_path,
      file_url: null,
      file_type: row.mime_type ?? null,
      file_size: row.file_size ? Number(row.file_size) : null,
      document_type: row.document_type ?? null,
      status: (row.status as "pending" | "approved") || "pending",
      approved_at: row.approved_at ?? null,
      approved_by: row.approved_by ?? null,
      approver_name: row.approver?.full_name ?? null,
      customer_id: row.customer_id ?? null,
      customer_name: row.profiles?.full_name ?? null,
      customer_email: row.profiles?.email ?? null,
      customer_phone: row.profiles?.phone ?? null,
      company_id: row.company_id ?? null,
      shipment_id: row.shipment_id ?? null,
      shipment_number: null,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }));

    const documentsWithUrls = await attachSignedUrls(supabase, rawDocuments);

    return {
      documents: documentsWithUrls,
      totalCount,
      page: sanitizedPage,
      pageSize,
      totalPages,
      availableTypes: [],
    };
  } catch (err) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[getDocuments] Exception:", err);
    }
    return {
      documents: [],
      totalCount: 0,
      page: sanitizedPage,
      pageSize,
      totalPages: 1,
      availableTypes: [],
    };
  }
}

/**
 * Fetch documents for a specific customer (for /my-documents and /customers/[id]).
 */
export async function getCustomerDocuments(
  customerId: string,
  filters: DocumentFilters = {},
): Promise<DocumentsData> {
  const {
    query = "",
    documentType,
    status = "all",
    page = 1,
    pageSize = 10,
  } = filters;

  const sanitizedPage = Math.max(1, page);
  const from = (sanitizedPage - 1) * pageSize;
  const to = from + pageSize - 1;

  try {
    const supabase = await createClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let dbQuery = (supabase.from("documents") as any)
      .select(
        `
        id,
        title,
        file_name,
        file_path,
        file_size,
        mime_type,
        document_type,
        status,
        approved_at,
        approved_by,
        customer_id,
        company_id,
        shipment_id,
        created_at,
        updated_at
      `,
        { count: "exact" },
      )
      .eq("customer_id", customerId);

    if (status && status !== "all") {
      dbQuery = dbQuery.eq("status", status);
    }

    if (documentType && documentType !== "all") {
      dbQuery = dbQuery.eq("document_type", documentType);
    }

    const trimmed = query.trim();
    if (trimmed) {
      dbQuery = dbQuery.or(
        `title.ilike.%${trimmed}%,file_name.ilike.%${trimmed}%,document_type.ilike.%${trimmed}%`,
      );
    }

    dbQuery = dbQuery
      .order("created_at", { ascending: false })
      .range(from, to);

    const { data, count, error } = await dbQuery;

    if (error) {
      if (process.env.NODE_ENV === "development") {
        console.warn("[getCustomerDocuments] Query error:", error.message);
      }
      return {
        documents: [],
        totalCount: 0,
        page: sanitizedPage,
        pageSize,
        totalPages: 1,
        availableTypes: [],
      };
    }

    const totalCount = count ?? 0;
    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rawDocuments: DocumentItem[] = (data || []).map((row: any) => ({
      id: row.id,
      title: row.title || row.file_name || "مستند بدون عنوان",
      file_name: row.file_name,
      file_path: row.file_path,
      file_url: null,
      file_type: row.mime_type ?? null,
      file_size: row.file_size ? Number(row.file_size) : null,
      document_type: row.document_type ?? null,
      status: (row.status as "pending" | "approved") || "pending",
      approved_at: row.approved_at ?? null,
      approved_by: row.approved_by ?? null,
      approver_name: null,
      customer_id: row.customer_id,
      customer_name: null,
      customer_email: null,
      customer_phone: null,
      company_id: row.company_id ?? null,
      shipment_id: row.shipment_id ?? null,
      shipment_number: null,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }));

    const documentsWithUrls = await attachSignedUrls(supabase, rawDocuments);

    return {
      documents: documentsWithUrls,
      totalCount,
      page: sanitizedPage,
      pageSize,
      totalPages,
      availableTypes: [],
    };
  } catch (err) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[getCustomerDocuments] Exception:", err);
    }
    return {
      documents: [],
      totalCount: 0,
      page: sanitizedPage,
      pageSize,
      totalPages: 1,
      availableTypes: [],
    };
  }
}
