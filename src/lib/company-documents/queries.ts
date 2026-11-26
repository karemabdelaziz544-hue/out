/**
 * Company Documents Queries — Server Side
 *
 * Dedicated queries for the independent Company Documents system.
 * Zero dependency on shipment documents.
 */

import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/guards";
import { getCustomerCompany } from "@/lib/company/queries";
import type {
  CompanyDocument,
  CompanyDocumentType,
  AdminCompanyDocumentItem,
} from "@/types";
import { COMPANY_DOCUMENT_TYPES } from "@/types";

export interface CompanyDocumentsSummary {
  documents: Record<CompanyDocumentType, CompanyDocument | null>;
  totalCount: number;
  completedCount: number;
  approvedCount: number;
  remainingCount: number;
  isAllUploaded: boolean;
  isAllApproved: boolean;
}

/**
 * Attach temporary signed URLs from the 'company-documents' bucket.
 */
async function attachCompanySignedUrls(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  docs: CompanyDocument[],
): Promise<CompanyDocument[]> {
  if (docs.length === 0) return [];

  const promises = docs.map(async (doc) => {
    if (!doc.file_path) return doc;
    try {
      const { data, error } = await supabase.storage
        .from("company-documents")
        .createSignedUrl(doc.file_path, 3600);
      if (error || !data?.signedUrl) return doc;
      return {
        ...doc,
        file_url: data.signedUrl,
      };
    } catch {
      return doc;
    }
  });

  return Promise.all(promises);
}

/**
 * Fetch company documents stats for Admin dashboard.
 */
export async function getCompanyDocumentsStats(): Promise<{
  total: number;
  pending: number;
  approved: number;
}> {
  await requireRole(["admin"]);
  const supabase = await createClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from("company_documents") as any)
    .select("status");

  if (error || !data) {
    return { total: 0, pending: 0, approved: 0 };
  }

  const total = data.length;
  const pending = data.filter((d: { status: string }) => d.status === "pending").length;
  const approved = data.filter((d: { status: string }) => d.status === "approved").length;

  return { total, pending, approved };
}

/**
 * Fetch all company documents for the current customer's company.
 */
export async function getCustomerCompanyDocuments(): Promise<CompanyDocument[]> {
  const company = await getCustomerCompany();
  if (!company) return [];

  const supabase = await createClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from("company_documents") as any)
    .select("*")
    .eq("company_id", company.id)
    .order("uploaded_at", { ascending: false });

  if (error || !data) {
    if (process.env.NODE_ENV === "development" && error) {
      console.error("[getCustomerCompanyDocuments] Error:", error.message);
    }
    return [];
  }

  return attachCompanySignedUrls(supabase, data as CompanyDocument[]);
}

/**
 * Fetch structured summary of the 4 required company documents for the customer.
 */
export async function getCustomerCompanyDocumentsSummary(): Promise<CompanyDocumentsSummary> {
  const docs = await getCustomerCompanyDocuments();

  const map: Record<CompanyDocumentType, CompanyDocument | null> = {
    commercial_registration: null,
    tax_card: null,
    import_card: null,
    vat: null,
  };

  for (const doc of docs) {
    if (COMPANY_DOCUMENT_TYPES.includes(doc.document_type)) {
      map[doc.document_type] = doc;
    }
  }

  const completedCount = Object.values(map).filter(Boolean).length;
  const approvedCount = Object.values(map).filter((d) => d?.status === "approved").length;
  const totalCount = 4;
  const remainingCount = totalCount - completedCount;

  return {
    documents: map,
    totalCount,
    completedCount,
    approvedCount,
    remainingCount,
    isAllUploaded: remainingCount === 0,
    isAllApproved: approvedCount === totalCount,
  };
}

/**
 * Fetch structured summary of company documents by company ID (for Admin Customer Details view).
 */
