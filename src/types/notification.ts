/**
 * In-App Notification Types
 */

export type NotificationType =
  | "info"
  | "success"
  | "warning"
  | "pricing"
  | "invoice"
  | "acid"
  | "document"
  | "readiness";

export interface AppNotification {
  id: string;
  user_id: string;
  shipment_id?: string | null;
  title: string;
  message: string;
  type: NotificationType;
  link?: string | null;
  is_read: boolean;
  read_at?: string | null;
  created_at: string;
}
