/**
 * Authentication Flows Comprehensive Functional and Security Verification Test
 */

import { getSafeRedirectUrl } from "../src/lib/auth/redirect";
import {
  loginSchema,
  registerSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from "../src/lib/validation/auth";
import { routes } from "../src/config/app";

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

console.log("\n=======================================================");
console.log("=== 1. Testing Open Redirect Protection (getSafeRedirectUrl) ===");
console.log("=======================================================");

// 1. External URLs
assert(
  getSafeRedirectUrl("https://evil.com") === routes.dashboard,
  "Rejects external HTTPS URLs",
);
assert(
  getSafeRedirectUrl("http://attacker.org/phish") === routes.dashboard,
  "Rejects external HTTP URLs",
);

// 2. Protocol relative
assert(
  getSafeRedirectUrl("//evil.com") === routes.dashboard,
  "Rejects protocol-relative //evil.com",
);
assert(
  getSafeRedirectUrl("///evil.com") === routes.dashboard,
  "Rejects protocol-relative ///evil.com",
);

// 3. Backslash injections
assert(
  getSafeRedirectUrl("/\\evil.com") === routes.dashboard,
  "Rejects backslash /\\evil.com",
);
assert(
  getSafeRedirectUrl("/shipments\\evil.com") === routes.dashboard,
  "Rejects backslash inside path /shipments\\evil.com",
);

// 4. Scheme injections
assert(
  getSafeRedirectUrl("javascript:alert(1)") === routes.dashboard,
  "Rejects javascript: scheme",
);
assert(
  getSafeRedirectUrl("data:text/html,<script>alert(1)</script>") === routes.dashboard,
  "Rejects data: scheme",
);

// 5. Auth loop prevention
assert(
  getSafeRedirectUrl("/login") === routes.dashboard,
  "Rejects redirect loop to /login",
);
assert(
  getSafeRedirectUrl("/login?error=test") === routes.dashboard,
  "Rejects redirect loop to /login with query params",
);
assert(
  getSafeRedirectUrl("/register") === routes.dashboard,
  "Rejects redirect loop to /register",
);
assert(
  getSafeRedirectUrl("/forgot-password") === routes.dashboard,
  "Rejects redirect loop to /forgot-password",
);

// 6. Legitimate destinations
assert(
  getSafeRedirectUrl("/shipments/433ead3b-3b9e-4295-bb80-128d") ===
    "/shipments/433ead3b-3b9e-4295-bb80-128d",
  "Allows valid relative shipment URL",
);
assert(
  getSafeRedirectUrl("/customers?page=2&status=active") ===
    "/customers?page=2&status=active",
  "Allows valid relative customer URL with query params",
);
assert(
  getSafeRedirectUrl(null) === routes.dashboard,
  "Defaults safely to dashboard on null",
);
assert(
  getSafeRedirectUrl(undefined) === routes.dashboard,
  "Defaults safely to dashboard on undefined",
);
assert(
  getSafeRedirectUrl("", "/custom-fallback") === "/custom-fallback",
  "Supports custom fallback destination",
);

console.log("\n=======================================================");
console.log("=== 2. Testing Auth Validation Schemas ===");
console.log("=======================================================");

// loginSchema
const validLogin = loginSchema.safeParse({
  email: "admin@out.com",
  password: "password123",
  rememberMe: true,
});
assert(validLogin.success, "loginSchema accepts valid email and password");

const invalidLoginEmail = loginSchema.safeParse({
  email: "not-an-email",
  password: "password123",
});
assert(!invalidLoginEmail.success, "loginSchema rejects malformed email");

const emptyLoginPassword = loginSchema.safeParse({
  email: "admin@out.com",
  password: "",
});
assert(!emptyLoginPassword.success, "loginSchema rejects empty password");

// registerSchema
const validRegister = registerSchema.safeParse({
  fullName: "أحمد محمد علي",
  phone: "01012345678",
  email: "ahmed@example.com",
  password: "SecurePassword123!",
  confirmPassword: "SecurePassword123!",
  terms: true,
});
assert(validRegister.success, "registerSchema accepts valid registration payload");

const invalidRegisterPhone = registerSchema.safeParse({
  fullName: "أحمد محمد علي",
  phone: "0212345678", // not 01
  email: "ahmed@example.com",
  password: "SecurePassword123!",
  confirmPassword: "SecurePassword123!",
  terms: true,
});
assert(!invalidRegisterPhone.success, "registerSchema rejects non-Egyptian mobile phone");

const mismatchedRegisterPassword = registerSchema.safeParse({
  fullName: "أحمد محمد علي",
  phone: "01012345678",
  email: "ahmed@example.com",
  password: "SecurePassword123!",
  confirmPassword: "DifferentPassword123!",
  terms: true,
});
assert(!mismatchedRegisterPassword.success, "registerSchema rejects mismatched passwords");

const unacceptedTerms = registerSchema.safeParse({
  fullName: "أحمد محمد علي",
  phone: "01012345678",
  email: "ahmed@example.com",
  password: "SecurePassword123!",
  confirmPassword: "SecurePassword123!",
  terms: false,
});
assert(!unacceptedTerms.success, "registerSchema rejects unaccepted terms");

// forgotPasswordSchema
const validForgot = forgotPasswordSchema.safeParse({ email: "user@example.com" });
assert(validForgot.success, "forgotPasswordSchema accepts valid email");

const invalidForgot = forgotPasswordSchema.safeParse({ email: "invalid-email" });
assert(!invalidForgot.success, "forgotPasswordSchema rejects invalid email");

// resetPasswordSchema
const validReset = resetPasswordSchema.safeParse({
  password: "NewPassword123!",
  confirmPassword: "NewPassword123!",
});
assert(validReset.success, "resetPasswordSchema accepts matching valid passwords");

const shortReset = resetPasswordSchema.safeParse({
  password: "123",
  confirmPassword: "123",
});
assert(!shortReset.success, "resetPasswordSchema rejects passwords shorter than 8 chars");

const mismatchedReset = resetPasswordSchema.safeParse({
  password: "NewPassword123!",
  confirmPassword: "OtherPassword123!",
});
assert(!mismatchedReset.success, "resetPasswordSchema rejects mismatched reset passwords");

console.log("\n=======================================================");
console.log(`=== Verification Summary: ${passedTests}/${totalTests} Tests Passed ===`);
console.log("=======================================================\n");

if (passedTests !== totalTests) {
  process.exit(1);
}
