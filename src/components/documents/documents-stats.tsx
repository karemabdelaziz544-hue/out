/**
 * Documents Stats Component
 *
 * Summary cards showing document counts.
 */

import { DynamicIcon } from "@/components/ui/icon";
import type { DocumentStats } from "@/types";

interface DocumentsStatsProps {
  stats: DocumentStats;
}

export function DocumentsStats({ stats }: DocumentsStatsProps) {
  const numberFormat = new Intl.NumberFormat("ar-EG");

  return (
    <div className="customers-stats-grid">
      {/* 1. Total Documents */}
      <div className="customers-stat-card">
        <div className="customers-stat-card__icon" aria-hidden="true">
          <DynamicIcon name="FileText" size={22} />
        </div>
        <div>
          <div className="customers-stat-card__label">إجمالي المستندات</div>
          <div className="customers-stat-card__value">
            {numberFormat.format(stats.totalDocuments)}
          </div>
        </div>
      </div>

      {/* 2. Pending Documents */}
      <div className="customers-stat-card">
        <div
          className="customers-stat-card__icon"
          style={{ backgroundColor: "var(--color-gray-100)", color: "var(--color-gray-800)" }}
          aria-hidden="true"
        >
          <DynamicIcon name="Clock" size={22} />
        </div>
        <div>
          <div className="customers-stat-card__label">قيد المراجعة</div>
          <div className="customers-stat-card__value">
            {numberFormat.format(stats.pendingDocuments)}
          </div>
        </div>
      </div>

      {/* 3. Approved Documents */}
      <div className="customers-stat-card">
        <div
          className="customers-stat-card__icon"
          style={{ backgroundColor: "var(--color-yellow-light)", color: "var(--color-yellow-dark)" }}
          aria-hidden="true"
        >
          <DynamicIcon name="Check" size={22} />
        </div>
        <div>
          <div className="customers-stat-card__label">معتمدة</div>
          <div className="customers-stat-card__value">
            {numberFormat.format(stats.approvedDocuments)}
          </div>
        </div>
      </div>

      {/* 4. Customer Documents */}
      <div className="customers-stat-card">
        <div
          className="customers-stat-card__icon"
          style={{ backgroundColor: "var(--color-gray-100)", color: "var(--color-gray-700)" }}
          aria-hidden="true"
        >
          <DynamicIcon name="Users" size={22} />
        </div>
        <div>
          <div className="customers-stat-card__label">مستندات العملاء</div>
          <div className="customers-stat-card__value">
            {numberFormat.format(stats.customerDocuments)}
          </div>
        </div>
      </div>
    </div>
  );
}
