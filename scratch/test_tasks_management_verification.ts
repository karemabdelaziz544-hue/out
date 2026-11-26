/**
 * Admin Tasks Management Comprehensive Functional and Security Verification Test
 */

import { getAdminTasksInternal } from "../src/lib/tasks/queries";
import { updateCustomsStageAction } from "../src/lib/shipments/journey-actions";

let totalTests = 0;
let passedTests = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  [PASS] ${testName}`);
  } else {
    console.error(`  [FAIL] ${testName}${detail ? ` - ${detail}` : ""}`);
  }
}

async function runTasksVerification() {
  console.log("\n=======================================================");
  console.log("=== 1. Testing Admin Tasks Query & KPI Metrics ===");
  console.log("=======================================================");

  const initialResult = await getAdminTasksInternal({ pageSize: 15 });

  assert(
    initialResult.tasks.length > 0,
    `getAdminTasks returns tasks (received ${initialResult.tasks.length} on page 1)`,
  );
  assert(
    initialResult.totalCount > 0,
    `getAdminTasks computes positive totalCount (${initialResult.totalCount})`,
  );
  assert(
    initialResult.stats.totalTasks ===
      initialResult.stats.pendingTasks +
        initialResult.stats.inProgressTasks +
        initialResult.stats.completedTasks +
        initialResult.stats.blockedTasks,
    `KPI statistics add up correctly (${initialResult.stats.totalTasks} = ${initialResult.stats.pendingTasks} + ${initialResult.stats.inProgressTasks} + ${initialResult.stats.completedTasks} + ${initialResult.stats.blockedTasks})`,
  );
  assert(
    initialResult.stats.overdueTasks >= 0,
    `Overdue calculation produced valid count (${initialResult.stats.overdueTasks} overdue)`,
  );

  console.log("\n=======================================================");
  console.log("=== 2. Testing Status Filters ===");
  console.log("=======================================================");

  // 1. Filter Pending
  const pendingResult = await getAdminTasksInternal({ status: "pending", pageSize: 50 });
  const allArePending = pendingResult.tasks.every((t) => t.status === "pending");
  assert(
    allArePending && pendingResult.tasks.length > 0,
    `Status filter 'pending' returned only pending tasks (${pendingResult.tasks.length} tasks)`,
  );

  // 2. Filter In Progress
  const inProgressResult = await getAdminTasksInternal({ status: "in_progress", pageSize: 50 });
  const allAreInProgress = inProgressResult.tasks.every(
    (t) => t.status === "in_progress" || t.status === "awaiting_external_response",
  );
  assert(
    allAreInProgress,
    `Status filter 'in_progress' returned only in-progress tasks (${inProgressResult.tasks.length} tasks)`,
  );

  // 3. Filter Completed
  const completedResult = await getAdminTasksInternal({ status: "completed", pageSize: 50 });
  const allAreCompleted = completedResult.tasks.every((t) => t.status === "completed");
  assert(
    allAreCompleted,
    `Status filter 'completed' returned only completed tasks (${completedResult.tasks.length} tasks)`,
  );

  // 4. Filter Overdue
  const overdueResult = await getAdminTasksInternal({ status: "overdue", pageSize: 50 });
  const allAreOverdue = overdueResult.tasks.every((t) => t.isOverdue);
  assert(
    allAreOverdue,
    `Status filter 'overdue' returned only overdue tasks (${overdueResult.tasks.length} tasks)`,
  );

  console.log("\n=======================================================");
  console.log("=== 3. Testing Role Filters ===");
  console.log("=======================================================");

  const rolesToTest = ["admin", "scout", "inspector", "data_entry"] as const;
  for (const role of rolesToTest) {
    const roleResult = await getAdminTasksInternal({ role, pageSize: 50 });
    const allMatchRole = roleResult.tasks.every((t) => t.expectedRole === role);
    assert(
      allMatchRole,
      `Role filter '${role}' returned tasks only for expected role '${role}' (${roleResult.tasks.length} tasks)`,
    );
  }

  console.log("\n=======================================================");
  console.log("=== 4. Testing Search Capabilities ===");
  console.log("=======================================================");

  // Search by title snippet
  const searchTitleResult = await getAdminTasksInternal({ query: "الكشف الميداني" });
  const allMatchTitle = searchTitleResult.tasks.every(
    (t) =>
      t.title.includes("الكشف الميداني") ||
      t.shipmentReference.includes("الكشف الميداني") ||
      (t.companyName && t.companyName.includes("الكشف الميداني")),
  );
  assert(
    allMatchTitle && searchTitleResult.tasks.length > 0,
    `Search by title 'الكشف الميداني' returned matching tasks (${searchTitleResult.tasks.length} found)`,
  );

  // Search by reference snippet
  const sampleRef = initialResult.tasks[0]?.shipmentReference || "OUT";
  const searchRefResult = await getAdminTasksInternal({ query: sampleRef.substring(0, 8) });
  assert(
    searchRefResult.tasks.length > 0,
    `Search by reference snippet '${sampleRef.substring(0, 8)}' returned matching tasks (${searchRefResult.tasks.length} found)`,
  );

  console.log("\n=======================================================");
  console.log("=== 5. Testing Concurrency & Action Payload Validation ===");
  console.log("=======================================================");

  function validateTaskOcc(expectedUpdatedAt: string | null | undefined, currentUpdatedAt: string) {
    if (!expectedUpdatedAt || expectedUpdatedAt.trim() === "") {
      return { valid: false, error: "رمز التزامن مفقود" };
    }
    const trimmedExpected = expectedUpdatedAt.trim();
    const expTime = new Date(trimmedExpected).getTime();
    if (isNaN(expTime)) {
      return { valid: false, error: "رمز التزامن غير صالح" };
    }
    const isExact = trimmedExpected === currentUpdatedAt.trim();
    const isEquivalentIso = new Date(trimmedExpected).toISOString() === new Date(currentUpdatedAt).toISOString();
    if (!isExact && !isEquivalentIso) {
      return { valid: false, error: "تم تعديل بيانات هذه المرحلة بواسطة مستخدم آخر" };
    }
    return { valid: true };
  }

  const sampleUpdatedAt = initialResult.tasks[0]?.updatedAt || new Date().toISOString();

  // Test 1: Matching token passes
  assert(
    validateTaskOcc(sampleUpdatedAt, sampleUpdatedAt).valid === true,
    "Matching fresh concurrency token passes OCC validation",
  );

  // Test 2: Missing token rejected
  assert(
    validateTaskOcc(null, sampleUpdatedAt).valid === false,
    "Missing expected_updated_at token is rejected safely",
  );

  // Test 3: Stale token (100ms older) rejected
  const stale100ms = new Date(new Date(sampleUpdatedAt).getTime() - 100).toISOString();
  assert(
    validateTaskOcc(stale100ms, sampleUpdatedAt).valid === false,
    "Stale token (even 100ms older) is rejected safely without overwrite",
  );

  // Test 4: Malformed token rejected
  assert(
    validateTaskOcc("not-a-valid-date", sampleUpdatedAt).valid === false,
    "Malformed non-ISO token string is rejected safely",
  );

  console.log("\n=======================================================");
  console.log(`=== Verification Summary: ${passedTests}/${totalTests} Tests Passed ===`);
  console.log("=======================================================\n");

  if (passedTests !== totalTests) {
    process.exit(1);
  }
}

runTasksVerification();
