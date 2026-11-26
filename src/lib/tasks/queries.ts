/**
 * Admin Tasks Queries — Server Side
 *
 * Secure database queries for tracking operational customs clearance tasks
 * across active shipments in the OUT platform.
 *
 * Phase 1 Enforcements:
 * - Excludes 'skipped' and 'not_applicable' stages from open operational tasks.
 * - Enforces least-privilege role + assignment scoping for operational staff
 *   ('scout', 'inspector', 'data_entry') so they only see tasks for their role
 *   that are assigned to them (or unassigned pool for their role), and never see
 *   financial stage_2_pricing or stage_9_fees_payments tasks.
 */

import { requireRole } from "@/lib/auth/guards";
import { getCurrentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type {
  AdminTaskItem,
  AdminTasksResult,
  TaskFilters,
  TaskPriority,
  TaskStats,
} from "@/types/task";
import {
  CUSTOMS_STAGE_DEFINITIONS,
  OPERATIONAL_ROLES_INFO,
  CUSTOMS_STAGE_STATUS_CONFIG,
  CustomsStageKey,
  CustomsStageStatus,
  OperationalRole,
} from "@/types/journey";

/**
 * Fetch operational tasks with metrics, search, and status/role filters.
 * Requires authorized operational role.
 */
export async function getAdminTasks(filters: TaskFilters = {}): Promise<AdminTasksResult> {
  await requireRole(["admin", "manager", "data_entry", "scout", "inspector"]);
  return getAdminTasksInternal(filters);
}

export async function getAdminTasksInternal({
  query,
  status = "all",
  role = "all",
  page = 1,
  pageSize = 15,
}: TaskFilters = {}): Promise<AdminTasksResult> {
  const currentUser = await getCurrentUser();
  const supabase = await createClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: stages, error } = await (supabase.from("shipment_customs_stages") as any)
    .select(`
      id,
      shipment_id,
      stage_key,
      stage_order,
      status,
      expected_role,
      assigned_to,
      is_applicable,
      notes,
      rejection_or_delay_reason,
      reference_number,
      stage_data,
      completed_at,
      completed_by,
      created_at,
      updated_at,
      completer:completed_by ( full_name ),
      shipments:shipment_id (
        id,
        reference_number,
        goods_description,
        status,
        company_id,
        customer_id,
        created_at,
        companies:company_id ( name ),
        profiles:customer_id ( full_name )
      )
    `)
    .eq("is_applicable", true)
    .neq("status", "not_applicable")
    .neq("status", "skipped")
    .order("stage_order", { ascending: true })
    .order("updated_at", { ascending: false });

  if (error || !stages) {
    if (process.env.NODE_ENV === "development" && error) {
      console.error("[getAdminTasks] Database query error:", error.message);
    }
    return {
      tasks: [],
      stats: {
        totalTasks: 0,
        pendingTasks: 0,
        inProgressTasks: 0,
        overdueTasks: 0,
        completedTasks: 0,
        blockedTasks: 0,
      },
      totalCount: 0,
      page: 1,
      pageSize,
      totalPages: 1,
    };
  }

  // Server-side least-privilege scoping for operational roles (scout, inspector, data_entry)
  const isSuperAdmin = currentUser?.role === "admin" || currentUser?.role === "manager";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const roleScopedStages = (stages as any[]).filter((st) => {
    if (isSuperAdmin || !currentUser) return true;
    // Operational staff never see pricing or financial settlement stages
    if (st.stage_key === "stage_2_pricing" || st.stage_key === "stage_9_fees_payments") {
      return false;
    }
    // Must match their operational role and either be assigned to them or unassigned
    if (st.expected_role !== currentUser.role) {
      return false;
    }
    if (st.assigned_to && st.assigned_to !== currentUser.id) {
      return false;
    }
    return true;
  });

  const now = Date.now();

  let totalTasks = 0;
  let pendingTasks = 0;
  let inProgressTasks = 0;
  let overdueTasks = 0;
  let completedTasks = 0;
  let blockedTasks = 0;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allMappedTasks: AdminTaskItem[] = roleScopedStages.map((st: any) => {
    totalTasks++;

    const stageKey = st.stage_key as CustomsStageKey;
    const stageStatus = st.status as CustomsStageStatus;
    const expectedRole = (st.expected_role || "admin") as OperationalRole;

    const meta = CUSTOMS_STAGE_DEFINITIONS[stageKey];
    const roleInfo = OPERATIONAL_ROLES_INFO[expectedRole];
    const statusCfg = CUSTOMS_STAGE_STATUS_CONFIG[stageStatus];

    if (stageStatus === "pending") {
      pendingTasks++;
    } else if (stageStatus === "in_progress" || stageStatus === "awaiting_external_response") {
      inProgressTasks++;
    } else if (stageStatus === "completed") {
      completedTasks++;
    } else if (stageStatus === "blocked" || stageStatus === "needs_correction") {
      blockedTasks++;
    }

    const targetHours = meta?.targetDurationHours || 24;
    const stageData = (st.stage_data as Record<string, unknown>) || {};
    let targetCompletionAt: string | null = null;

    if (typeof stageData.target_completion_at === "string") {
      targetCompletionAt = stageData.target_completion_at;
    } else if (stageStatus === "in_progress") {
      const calcTarget = new Date(new Date(st.updated_at).getTime() + targetHours * 3600 * 1000);
      targetCompletionAt = calcTarget.toISOString();
    }

    const isOverdue =
      stageStatus !== "completed" &&
      stageStatus !== "not_applicable" &&
      stageStatus !== "skipped" &&
      targetCompletionAt !== null &&
      now > new Date(targetCompletionAt).getTime();

    if (isOverdue) {
      overdueTasks++;
    }

    // Determine task priority
    let priority: TaskPriority = "low";
    let priorityLabel = "منخفضة";

    if (stageStatus === "blocked" || stageStatus === "needs_correction" || isOverdue) {
      priority = "urgent";
      priorityLabel = "عاجلة";
    } else if (
      (stageStatus === "in_progress" && st.stage_order <= 4) ||
      stageStatus === "awaiting_external_response"
    ) {
      priority = "high";
      priorityLabel = "عالية";
    } else if (stageStatus === "in_progress") {
      priority = "medium";
      priorityLabel = "متوسطة";
    }

    const shipmentRef = st.shipments?.reference_number || "غير محدد";
    const companyName = st.shipments?.companies?.name || null;
    const customerName = st.shipments?.profiles?.full_name || null;

    return {
      id: st.id,
      stageKey,
      stageOrder: st.stage_order,
      title: meta?.title || stageKey,
      shortDescription: meta?.shortDescription || "",
      purpose: meta?.purpose || "",
      shipmentId: st.shipment_id,
      shipmentReference: shipmentRef,
      goodsDescription: st.shipments?.goods_description || null,
      companyName,
      customerName,
      status: stageStatus,
      statusLabel: statusCfg?.label || stageStatus,
      expectedRole,
      roleLabel: roleInfo?.label || expectedRole,
      priority,
      priorityLabel,
      isOverdue,
      targetDurationHours: targetHours,
      targetCompletionAt,
      notes: st.notes || null,
      rejectionOrDelayReason: st.rejection_or_delay_reason || null,
      referenceNumber: st.reference_number || null,
      stageData,
      createdAt: st.created_at,
      updatedAt: st.updated_at,
      completedAt: st.completed_at || null,
      completedBy: st.completed_by || null,
      completedByName: st.completer?.full_name || null,
    };
  });

  const stats: TaskStats = {
    totalTasks,
    pendingTasks,
    inProgressTasks,
    overdueTasks,
    completedTasks,
    blockedTasks,
  };

  const normalizedQuery = query?.trim().toLowerCase();

  const filteredTasks = allMappedTasks.filter((t) => {
    if (normalizedQuery) {
      const matchTitle = t.title.toLowerCase().includes(normalizedQuery);
      const matchRef = t.shipmentReference.toLowerCase().includes(normalizedQuery);
      const matchCompany = t.companyName?.toLowerCase().includes(normalizedQuery) ?? false;
      const matchCustomer = t.customerName?.toLowerCase().includes(normalizedQuery) ?? false;
      const matchGoods = t.goodsDescription?.toLowerCase().includes(normalizedQuery) ?? false;
      if (!matchTitle && !matchRef && !matchCompany && !matchCustomer && !matchGoods) {
        return false;
      }
    }

    if (status && status !== "all") {
      if (status === "overdue") {
        if (!t.isOverdue) return false;
      } else if (status === "in_progress") {
        if (t.status !== "in_progress" && t.status !== "awaiting_external_response") return false;
      } else if (status === "blocked") {
        if (t.status !== "blocked" && t.status !== "needs_correction") return false;
      } else if (t.status !== status) {
        return false;
      }
    }

    if (role && role !== "all") {
      if (t.expectedRole !== role) return false;
    }

    return true;
  });

  const totalCount = filteredTasks.length;
  const safePageSize = Math.min(50, Math.max(1, Number(pageSize) || 15));
  const totalPages = Math.max(1, Math.ceil(totalCount / safePageSize));
  const safePage = Math.min(totalPages, Math.max(1, Number(page) || 1));

  const startIndex = (safePage - 1) * safePageSize;
  const paginatedTasks = filteredTasks.slice(startIndex, startIndex + safePageSize);

  return {
    tasks: paginatedTasks,
    stats,
    totalCount,
    page: safePage,
    pageSize: safePageSize,
    totalPages,
  };
}
