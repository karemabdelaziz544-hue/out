"use client";

/**
 * CollapsibleSection Component
 *
 * A clean, accessible collapsible section following the OUT design system.
 * Used for progressive disclosure across customer and admin views.
 */

import React, { useState, useId } from "react";
import { DynamicIcon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

export interface CollapsibleSectionProps {
  id?: string;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  badge?: React.ReactNode;
  icon?: string;
  defaultOpen?: boolean;
  isOpen?: boolean;
  onToggle?: (open: boolean) => void;
  headerRight?: React.ReactNode;
  variant?: "card" | "subtle" | "bordered";
  className?: string;
  children: React.ReactNode;
}

export function CollapsibleSection({
  id: customId,
  title,
  subtitle,
  badge,
  icon,
  defaultOpen = false,
  isOpen: controlledIsOpen,
  onToggle,
  headerRight,
  variant = "card",
  className,
  children,
}: CollapsibleSectionProps) {
  const autoId = useId();
  const sectionId = customId || `collapsible-${autoId}`;
  const contentId = `${sectionId}-content`;

  const [uncontrolledIsOpen, setUncontrolledIsOpen] = useState(defaultOpen);
  const isControlled = controlledIsOpen !== undefined;
  const open = isControlled ? controlledIsOpen : uncontrolledIsOpen;

  const handleToggle = () => {
    const next = !open;
    if (!isControlled) {
      setUncontrolledIsOpen(next);
    }
    onToggle?.(next);
  };

  const getContainerStyles = (): React.CSSProperties => {
    switch (variant) {
      case "subtle":
        return {
          backgroundColor: "var(--color-gray-50)",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-md)",
          overflow: "hidden",
        };
      case "bordered":
        return {
          backgroundColor: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-md)",
          overflow: "hidden",
        };
      case "card":
      default:
        return {
          backgroundColor: "var(--color-surface)",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-md)",
          overflow: "hidden",
          boxShadow: "var(--shadow-sm)",
        };
    }
  };

  return (
    <div
      id={sectionId}
      className={cn("collapsible-section", className)}
      style={getContainerStyles()}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "1rem 1.25rem",
          backgroundColor: open ? "var(--color-surface-raised)" : "var(--color-surface)",
          transition: "background-color 0.15s ease",
          gap: "1rem",
        }}
      >
        <button
          type="button"
          onClick={handleToggle}
          aria-expanded={open}
          aria-controls={contentId}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
            background: "none",
            border: "none",
            padding: 0,
            margin: 0,
            font: "inherit",
            cursor: "pointer",
            textAlign: "right",
            flex: 1,
            color: "inherit",
          }}
        >
          {icon && (
            <div
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "var(--radius-sm)",
                backgroundColor: open ? "var(--color-yellow-light)" : "var(--color-gray-100)",
                color: open ? "var(--color-yellow-dark)" : "var(--color-gray-600)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                transition: "all 0.2s ease",
              }}
            >
              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              <DynamicIcon name={icon as any} size={18} />
            </div>
          )}

          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
              <span
                style={{
                  fontSize: "var(--font-size-base)",
                  fontWeight: "var(--font-weight-semibold)",
                  color: "var(--color-black)",
                }}
              >
                {title}
              </span>
              {badge && <div style={{ display: "inline-flex" }}>{badge}</div>}
            </div>

            {subtitle && (
              <p
                style={{
                  fontSize: "var(--font-size-xs)",
                  color: "var(--color-gray-500)",
                  margin: "0.2rem 0 0 0",
                }}
              >
                {subtitle}
              </p>
            )}
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "28px",
              height: "28px",
              borderRadius: "var(--radius-sm)",
              backgroundColor: "var(--color-gray-100)",
              color: "var(--color-gray-700)",
              transition: "transform 0.2s ease",
              transform: open ? "rotate(180deg)" : "rotate(0deg)",
              flexShrink: 0,
            }}
          >
            <DynamicIcon name="ChevronDown" size={16} />
          </div>
        </button>

        {headerRight && (
          <div
            style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}
            onClick={(e) => e.stopPropagation()}
          >
            {headerRight}
          </div>
        )}
      </div>

      {open && (
        <div
          id={contentId}
          style={{
            padding: "1.25rem",
            borderTop: "1px solid var(--color-border)",
            backgroundColor: "var(--color-surface)",
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}
