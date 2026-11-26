import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/session";
import { getRoleLabel } from "@/lib/utils";
import { DynamicIcon } from "@/components/ui/icon";

export const metadata: Metadata = {
  title: "الملف الشخصي | OUT",
  description: "بيانات الحساب الشخصي ومعلومات التواصل المسجلة في منصة OUT.",
};

export default async function ProfilePage() {
  const currentUser = await getCurrentUser();

  const userInitials = currentUser?.fullName
    ? currentUser.fullName
        .split(" ")
        .slice(0, 2)
        .map((n) => n[0])
        .join("")
    : "U";

  return (
    <div style={{ maxWidth: "800px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {/* Profile Header Card */}
      <div
        className="card"
        style={{
          padding: "2rem",
          border: "1px solid var(--color-border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "1.5rem",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "1.25rem" }}>
          <div
            style={{
              width: "64px",
              height: "64px",
              borderRadius: "50%",
              backgroundColor: "var(--color-black)",
              color: "var(--color-yellow)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "var(--font-size-2xl)",
              fontWeight: "var(--font-weight-bold)",
              boxShadow: "var(--shadow-sm)",
            }}
          >
            {userInitials}
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
              <h1
                style={{
                  fontSize: "var(--font-size-2xl)",
                  fontWeight: "var(--font-weight-bold)",
                  margin: 0,
                  color: "var(--color-black)",
                }}
              >
                {currentUser?.fullName || "المستخدم"}
              </h1>
              <span
                style={{
                  fontSize: "var(--font-size-xs)",
                  padding: "0.25rem 0.625rem",
                  borderRadius: "var(--radius-full)",
                  backgroundColor: "var(--color-yellow-light)",
                  color: "var(--color-yellow-dark)",
                  fontWeight: "var(--font-weight-semibold)",
                }}
              >
                {currentUser?.role ? getRoleLabel(currentUser.role) : "—"}
              </span>
              <span
                style={{
                  fontSize: "var(--font-size-xs)",
                  padding: "0.25rem 0.625rem",
                  borderRadius: "var(--radius-full)",
                  backgroundColor: currentUser?.isActive ? "#ecfdf5" : "#fef2f2",
                  color: currentUser?.isActive ? "#065f46" : "#991b1b",
                  fontWeight: "var(--font-weight-medium)",
                }}
              >
                {currentUser?.isActive ? "حساب نشط ✓" : "غير نشط"}
              </span>
            </div>
            <p
              dir="ltr"
              style={{
                fontSize: "var(--font-size-sm)",
                color: "var(--color-gray-500)",
                margin: "0.35rem 0 0 0",
                textAlign: "right",
              }}
            >
              {currentUser?.email}
            </p>
          </div>
        </div>

        <div>
          <Link
            href="/settings"
            className="btn btn--outline"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.5rem",
              textDecoration: "none",
              fontSize: "var(--font-size-sm)",
            }}
          >
            <DynamicIcon name="Settings" size={16} />
            <span>إعدادات الحساب</span>
          </Link>
        </div>
      </div>

      {/* Details Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
          gap: "1.5rem",
        }}
      >
        {/* Contact Info Card */}
        <div
          className="card"
          style={{
            padding: "1.75rem",
            border: "1px solid var(--color-border)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              marginBottom: "1.25rem",
              borderBottom: "1px solid var(--color-border)",
              paddingBottom: "0.75rem",
            }}
          >
            <DynamicIcon name="User" size={20} />
            <h2
              style={{
                fontSize: "var(--font-size-lg)",
                fontWeight: "var(--font-weight-semibold)",
                margin: 0,
                color: "var(--color-black)",
              }}
            >
              معلومات الاتصال
            </h2>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div>
              <span style={{ fontSize: "var(--font-size-xs)", color: "var(--color-gray-500)", display: "block" }}>
                الاسم بالكامل
              </span>
              <strong style={{ fontSize: "var(--font-size-base)", color: "var(--color-black)" }}>
                {currentUser?.fullName ?? "—"}
              </strong>
            </div>

            <div>
              <span style={{ fontSize: "var(--font-size-xs)", color: "var(--color-gray-500)", display: "block" }}>
                البريد الإلكتروني المعتمد
              </span>
              <span dir="ltr" style={{ fontSize: "var(--font-size-sm)", color: "var(--color-black)", fontWeight: "var(--font-weight-medium)" }}>
                {currentUser?.email}
              </span>
            </div>

            <div>
              <span style={{ fontSize: "var(--font-size-xs)", color: "var(--color-gray-500)", display: "block" }}>
                رقم الهاتف المحمول
              </span>
              <span dir="ltr" style={{ fontSize: "var(--font-size-sm)", color: "var(--color-black)", fontWeight: "var(--font-weight-medium)" }}>
                {currentUser?.phone ?? "غير مسجل"}
              </span>
            </div>
          </div>
        </div>

        {/* Quick Actions Card */}
        <div
          className="card"
          style={{
            padding: "1.75rem",
            border: "1px solid var(--color-border)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              marginBottom: "1.25rem",
              borderBottom: "1px solid var(--color-border)",
              paddingBottom: "0.75rem",
            }}
          >
            <DynamicIcon name="Compass" size={20} />
            <h2
              style={{
                fontSize: "var(--font-size-lg)",
                fontWeight: "var(--font-weight-semibold)",
                margin: 0,
                color: "var(--color-black)",
              }}
            >
              روابط سريعة
            </h2>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {currentUser?.role === "customer" && (
              <>
                <Link
                  href="/company"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "0.75rem 1rem",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid var(--color-border)",
                    backgroundColor: "var(--color-gray-50)",
                    textDecoration: "none",
                    color: "var(--color-black)",
                    transition: "all 0.15s ease",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
                    <DynamicIcon name="Building2" size={18} />
                    <span style={{ fontSize: "var(--font-size-sm)", fontWeight: "var(--font-weight-medium)" }}>
                      بيانات ومستندات الشركة
                    </span>
                  </div>
                  <DynamicIcon name="ChevronLeft" size={16} />
                </Link>

                <Link
                  href="/my-shipments"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "0.75rem 1rem",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid var(--color-border)",
                    backgroundColor: "var(--color-gray-50)",
                    textDecoration: "none",
                    color: "var(--color-black)",
                    transition: "all 0.15s ease",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
                    <DynamicIcon name="Package" size={18} />
                    <span style={{ fontSize: "var(--font-size-sm)", fontWeight: "var(--font-weight-medium)" }}>
                      متابعة الشحنات
                    </span>
                  </div>
                  <DynamicIcon name="ChevronLeft" size={16} />
                </Link>

                <Link
                  href="/my-documents"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "0.75rem 1rem",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid var(--color-border)",
                    backgroundColor: "var(--color-gray-50)",
                    textDecoration: "none",
                    color: "var(--color-black)",
                    transition: "all 0.15s ease",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
                    <DynamicIcon name="Files" size={18} />
                    <span style={{ fontSize: "var(--font-size-sm)", fontWeight: "var(--font-weight-medium)" }}>
                      مستودع المستندات
                    </span>
                  </div>
                  <DynamicIcon name="ChevronLeft" size={16} />
                </Link>
              </>
            )}

            <Link
              href="/notifications"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "0.75rem 1rem",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--color-border)",
                backgroundColor: "var(--color-gray-50)",
                textDecoration: "none",
                color: "var(--color-black)",
                transition: "all 0.15s ease",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
                <DynamicIcon name="Bell" size={18} />
                <span style={{ fontSize: "var(--font-size-sm)", fontWeight: "var(--font-weight-medium)" }}>
                  مركز الإشعارات
                </span>
              </div>
              <DynamicIcon name="ChevronLeft" size={16} />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
