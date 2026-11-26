"use client";

/**
 * Company Documents Stats Summary Cards
 */

import { DynamicIcon } from "@/components/ui/icon";

interface CompanyDocumentsStatsProps {
  stats: {
    total: number;
    pending: number;
    approved: number;
  };
}

export function CompanyDocumentsStats({ stats }: CompanyDocumentsStatsProps) {
  const cards = [
    {
      label: "إجمالي المستندات",
      value: stats.total,
      icon: "FileCheck2",
      color: "var(--foreground)",
      bgColor: "var(--color-yellow-light, #fef9c3)",
      iconColor: "#b45309",
    },
    {
      label: "قيد المراجعة",
      value: stats.pending,
      icon: "Clock",
      color: "#d97706",
      bgColor: "#fffbeb",
      iconColor: "#b45309",
    },
    {
      label: "المستندات المعتمدة",
      value: stats.approved,
      icon: "ShieldCheck",
      color: "#059669",
      bgColor: "#ecfdf5",
      iconColor: "#059669",
    },
  ];

  return (
    <div className="customers-stats-grid" style={{ marginBottom: "1.5rem" }}>
      {cards.map((card) => (
        <div key={card.label} className="customers-stat-card">
          <div
            className="customers-stat-card__icon"
            style={{
              backgroundColor: card.bgColor,
              color: card.iconColor,
            }}
          >
            <DynamicIcon name={card.icon} size={22} />
          </div>
          <div className="customers-stat-card__info">
            <span className="customers-stat-card__label">{card.label}</span>
            <span
              className="customers-stat-card__value"
              style={{ color: card.color }}
            >
              {card.value}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
