/**
 * Admin Tasks Management Types
 *
 * Models operational tasks, filters, metrics, and role assignments
 * for shipment customs clearance operations.
 */

import type { CustomsStageKey, CustomsStageStatus, OperationalRole } from "./journey";

export type TaskStatus = CustomsStageStatus;
export type TaskPriority = "urgent" | "high" | "medium" | "low";

export interface AdminTaskItem {
  id: string;
  stageKey: CustomsStageKey;
  stageOrder: number;
  title: string;
  shortDescription: string;
  purpose: string;
  shipmentId: string;
  shipmentReference: string;
  goodsDescription?: string | null;
  companyName?: string | null;
  customerName?: string | null;
  status: CustomsStageStatus;
  statusLabel: string;
  expectedRole: OperationalRole;
  roleLabel: string;
  priority: TaskPriority;
  priorityLabel: string;
  isOverdue: boolean;
  targetDurationHours: number;
  targetCompletionAt?: string | null;
  notes?: string | null;
  rejectionOrDelayReason?: string | null;
  referenceNumber?: string | null;
  stageData: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  completedAt?: string | null;
  completedBy?: string | null;
  completedByName?: string | null;
}

export interface TaskStats {
  totalTasks: number;
  pendingTasks: number;
  inProgressTasks: number;
  overdueTasks: number;
  completedTasks: number;
  blockedTasks: number;
}

export interface TaskFilters {
  query?: string;
  status?: string;
  role?: string;
  page?: number;
  pageSize?: number;
}

export interface AdminTasksResult {
  tasks: AdminTaskItem[];
  stats: TaskStats;
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}
