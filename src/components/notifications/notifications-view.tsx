"use client";

import React, { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DynamicIcon } from "@/components/ui/icon";
import {
  markNotificationAsReadAction,
  markAllNotificationsAsReadAction,
} from "@/lib/notifications/actions";
import type { AppNotification } from "@/types";
import { formatDateAr } from "@/lib/utils";

interface NotificationsViewProps {
  initialNotifications: AppNotification[];
  currentUserId: string;
}

export function NotificationsView({
  initialNotifications,
}: NotificationsViewProps) {
  const router = useRouter();
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [isPending, startTransition] = useTransition();
  const [actionError, setActionError] = useState<string | null>(null);

  const unreadCount = initialNotifications.filter((n) => !n.is_read).length;
  const filteredList =
    filter === "unread"
      ? initialNotifications.filter((n) => !n.is_read)
      : initialNotifications;

  const handleMarkAsRead = (id: string) => {
    setActionError(null);
    startTransition(async () => {
      const res = await markNotificationAsReadAction(id);
      if (!res.success && res.error) {
        setActionError(res.error);
      } else {
        router.refresh();
      }
    });
  };

  const handleMarkAllAsRead = () => {
    setActionError(null);
    startTransition(async () => {
      const res = await markAllNotificationsAsReadAction();
      if (!res.success && res.error) {
        setActionError(res.error);
      } else {
        router.refresh();
      }
    });
  };

  const getIconName = (type: string) => {
    switch (type) {
      case "pricing":
        return "Banknote";
      case "invoice":
        return "Receipt";
      case "acid":
        return "Key";
      case "document":
        return "FileText";
      case "readiness":
        return "ExternalLink";
      case "success":
        return "CheckCircle";
      case "warning":
        return "AlertTriangle";
      default:
        return "Bell";
    }
  };

  return (
    <div style={{ maxWidth: "860px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      {/* ─── Header & Actions ─────────────────────────────────────────────────── */}
      <div
        className="card"
        style={{
          padding: "1.25rem 1.5rem",
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
              width: "42px",
              height: "42px",
              borderRadius: "var(--radius-md)",
              backgroundColor: "var(--color-yellow-light)",
              color: "var(--color-black)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <DynamicIcon name="Bell" size={22} />
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <h1 style={{ fontSize: "var(--font-size-xl)", fontWeight: "var(--font-weight-bold)", margin: 0 }}>
                مركز الإشعارات
              </h1>
              {unreadCount > 0 && (
                <span
                  style={{
                    backgroundColor: "var(--color-yellow)",
                    color: "var(--color-black)",
                    padding: "0.15rem 0.5rem",
                    borderRadius: "var(--radius-full)",
                    fontSize: "var(--font-size-xs)",
                    fontWeight: "var(--font-weight-bold)",
                  }}
                >
                  {unreadCount} غير مقروء
                </span>
              )}
            </div>
            <p style={{ margin: "0.25rem 0 0 0", fontSize: "var(--font-size-sm)", color: "var(--color-gray-600)" }}>
              متابعة آخر التحديثات والقرارات ومستجدات الشحنات الخاصة بك لحظة بلحظة.
            </p>
          </div>
        </div>

        {unreadCount > 0 && (
          <button
            type="button"
            className="btn btn--secondary btn--sm"
            onClick={handleMarkAllAsRead}
            disabled={isPending}
            style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
          >
            <DynamicIcon name="CheckCheck" size={16} />
            <span>تحديد الكل كمقروء</span>
          </button>
        )}
      </div>

      {actionError && (
        <div
          style={{
            padding: "0.75rem 1rem",
            borderRadius: "var(--radius-md)",
            backgroundColor: "#fef2f2",
            border: "1px solid #fecaca",
            color: "#991b1b",
            fontSize: "var(--font-size-sm)",
          }}
        >
          {actionError}
        </div>
      )}

      {/* ─── Filter Tabs ──────────────────────────────────────────────────────── */}
      <div style={{ display: "flex", gap: "0.5rem", borderBottom: "1px solid var(--color-gray-200)", paddingBottom: "0.5rem" }}>
        <button
          type="button"
          onClick={() => setFilter("all")}
          style={{
            padding: "0.5rem 1rem",
            borderRadius: "var(--radius-md)",
            border: "none",
            backgroundColor: filter === "all" ? "var(--color-black)" : "transparent",
            color: filter === "all" ? "var(--color-white)" : "var(--color-gray-600)",
            fontWeight: filter === "all" ? "var(--font-weight-bold)" : "var(--font-weight-medium)",
            fontSize: "var(--font-size-sm)",
            cursor: "pointer",
            transition: "all 0.15s ease",
          }}
        >
          جميع الإشعارات ({initialNotifications.length})
        </button>
        <button
          type="button"
          onClick={() => setFilter("unread")}
          style={{
            padding: "0.5rem 1rem",
            borderRadius: "var(--radius-md)",
            border: "none",
            backgroundColor: filter === "unread" ? "var(--color-black)" : "transparent",
            color: filter === "unread" ? "var(--color-white)" : "var(--color-gray-600)",
            fontWeight: filter === "unread" ? "var(--font-weight-bold)" : "var(--font-weight-medium)",
            fontSize: "var(--font-size-sm)",
            cursor: "pointer",
            transition: "all 0.15s ease",
          }}
        >
          غير المقروءة ({unreadCount})
        </button>
      </div>

      {/* ─── Notifications List ───────────────────────────────────────────────── */}
      {filteredList.length === 0 ? (
        <div
          className="card"
          style={{
            padding: "3.5rem 2rem",
            textAlign: "center",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "0.75rem",
          }}
        >
          <div
            style={{
              width: "56px",
              height: "56px",
              borderRadius: "var(--radius-full)",
              backgroundColor: "var(--color-gray-100)",
              color: "var(--color-gray-500)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: "0.5rem",
            }}
          >
            <DynamicIcon name="BellOff" size={28} />
          </div>
          <h2 style={{ fontSize: "var(--font-size-lg)", fontWeight: "var(--font-weight-bold)", margin: 0 }}>
            {filter === "unread" ? "لا توجد إشعارات غير مقروءة" : "لا توجد إشعارات حتى الآن"}
          </h2>
          <p style={{ margin: 0, fontSize: "var(--font-size-sm)", color: "var(--color-gray-600)", maxWidth: "400px" }}>
            {filter === "unread"
              ? "لقد قمت بقراءة كافة الإشعارات والتحديثات السابقة."
              : "ستظهر هنا كافة الإشعارات الخاصة بشحناتك فور تقديم عرض سعر أو مراجعة المستندات أو صدور كود ACID."}
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {filteredList.map((notification) => {
            const isUnread = !notification.is_read;
            return (
              <div
                key={notification.id}
                className="card"
                style={{
                  padding: "1rem 1.25rem",
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "1rem",
                  backgroundColor: isUnread ? "rgba(245, 197, 0, 0.04)" : "var(--color-surface)",
                  border: isUnread
                    ? "1px solid rgba(245, 197, 0, 0.5)"
                    : "1px solid var(--color-border)",
                  transition: "all 0.15s ease",
                  position: "relative",
                }}
              >
                {/* Status Dot */}
                {isUnread && (
                  <span
                    style={{
                      position: "absolute",
                      top: "1rem",
                      right: "0.75rem",
                      width: "8px",
                      height: "8px",
                      borderRadius: "var(--radius-full)",
                      backgroundColor: "var(--color-yellow-dark)",
                    }}
                    title="غير مقروء"
                  />
                )}

                {/* Type Icon */}
                <div
                  style={{
                    width: "40px",
                    height: "40px",
                    borderRadius: "var(--radius-md)",
                    backgroundColor: isUnread ? "var(--color-yellow-light)" : "var(--color-gray-100)",
                    color: isUnread ? "var(--color-black)" : "var(--color-gray-700)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    marginInlineEnd: isUnread ? "0.25rem" : "0",
                  }}
                >
                  <DynamicIcon name={getIconName(notification.type)} size={20} />
                </div>

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "0.5rem",
                      marginBottom: "0.25rem",
                    }}
                  >
                    <h3
                      style={{
                        margin: 0,
                        fontSize: "var(--font-size-base)",
                        fontWeight: isUnread ? "var(--font-weight-bold)" : "var(--font-weight-semibold)",
                        color: "var(--color-black)",
                      }}
                    >
                      {notification.title}
                    </h3>
                    <span
                      style={{
                        fontSize: "var(--font-size-xs)",
                        color: "var(--color-gray-500)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {formatDateAr(notification.created_at)}
                    </span>
                  </div>

                  <p
                    style={{
                      margin: 0,
                      fontSize: "var(--font-size-sm)",
                      color: "var(--color-gray-700)",
                      lineHeight: "1.6",
                    }}
                  >
                    {notification.message}
                  </p>

                  {/* Actions Bar */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.75rem",
                      marginTop: "0.75rem",
                    }}
                  >
                    {notification.link && (
                      <Link
                        href={notification.link}
                        className="btn btn--secondary btn--sm"
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.35rem",
                          padding: "0.25rem 0.65rem",
                          fontSize: "var(--font-size-xs)",
                        }}
                      >
                        <span>عرض التفاصيل</span>
                        <DynamicIcon name="ArrowLeft" size={12} />
                      </Link>
                    )}

                    {isUnread && (
                      <button
                        type="button"
                        onClick={() => handleMarkAsRead(notification.id)}
                        disabled={isPending}
                        style={{
                          background: "none",
                          border: "none",
                          padding: 0,
                          fontSize: "var(--font-size-xs)",
                          color: "var(--color-gray-600)",
                          textDecoration: "underline",
                          cursor: "pointer",
                        }}
                      >
                        تحديد كمقروء
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
