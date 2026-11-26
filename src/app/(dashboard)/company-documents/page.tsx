import { redirect } from "next/navigation";
import { routes } from "@/config/app";

/**
 * Company Documents route redirects to Customers Management (/customers).
 * Corporate documents are managed per-customer at /customers/[id].
 */
export default function CompanyDocumentsPage() {
  redirect(routes.customers);
}
