/**
 * Customers Stats Summary Component
 */

import { DynamicIcon } from "@/components/ui/icon";
import type { CustomerStats } from "@/types";

interface CustomersStatsProps {
  stats: CustomerStats;
}

export function CustomersStats({ stats }: CustomersStatsProps) {
  return (
    <div className="customers-stats-grid">
      {/* 1. Total Customers */}
      <div className="customers-stat-card">
        <div className="customers-stat-card__icon">
          <DynamicIcon name="Users" size={24} />
        </div>
        <div className="customers-stat-card__info">
          <span className="customers-stat-card__label">إجمالي العملاء</span>
          <span className="customers-stat-card__value">{stats.total}</span>
        </div>
      </div>

      {/* 2. Active Accounts */}
      <div className="customers-stat-card">
        <div className="customers-stat-card__icon customers-stat-card__icon--active">
          <DynamicIcon name="UserCheck" size={24} />
        </div>
        <div className="customers-stat-card__info">
          <span className="customers-stat-card__label">الحسابات النشطة</span>
          <span className="customers-stat-card__value">{stats.active}</span>
        </div>
      </div>

      {/* 3. Inactive Accounts */}
      <div className="customers-stat-card">
        <div className="customers-stat-card__icon customers-stat-card__icon--inactive">
          <DynamicIcon name="UserX" size={24} />
        </div>
        <div className="customers-stat-card__info">
          <span className="customers-stat-card__label">الحسابات غير النشطة</span>
          <span className="customers-stat-card__value">{stats.inactive}</span>
        </div>
      </div>
    </div>
  );
}
