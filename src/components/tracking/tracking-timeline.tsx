"use client";

import { useMemo } from "react";
import { Check, Clock, CircleDot, MapPin, Ship, Calendar } from "lucide-react";
import type { TrackingEvent } from "@/lib/tracking/types";

interface TrackingTimelineProps {
  events: TrackingEvent[];
}

function formatDate(dateStr?: string): { formattedDate: string; formattedTime?: string } {
  if (!dateStr) return { formattedDate: "التاريخ غير محدد" };
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return { formattedDate: dateStr };
    
    const formattedDate = new Intl.DateTimeFormat("ar-EG", {
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(d);

    const formattedTime = new Intl.DateTimeFormat("ar-EG", {
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);

    return { formattedDate, formattedTime };
  } catch {
    return { formattedDate: dateStr };
  }
}

export function TrackingTimeline({ events }: TrackingTimelineProps) {
  // Sort events chronologically if timestamps are valid
  const sortedEvents = useMemo(() => {
    return [...(events || [])].sort((a, b) => {
      if (!a.date) return 1;
      if (!b.date) return -1;
      const timeA = new Date(a.date).getTime();
      const timeB = new Date(b.date).getTime();
      if (isNaN(timeA) || isNaN(timeB)) return 0;
      return timeA - timeB;
    });
  }, [events]);

  if (!sortedEvents || sortedEvents.length === 0) {
    return (
      <div className="tracking-timeline-empty" dir="rtl">
        <Clock size={24} className="text-gray-400 mb-2" />
        <p>لا توجد محطات مسجلة بعد في مسار هذه الشحنة.</p>
      </div>
    );
  }

  return (
    <div className="tracking-timeline-container" dir="rtl">
      <div className="tracking-section-header">
        <h3 className="tracking-section-title">مسار الرحلة والمحطات الملاحية</h3>
        <span className="tracking-event-count">{sortedEvents.length} محطة مسجلة</span>
      </div>

      <div className="tracking-timeline-list">
        {sortedEvents.map((event, index) => {
          const isLast = index === sortedEvents.length - 1;
          const { formattedDate, formattedTime } = formatDate(event.date);
          const locationName = event.location || event.port?.name;

          return (
            <div
              key={index}
              className={`tracking-timeline-item ${event.isActual ? "status-completed" : "status-pending"}`}
            >
              {/* Timeline Connector Line & Indicator Node */}
              <div className="timeline-node-container">
                <div className={`timeline-node ${event.isActual ? "completed" : "in_progress"}`}>
                  {event.isActual ? <Check size={14} /> : <CircleDot size={14} className="timeline-pulse" />}
                </div>
                {!isLast && <div className="timeline-connector" />}
              </div>

              {/* Event Content Details */}
              <div className="timeline-content-card">
                <div className="timeline-header-line">
                  <div className="timeline-title-group">
                    <h4 className="timeline-stage-title">
                      {event.description}
                    </h4>

                    {event.isActual ? (
                      <span className="timeline-badge completed">مؤكد</span>
                    ) : (
                      <span className="timeline-badge in-progress">مجدول / متوقع</span>
                    )}
                  </div>

                  {/* Timestamp */}
                  <div className="timeline-time-info">
                    <span className="timeline-date">
                      <Calendar size={13} className="inline-block ml-1" />
                      {formattedDate}
                    </span>
                    {formattedTime && (
                      <span className="timeline-time">({formattedTime})</span>
                    )}
                  </div>
                </div>

                {/* Port / Terminal Location */}
                {locationName && (
                  <div className="timeline-location-row">
                    <MapPin size={14} className="timeline-location-icon" />
                    <span className="timeline-location-name">{locationName}</span>
                  </div>
                )}

                {/* Vessel and Voyage if associated with this specific event */}
                {(event.vessel || event.voyage) && (
                  <div className="timeline-vessel-tag">
                    <Ship size={13} className="inline-block ml-1" />
                    <span>
                      {event.vessel ? `السفينة: ${event.vessel}` : ""}
                      {event.voyage ? ` — رحلة: ${event.voyage}` : ""}
                    </span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