export async function getCompanyDocumentsByCompanyId(
  companyId: string,
): Promise<CompanyDocumentsSummary> {
  const map: Record<CompanyDocumentType, CompanyDocument | null> = {
    commercial_registration: null,
    tax_card: null,
    import_card: null,
    vat: null,
  };

  if (!companyId) {
    return {
      documents: map,
      totalCount: 4,
      completedCount: 0,
      approvedCount: 0,
      remainingCount: 4,
      isAllUploaded: false,
      isAllApproved: false,
    };
  }

  const supabase = await createClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from("company_documents") as any)
    .select("*")
    .eq("company_id", companyId)
    .order("uploaded_at", { ascending: false });

  const rawDocs = error || !data ? [] : (data as CompanyDocument[]);
  const docs = await attachCompanySignedUrls(supabase, rawDocs);

  for (const doc of docs) {
    if (COMPANY_DOCUMENT_TYPES.includes(doc.document_type)) {
      map[doc.document_type] = doc;
    }
  }

  const completedCount = Object.values(map).filter(Boolean).length;
  const approvedCount = Object.values(map).filter((d) => d?.status === "approved").length;
  const totalCount = 4;
  const remainingCount = totalCount - completedCount;

  return {
    documents: map,
    totalCount,
    completedCount,
    approvedCount,
    remainingCount,
    isAllUploaded: remainingCount === 0,
    isAllApproved: approvedCount === totalCount,
  };
}

/**
 * Fetch all company documents for Admin management with pagination, search, and filtering.
 */
export async function getAdminCompanyDocuments(filters?: {
  query?: string;
  status?: string;
  page?: number;
  pageSize?: number;
}): Promise<{
  items: AdminCompanyDocumentItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}> {
  await requireRole(["admin"]);

  const page = Math.max(1, filters?.page || 1);
  const pageSize = Math.max(1, Math.min(100, filters?.pageSize || 10));
  const status = filters?.status && filters.status !== "all" ? filters.status : undefined;
  const searchQuery = filters?.query?.trim().toLowerCase() || "";

  const supabase = await createClient();

  // 1. Query company documents
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (supabase.from("company_documents") as any)
    .select("*", { count: "exact" })
    .order("uploaded_at", { ascending: false });

  if (status) {
    query = query.eq("status", status);
  }

  const { data: rawDocs, count: totalCount, error } = await query;

  if (error || !rawDocs) {
    if (process.env.NODE_ENV === "development" && error) {
      console.error("[getAdminCompanyDocuments] Error:", error.message);
    }
    return {
      items: [],
      total: 0,
      page,
      pageSize,
      totalPages: 1,
    };
  }

  // 2. Collect unique company IDs
  const companyIds = Array.from(new Set(rawDocs.map((d: CompanyDocument) => d.company_id)));

  // 3. Fetch companies and linked customer profiles
  const companyMap = new Map<string, { name: string; customerName?: string; customerEmail?: string }>();

  if (companyIds.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: companiesData } = await (supabase.from("companies") as any)
      .select("id, name")
      .in("id", companyIds);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: profilesData } = await (supabase.from("profiles") as any)
      .select("id, company_id, full_name, email")
      .in("company_id", companyIds);

    const profilesByCompany = new Map<string, { full_name: string | null; email: string }>();
    if (profilesData) {
      for (const p of profilesData) {
        if (p.company_id && !profilesByCompany.has(p.company_id)) {
          profilesByCompany.set(p.company_id, { full_name: p.full_name, email: p.email });
        }
      }
    }

    if (companiesData) {
      for (const c of companiesData) {
        const prof = profilesByCompany.get(c.id);
        companyMap.set(c.id, {
          name: c.name,
          customerName: prof?.full_name || "—",
          customerEmail: prof?.email || "—",
        });
      }
    }
  }

  // 4. Attach signed URLs and company/customer metadata
  const docsWithUrls = await attachCompanySignedUrls(supabase, rawDocs as CompanyDocument[]);

  let items: AdminCompanyDocumentItem[] = docsWithUrls.map((doc) => {
    const compInfo = companyMap.get(doc.company_id);
    return {
      ...doc,
      company_name: compInfo?.name || "شركة غير محددة",
      customer_name: compInfo?.customerName || "—",
      customer_email: compInfo?.customerEmail || "—",
    };
  });

  // 5. Apply search filter in-memory if query provided
  if (searchQuery) {
    items = items.filter(
      (item) =>
        item.company_name?.toLowerCase().includes(searchQuery) ||
        item.customer_name?.toLowerCase().includes(searchQuery) ||
        item.customer_email?.toLowerCase().includes(searchQuery) ||
        item.file_name?.toLowerCase().includes(searchQuery),
    );
  }

  const filteredTotal = searchQuery ? items.length : totalCount || items.length;
  const paginatedItems = items.slice((page - 1) * pageSize, page * pageSize);
  const totalPages = Math.max(1, Math.ceil(filteredTotal / pageSize));

  return {
    items: paginatedItems,
    total: filteredTotal,
    page,
    pageSize,
    totalPages,
  };
}
