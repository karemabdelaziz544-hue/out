"use client";

/**
 * Customers Table Component
 *
 * Renders the customers data table, empty states, and action triggers.
 */

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/ui/avatar";
import { DynamicIcon } from "@/components/ui/icon";
import { formatDateAr } from "@/lib/utils";
import { StatusToggleModal } from "./status-toggle-modal";
import type { Customer } from "@/types";

interface CustomersTableProps {
  customers: Customer[];
  totalCount: number;
  isFiltered: boolean;
  onClearFilters?: () => void;
}

export function CustomersTable({
  customers,
  totalCount,
  isFiltered,
}: CustomersTableProps) {
  const router = useRouter();
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  const handleClear = () => {
    router.replace("/customers");
  };

  // 1. State: Zero customers overall
  if (totalCount === 0 && !isFiltered) {
    return (
      <div className="customers-table-card">
        <div className="customers-state-box">
          <div className="customers-state-box__icon">
            <DynamicIcon name="Users" size={28} />
          </div>
          <h3 className="customers-state-box__title">لا يوجد عملاء حتى الآن</h3>
          <p className="customers-state-box__desc">
            سيظهر العملاء المسجلون في هذه اللوحة فور قيامهم بإنشاء حساباتهم على المنصة.
          </p>
        </div>
      </div>
    );
  }

  // 2. State: No results matching search/filter
  if (customers.length === 0 && isFiltered) {
    return (
      <div className="customers-table-card">
        <div className="customers-state-box">
          <div className="customers-state-box__icon">
            <DynamicIcon name="Search" size={28} />
          </div>
          <h3 className="customers-state-box__title">
            لم يتم العثور على عملاء مطابقين لبحثك
          </h3>
          <p className="customers-state-box__desc">
            تأكد من صحة الكلمات المدخلة أو جرّب إلغاء الفلاتر المحددة لعرض العملاء.
          </p>
          <button
            type="button"
            onClick={handleClear}
            className="customer-action-btn"
            style={{ marginTop: "0.5rem", padding: "0.5rem 1.25rem" }}
          >
            مسح البحث والفلاتر
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="customers-table-card">
        <div className="customers-table-wrapper">
          <table className="customers-table" aria-label="جدول العملاء">
            <thead>
              <tr>
                <th scope="col" style={{ width: "28%" }}>
                  العميل
                </th>
                <th scope="col" style={{ width: "22%" }}>
                  البريد الإلكتروني
                </th>
                <th scope="col" style={{ width: "16%" }}>
                  رقم الموبايل
                </th>
                <th scope="col" style={{ width: "12%" }}>
                  حالة الحساب
                </th>
                <th scope="col" style={{ width: "12%" }}>
                  تاريخ التسجيل
                </th>
                <th scope="col" style={{ width: "10%", textAlign: "center" }}>
                  الإجراءات
                </th>
              </tr>
            </thead>
            <tbody>
              {customers.map((customer) => {
                const displayName = customer.full_name || "بدون اسم";
                const phone = customer.phone || "—";
                const dateStr = formatDateAr(customer.created_at);

                return (
                  <tr key={customer.id}>
                    {/* 1. Name & Avatar */}
                    <td>
                      <div className="customer-cell-user">
                        <Avatar name={displayName} src={customer.avatar_url} size="sm" />
                        <div>
                          <Link
                            href={`/customers/${customer.id}`}
                            className="customer-cell-name"
                            style={{ textDecoration: "none" }}
                          >
                            {displayName}
                          </Link>
                        </div>
                      </div>
                    </td>

                    {/* 2. Email */}
                    <td>
                      <span className="customer-cell-email">{customer.email}</span>
                    </td>

                    {/* 3. Phone */}
                    <td>
                      <span className="customer-cell-phone">{phone}</span>
                    </td>

                    {/* 4. Status Badge */}
                    <td>
                      <span
                        className={`status-badge ${
                          customer.is_active
                            ? "status-badge--active"
                            : "status-badge--inactive"
                        }`}
                      >
                        <span className="status-badge__dot" aria-hidden="true" />
                        {customer.is_active ? "نشط" : "غير نشط"}
                      </span>
                    </td>

                    {/* 5. Registration Date */}
                    <td>
                      <span className="customer-cell-date">{dateStr}</span>
                    </td>

                    {/* 6. Actions */}
                    <td>
                      <div
                        className="customer-actions"
                        style={{ justifyContent: "center" }}
                      >
                        <Link
                          href={`/customers/${customer.id}`}
                          className="customer-action-btn"
                          title="عرض تفاصيل العميل"
                        >
                          <span>التفاصيل</span>
                          <DynamicIcon name="ChevronLeft" size={14} />
                        </Link>

                        <button
                          type="button"
                          onClick={() => setSelectedCustomer(customer)}
                          className={
                            customer.is_active
                              ? "customer-action-btn customer-action-btn--toggle-danger"
                              : "customer-action-btn customer-action-btn--toggle-activate"
                          }
                          title={customer.is_active ? "تعطيل الحساب" : "تفعيل الحساب"}
                          aria-label={
                            customer.is_active
                              ? `تعطيل حساب ${displayName}`
                              : `تفعيل حساب ${displayName}`
                          }
                        >
                          {customer.is_active ? "تعطيل" : "تفعيل"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Confirmation Modal */}
      <StatusToggleModal
        customer={selectedCustomer}
        isOpen={!!selectedCustomer}
        onClose={() => setSelectedCustomer(null)}
        onSuccess={(msg) => {
          showToast(msg);
          router.refresh();
        }}
      />

      {/* Toast Feedback */}
      {toastMessage && (
        <div className="feedback-toast feedback-toast--success" role="status">
          <DynamicIcon name="Check" size={18} />
          <span>{toastMessage}</span>
        </div>
      )}
    </>
  );
}
