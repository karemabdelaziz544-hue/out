/**
 * Live SSR and Route Guard Verification for /tasks
 */

async function verifyTasksRoute() {
  const baseUrl = "http://localhost:3000";

  console.log("\n=======================================================");
  console.log("=== Testing /tasks Route Protection & Redirects ===");
  console.log("=======================================================\n");

  // 1. Unauthenticated request must redirect to login with redirect param
  const unauthRes = await fetch(`${baseUrl}/tasks`, { redirect: "manual" });
  const location = unauthRes.headers.get("location") || "";

  console.log(`Unauthenticated GET /tasks -> HTTP ${unauthRes.status}`);
  console.log(`Redirect Location: ${location}`);

  if (unauthRes.status === 307 && location.includes("/login") && location.includes("redirect=%2Ftasks")) {
    console.log("  [PASS] Unauthenticated request correctly protected and redirected to /login?redirect=%2Ftasks");
  } else {
    console.error("  [FAIL] Expected redirect to /login with redirect=%2Ftasks");
    process.exit(1);
  }

  console.log("\n=======================================================");
  console.log("=== ALL /tasks ROUTE TESTS PASSED ===");
  console.log("=======================================================\n");
}

verifyTasksRoute();
