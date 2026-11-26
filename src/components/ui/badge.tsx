/**
 * Badge Component
 */

import { type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/types";

export type BadgeVariant = "default" | "accent" | "outline" | "muted";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

export function Badge({ variant = "default", className, children, ...props }: BadgeProps) {
  return (
    <span className={cn("badge", `badge--${variant}`, className)} {...props}>
      {children}
    </span>
  );
}

/**
 * RoleBadge — renders a role with its Arabic label.
 */
export function RoleBadge({ role }: { role: UserRole }) {
  const labels: Record<UserRole, string> = {
    admin: "مدير النظام",
    manager: "مدير",
    data_entry: "مدخل بيانات",
    scout: "مندوب",
    inspector: "مفتش",
    customer: "عميل",
  };

  return (
    <Badge variant="accent" className="role-badge">
      {labels[role]}
    </Badge>
  );
}
