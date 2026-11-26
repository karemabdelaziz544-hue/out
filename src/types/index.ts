/**
 * Central types barrel export.
 * Import from "@/types" throughout the codebase.
 */

export * from "./auth";
export * from "./database";
export * from "./customer";
export * from "./document";
export * from "./company";
export * from "./shipment";
export * from "./readiness";
export * from "./notification";
export * from "./external-operation";
export * from "./journey";
export * from "./financial";
export * from "./task";

// Explicit re-exports for IDE language server resolution
export type {
  CurrentUser,
  UserRole,
  Profile,
  AuthUser,
  Permission,
  RolePermissions,
} from "./auth";

export { USER_ROLES, USER_ROLE_LABELS } from "./auth";

export type {
  ProfileRow,
  ProfileInsert,
  ProfileUpdate,
  CompanyRow,
  CompanyInsert,
  CompanyUpdate,
  CompanyDocumentRow,
  CompanyDocumentInsert,
  CompanyDocumentUpdate,
  ShipmentRow,
  ShipmentInsert,
  ShipmentUpdate,
  Database,
} from "./database";

export type {
  Company,
  CompanyDocument,
  CompanyDocumentType,
  CompanyDocumentStatus,
  AdminCompanyDocumentItem,
} from "./company";
export {
  COMPANY_DOCUMENT_TYPES,
  COMPANY_DOCUMENT_TYPE_LABELS,
  COMPANY_DOCUMENT_STATUS_LABELS,
} from "./company";

export type {
  Shipment,
  ShipmentStatus,
  AdminShipmentItem,
  ShipmentFilters,
  PricingStatus,
  PricingHistoryAction,
  ShipmentPricing,
  ShipmentPricingHistoryItem,
  InvoiceReviewAction,
  ShipmentInvoiceReview,
  AcidStatus,
  AcidHistoryAction,
  ShipmentAcid,
  ShipmentAcidHistoryItem,
} from "./shipment";
export {
  SHIPMENT_STATUS_LABELS,
  PRICING_STATUS_LABELS,
  PRICING_ACTION_LABELS,
  INVOICE_REVIEW_ACTION_LABELS,
  ACID_STATUS_LABELS,
  ACID_ACTION_LABELS,
} from "./shipment";

