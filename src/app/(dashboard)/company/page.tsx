/**
 * Customer Company Page
 *
 * Route: /company
 * Dedicated view for managing the authenticated customer's company information.
 * Strictly limited to customer role.
 */

import { connection } from "next/server";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { requireAuth } from "@/lib/auth/guards";
import { routes } from "@/config/app";
import { getCustomerCompany } from "@/lib/company/queries";
import { getCustomerCompanyDocumentsSummary } from "@/lib/company-documents/queries";
import {
  CompanyHeader,
  CompanyStatusBanner,
  CompanyForm,
  CompanyDocumentsSection,
} from "@/components/company";

export const instant = false;

export const metadata: Metadata = {
  title: "بيانات الشركة | OUT",
};

export default async function CompanyPage() {
  await connection();

  // 1. Enforce authentication server-side
  const currentUser = await requireAuth();

  // 2. Role authorization: only customers access this page
  if (currentUser.role !== "customer") {
    redirect(routes.dashboard);
  }

  // 3. Fetch the customer's linked company record (or null if none exists yet)
  const company = await getCustomerCompany();

  // 4. Fetch the company documents summary
  const docsSummary = await getCustomerCompanyDocumentsSummary();

  return (
    <div className="customers-container">
      {/* 1. Header */}
      <CompanyHeader />

      {/* 2. Company Completion Status Banner */}
      <CompanyStatusBanner company={company} />

      {/* 3. Company Information Form */}
      <CompanyForm initialCompany={company} />

      {/* 4. Company Documents Section */}
      <CompanyDocumentsSection
        documentsMap={docsSummary.documents}
        completedCount={docsSummary.completedCount}
        totalCount={docsSummary.totalCount}
      />
    </div>
  );
}

