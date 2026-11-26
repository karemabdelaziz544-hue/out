/**
 * Auth Pages Live SSR Verification Script
 */

async function testAuthPages() {
  const baseUrl = "http://localhost:3000";
  const routesToTest = [
    {
      path: "/login",
      expectedStatus: 200,
      mustContain: ["تسجيل الدخول", "OUT", "login-form__submit"],
    },
    {
      path: "/register",
      expectedStatus: 200,
      mustContain: ["إنشاء حساب جديد", "الاسم بالكامل", "register-submit-btn"],
    },
    {
      path: "/forgot-password",
      expectedStatus: 200,
      mustContain: [
        "استعادة كلمة المرور",
        "البريد الإلكتروني",
        "forgot-password-submit-btn",
      ],
    },
    {
      path: "/reset-password",
      expectedStatus: 200,
      // Since no active recovery session exists in this unauthenticated fetch, it should safely show the invalid/expired card!
      mustContain: [
        "رابط الاستعادة غير صالح أو منتهي",
        "طلب رابط استعادة جديد",
        "OUT",
      ],
    },
    {
      path: "/unauthorized",
      expectedStatus: 200,
      mustContain: ["403", "غير مصرح لك بالوصول", "العودة إلى لوحة التحكم"],
    },
    {
      path: "/auth/callback",
      expectedStatus: 307, // redirect to /login with error param
      checkRedirect: true,
    },
    {
      path: "/auth/callback?error_code=otp_expired",
      expectedStatus: 307,
      checkRedirect: true,
    },
  ];

  console.log("\n=======================================================");
  console.log("=== Testing Live Auth Pages SSR on http://localhost:3000 ===");
  console.log("=======================================================\n");

  let allPassed = true;

  for (const item of routesToTest) {
    try {
      const res = await fetch(`${baseUrl}${item.path}`, {
        redirect: "manual",
      });

      const statusMatch = res.status === item.expectedStatus;
      if (!statusMatch) {
        console.error(
          `[FAIL] ${item.path}: Expected HTTP ${item.expectedStatus}, got ${res.status}`,
        );
        allPassed = false;
        continue;
      }

      if (item.checkRedirect) {
        const location = res.headers.get("location") || "";
        console.log(`[PASS] ${item.path} returned HTTP ${res.status} -> ${location}`);
        continue;
      }

      const html = await res.text();
      let missingSnippet = null;
      for (const snippet of item.mustContain || []) {
        if (!html.includes(snippet)) {
          missingSnippet = snippet;
          break;
        }
      }

      if (missingSnippet) {
        console.error(
          `[FAIL] ${item.path}: Missing expected HTML snippet "${missingSnippet}"`,
        );
        allPassed = false;
      } else {
        console.log(
          `[PASS] ${item.path}: HTTP 200 OK and contains all expected snippets.`,
        );
      }
    } catch (err: unknown) {
      console.error(`[FAIL] ${item.path}: Network error`, err);
      allPassed = false;
    }
  }

  console.log("\n=======================================================");
  if (allPassed) {
    console.log("=== ALL LIVE SSR AUTH PAGE CHECKS PASSED ===");
  } else {
    console.error("=== SOME SSR PAGE CHECKS FAILED ===");
    process.exit(1);
  }
  console.log("=======================================================\n");
}

testAuthPages();
