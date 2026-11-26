"use client";

import { FileText, ShieldAlert, CheckCircle, ArrowRight, Lock } from "lucide-react";
import Link from "next/link";
import type { OutClearanceSummary } from "@/lib/tracking/types";

interface OutClearanceCardProps {
  summary?: OutClearanceSummary;
}

export function OutClearanceCard({ summary }: OutClearanceCardProps) {
  return (
    <div className="out-clearance-card" dir="rtl">
      <div className="out-clearance-header">
        <div className="out-clearance-title-group">
          <div className="out-clearance-icon-badge">
            <FileText size={18} />
          </div>
          <div>
            <h3 className="out-clearance-title">إجراءات التخليص الجمركي لدى OUT</h3>
            <p className="out-clearance-subtitle">
              منظومة المتابعة الجمركية المصرية (نافذة — الموانئ المصرية)
            </p>
          </div>
        </div>
      </div>

      <div className="out-clearance-body">
        {/* Important Distinction Banner */}
        <div className="out-clearance-notice">
          <ShieldAlert size={16} className="notice-icon" />
          <p>
            <strong>تنويه لوجستي مهم:</strong> حركة السفينة في المياه الدولية وتتبع الخط الملاحي
            تختلف كلياً عن مراحل التخليص الجمركي المصرية (نافذة، الإفراج، الفحص والمعاينة).
          </p>
        </div>

        {/* Public-safe summary if an internal OUT shipment or ACID was matched */}
        {summary ? (
          <div className="out-clearance-details-box">
            <div className="out-clearance-grid">
              <div className="clearance-meta-item">
                <span className="clearance-label">رقم مرجع OUT:</span>
                <span className="clearance-value" dir="ltr">{summary.referenceNumber}</span>
              </div>

              <div className="clearance-meta-item">
                <span className="clearance-label">الحالة الجمركية العامة:</span>
                <span className="clearance-status-pill">
                  {summary.isFullyCleared ? (
                    <CheckCircle size={14} className="inline-block ml-1 text-green-500" />
                  ) : null}
                  {summary.publicStatusLabel}
                </span>
              </div>

              {summary.portOfArrival && (
                <div className="clearance-meta-item">
                  <span className="clearance-label">ميناء الوصول المصري:</span>
                  <span className="clearance-value">{summary.portOfArrival}</span>
                </div>
              )}

              {summary.countryOfOrigin && (
                <div className="clearance-meta-item">
                  <span className="clearance-label">بلد المنشأ:</span>
                  <span className="clearance-value">{summary.countryOfOrigin}</span>
                </div>
              )}

              {summary.goodsDescription && (
                <div className="clearance-meta-item full-width">
                  <span className="clearance-label">بيان البضاعة العام:</span>
                  <span className="clearance-value">{summary.goodsDescription}</span>
                </div>
              )}
            </div>

            <div className="out-clearance-privacy-note">
              <Lock size={12} className="inline-block ml-1" />
              <span>
                للحفاظ على سرية وخصوصية البيانات التجارية، التفاصيل الكاملة للمستندات والفواتير متاحة حصرياً لصاحب الشحنة المسجل.
              </span>
            </div>
          </div>
        ) : (
          /* General guidance when looking up an external container/BL without internal linkage */
          <div className="out-clearance-guidance">
            <p className="guidance-text">
              هل هذه الشحنة تابعة لعمليات OUT الجمركية وترغب في متابعة مراحل التخليص العشر بالتفصيل؟
            </p>
            <div className="guidance-actions">
              <Link href="/login" className="out-portal-link">
                <span>تسجيل الدخول إلى بوابة العملاء</span>
                <ArrowRight size={14} />
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
