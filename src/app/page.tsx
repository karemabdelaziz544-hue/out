import { connection } from "next/server";
import { redirect } from "next/navigation";
import { routes } from "@/config/app";
import { getAuthUser } from "@/lib/auth/session";

export const instant = false;

/**
 * Root page — redirects to dashboard if authenticated, otherwise to login.
 */
export default async function RootPage() {
  await connection();
  const user = await getAuthUser();
  if (user) {
    redirect(routes.dashboard);
  } else {
    redirect(routes.login);
  }
}

