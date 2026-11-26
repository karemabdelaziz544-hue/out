/**
 * Brand & Application Configuration
 *
 * Single source of truth for brand identity and app-level constants.
 * CSS variables in globals.css reference these tokens.
 */

// ─── Brand ────────────────────────────────────────────────────────────────────

export const brand = {
  name: "OUT",
  tagline: "منصة التخليص الجمركي والخدمات اللوجستية",
  colors: {
    /** Primary structural color */
    black: "#0A0A0A",
    /** Primary brand accent — replace with exact hex when brand guide is available */
    yellow: "#F5C500",
    /** Primary background */
    white: "#FAFAFA",
  },
} as const;

// ─── App ──────────────────────────────────────────────────────────────────────

export const appConfig = {
  /** Default locale */
  locale: "ar",
  /** Default text direction */
  dir: "rtl",
  /** Supabase project URL — read from env at runtime */
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  /** Supabase anon key — read from env at runtime */
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
} as const;

// ─── Navigation ───────────────────────────────────────────────────────────────

export const routes = {
  home: "/",
  track: "/track",
  login: "/login",
  register: "/register",
  forgotPassword: "/forgot-password",
  resetPassword: "/reset-password",
  dashboard: "/dashboard",
  customers: "/customers",
  shipments: "/shipments",
  createShipment: "/shipments/new",
  documents: "/documents",
  tasks: "/tasks",
  team: "/team",
  notifications: "/notifications",
  reports: "/reports",
  settings: "/settings",
  myShipments: "/my-shipments",
  myDocuments: "/my-documents",
  company: "/company",
  companyDocuments: "/company-documents",
  profile: "/profile",
  unauthorized: "/unauthorized",
} as const;

export type AppRoute = (typeof routes)[keyof typeof routes];
