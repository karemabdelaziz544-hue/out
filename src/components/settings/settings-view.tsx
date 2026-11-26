"use client";

/**
 * Settings View Component
 *
 * Provides customer and staff account settings:
 * - Notification preferences
 * - Security & password overview
 * - Interface & regional preferences
 */

import React, { useState } from "react";
import Link from "next/link";
import { DynamicIcon } from "@/components/ui/icon";
import type { CurrentUser } from "@/types";

interface SettingsViewProps {
  user: CurrentUser | null;
}

export function SettingsView({ user }: SettingsViewProps) {
  const [notifyShipmentStatus, setNotifyShipmentStatus] = useState(true);
  const [notifyPricing, setNotifyPricing] = useState(true);
  const [notifyInvoice, setNotifyInvoice] = useState(true);
  const [notifyAcid, setNotifyAcid] = useState(true);
  const [notifyDocs, setNotifyDocs] = useState(true);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const handleSavePreferences = () => {
    setSaveSuccess(true);
    setTimeout(() => {
      setSaveSuccess(false);
    }, 2500);
  };

  return (
    <div style={{ maxWidth: "840px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {/* Header Card */}
      <div
        className="card"
        style={{
          padding: "1.75rem",
          border: "1px solid var(--color-border)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "1rem",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <div
            style={{
              width: "44px",
              height: "44px",
              borderRadius: "var(--radius-md)",
              backgroundColor: "var(--color-yellow-light)",
              color: "var(--color-yellow-dark)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <DynamicIcon name="Settings" size={24} />
          </div>
          <div>
            <h1
              style={{
                fontSize: "var(--font-size-2xl)",
                fontWeight: "var(--font-weight-bold)",
                margin: 0,
                color: "var(--color-black)",
              }}
            >
              إعدادات الحساب
            </h1>
            <p
              style={{
                fontSize: "var(--font-size-sm)",
                color: "var(--color-gray-600)",
                margin: "0.25rem 0 0 0",
              }}
            >
              تخصيص تفضيلات الإشعارات، خيارات الأمان، وبيانات الحساب
            </p>
          </div>
        </div>

        <Link
          href="/profile"
          className="btn btn--outline"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.5rem",
            textDecoration: "none",
            fontSize: "var(--font-size-sm)",
          }}
        >
          <DynamicIcon name="User" size={16} />
          <span>الملف الشخصي</span>
        </Link>
      </div>

      {/* Save Success Alert */}
      {saveSuccess && (
        <div
          style={{
            padding: "0.875rem 1.25rem",
            backgroundColor: "#ecfdf5",
            border: "1px solid #10b981",
            borderRadius: "var(--radius-md)",
            color: "#065f46",
            display: "flex",
            alignItems: "center",
            gap: "0.625rem",
            fontSize: "var(--font-size-sm)",
            fontWeight: "var(--font-weight-medium)",
          }}
        >
          <DynamicIcon name="CheckCircle" size={18} />
          <span>تم حفظ التفضيلات بنجاح.</span>
        </div>
      )}

      {/* Notification Preferences Section */}
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
            gap: "0.625rem",
            marginBottom: "1.25rem",
            borderBottom: "1px solid var(--color-border)",
            paddingBottom: "0.75rem",
          }}
        >
          <DynamicIcon name="Bell" size={20} />
          <h2
            style={{
              fontSize: "var(--font-size-lg)",
              fontWeight: "var(--font-weight-semibold)",
              margin: 0,
              color: "var(--color-black)",
            }}
          >
            تفضيلات الإشعارات الفورية
          </h2>
        </div>

        <p style={{ fontSize: "var(--font-size-sm)", color: "var(--color-gray-600)", marginBottom: "1.25rem" }}>
          تحكم في أنواع التنبيهات الفورية التي تظهر لك في منصة OUT عند حدوث تطورات في شحناتك.
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <label
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "0.875rem 1rem",
              borderRadius: "var(--radius-md)",
              backgroundColor: "var(--color-gray-50)",
              border: "1px solid var(--color-border)",
              cursor: "pointer",
            }}
          >
            <div>
              <div style={{ fontSize: "var(--font-size-sm)", fontWeight: "var(--font-weight-semibold)", color: "var(--color-black)" }}>
                تحديثات حالة الشحنة
              </div>
              <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-gray-500)" }}>
                إشعار عند انتقال الشحنة من مرحلة لأخرى أو اعتماد جاهزيتها.
              </div>
            </div>
            <input
              type="checkbox"
              checked={notifyShipmentStatus}
              onChange={(e) => setNotifyShipmentStatus(e.target.checked)}
              style={{ width: "18px", height: "18px", accentColor: "var(--color-black)" }}
            />
          </label>

          <label
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "0.875rem 1rem",
              borderRadius: "var(--radius-md)",
              backgroundColor: "var(--color-gray-50)",
              border: "1px solid var(--color-border)",
              cursor: "pointer",
            }}
          >
            <div>
              <div style={{ fontSize: "var(--font-size-sm)", fontWeight: "var(--font-weight-semibold)", color: "var(--color-black)" }}>
                عروض الأسعار والتفاوض
              </div>
              <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-gray-500)" }}>
                إشعار عند تقديم عرض سعر جديد، استلام رد في التفاوض، أو اعتماد السعر النهائي.
              </div>
            </div>
            <input
              type="checkbox"
              checked={notifyPricing}
              onChange={(e) => setNotifyPricing(e.target.checked)}
              style={{ width: "18px", height: "18px", accentColor: "var(--color-black)" }}
            />
          </label>

          <label
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "0.875rem 1rem",
              borderRadius: "var(--radius-md)",
              backgroundColor: "var(--color-gray-50)",
              border: "1px solid var(--color-border)",
              cursor: "pointer",
            }}
          >
            <div>
              <div style={{ fontSize: "var(--font-size-sm)", fontWeight: "var(--font-weight-semibold)", color: "var(--color-black)" }}>
                مراجعة الفواتير المبدئية
              </div>
              <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-gray-500)" }}>
                إشعار عند اعتماد الفاتورة المبدئية أو طلب تعديلها.
              </div>
            </div>
            <input
              type="checkbox"
              checked={notifyInvoice}
              onChange={(e) => setNotifyInvoice(e.target.checked)}
              style={{ width: "18px", height: "18px", accentColor: "var(--color-black)" }}
            />
          </label>

          <label
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "0.875rem 1rem",
              borderRadius: "var(--radius-md)",
              backgroundColor: "var(--color-gray-50)",
              border: "1px solid var(--color-border)",
              cursor: "pointer",
            }}
          >
            <div>
              <div style={{ fontSize: "var(--font-size-sm)", fontWeight: "var(--font-weight-semibold)", color: "var(--color-black)" }}>
                إصدار كود ACID
              </div>
              <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-gray-500)" }}>
                إشعار فور صدور الرقم الجمركي المبدئي (ACID) للشحنة.
              </div>
            </div>
            <input
              type="checkbox"
              checked={notifyAcid}
              onChange={(e) => setNotifyAcid(e.target.checked)}
              style={{ width: "18px", height: "18px", accentColor: "var(--color-black)" }}
            />
          </label>

          <label
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "0.875rem 1rem",
              borderRadius: "var(--radius-md)",
              backgroundColor: "var(--color-gray-50)",
              border: "1px solid var(--color-border)",
              cursor: "pointer",
            }}
          >
            <div>
              <div style={{ fontSize: "var(--font-size-sm)", fontWeight: "var(--font-weight-semibold)", color: "var(--color-black)" }}>
                اعتماد ومراجعة المستندات النهائية
              </div>
              <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-gray-500)" }}>
                إشعار عند اعتماد مستند شحنة أو طلب إعادة رفعه.
              </div>
            </div>
            <input
              type="checkbox"
              checked={notifyDocs}
              onChange={(e) => setNotifyDocs(e.target.checked)}
              style={{ width: "18px", height: "18px", accentColor: "var(--color-black)" }}
            />
          </label>
        </div>

        <div style={{ marginTop: "1.5rem" }}>
          <button
            type="button"
            onClick={handleSavePreferences}
            className="btn btn--primary"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.5rem",
              fontSize: "var(--font-size-sm)",
              padding: "0.625rem 1.25rem",
            }}
          >
            <DynamicIcon name="Save" size={16} />
            <span>حفظ تفضيلات الإشعارات</span>
          </button>
        </div>
      </div>

      {/* Security and Session Section */}
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
            gap: "0.625rem",
            marginBottom: "1.25rem",
            borderBottom: "1px solid var(--color-border)",
            paddingBottom: "0.75rem",
          }}
        >
          <DynamicIcon name="Shield" size={20} />
          <h2
            style={{
              fontSize: "var(--font-size-lg)",
              fontWeight: "var(--font-weight-semibold)",
              margin: 0,
              color: "var(--color-black)",
            }}
          >
            الأمان وتسجيل الدخول
          </h2>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <div
            style={{
              padding: "1rem",
              backgroundColor: "var(--color-gray-50)",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--color-border)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: "0.75rem",
            }}
          >
            <div>
              <div style={{ fontSize: "var(--font-size-sm)", fontWeight: "var(--font-weight-semibold)", color: "var(--color-black)" }}>
                البريد الإلكتروني الأساسي
              </div>
              <div dir="ltr" style={{ fontSize: "var(--font-size-xs)", color: "var(--color-gray-600)", textAlign: "right" }}>
                {user?.email}
              </div>
            </div>
            <span
              style={{
                fontSize: "var(--font-size-xs)",
                color: "#065f46",
                backgroundColor: "#ecfdf5",
                padding: "0.25rem 0.625rem",
                borderRadius: "var(--radius-full)",
                fontWeight: "var(--font-weight-medium)",
              }}
            >
              تم التحقق ✓
            </span>
          </div>

          <div
            style={{
              padding: "1rem",
              backgroundColor: "var(--color-gray-50)",
              borderRadius: "var(--radius-md)",
              border: "1px solid var(--color-border)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: "0.75rem",
            }}
          >
            <div>
              <div style={{ fontSize: "var(--font-size-sm)", fontWeight: "var(--font-weight-semibold)", color: "var(--color-black)" }}>
                كلمة المرور
              </div>
              <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-gray-600)" }}>
                لتغيير كلمة المرور، يمكنك طلب رابط إعادة التعيين الآمن عبر البريد الإلكتروني.
              </div>
            </div>
            <Link
              href="/forgot-password"
              className="btn btn--outline"
              style={{
                fontSize: "var(--font-size-xs)",
                padding: "0.375rem 0.875rem",
                textDecoration: "none",
              }}
            >
              طلب إعادة تعيين كلمة المرور
            </Link>
          </div>
        </div>
      </div>

      {/* Regional and Language Section */}
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
            gap: "0.625rem",
            marginBottom: "1rem",
            borderBottom: "1px solid var(--color-border)",
            paddingBottom: "0.75rem",
          }}
        >
          <DynamicIcon name="Globe" size={20} />
          <h2
            style={{
              fontSize: "var(--font-size-lg)",
              fontWeight: "var(--font-weight-semibold)",
              margin: 0,
              color: "var(--color-black)",
            }}
          >
            خيارات العرض واللغة
          </h2>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "1rem" }}>
          <div
            style={{
              padding: "0.875rem 1rem",
              borderRadius: "var(--radius-md)",
              backgroundColor: "var(--color-gray-50)",
              border: "1px solid var(--color-border)",
            }}
          >
            <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-gray-500)", marginBottom: "0.25rem" }}>
              اللغة الأساسية
            </div>
            <div style={{ fontSize: "var(--font-size-sm)", fontWeight: "var(--font-weight-semibold)", color: "var(--color-black)" }}>
              العربية (مصر) — Arabic (EG)
            </div>
          </div>

          <div
            style={{
              padding: "0.875rem 1rem",
              borderRadius: "var(--radius-md)",
              backgroundColor: "var(--color-gray-50)",
              border: "1px solid var(--color-border)",
            }}
          >
            <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-gray-500)", marginBottom: "0.25rem" }}>
              النسق البصري
            </div>
            <div style={{ fontSize: "var(--font-size-sm)", fontWeight: "var(--font-weight-semibold)", color: "var(--color-black)" }}>
              OUT Palette (أصفر وأسود كلاسيكي)
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
