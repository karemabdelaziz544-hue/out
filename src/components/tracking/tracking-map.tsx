"use client";

import { useEffect, useRef, useState, useMemo } from "react";
import { MapPin, Navigation, Anchor, Info } from "lucide-react";
import type { Map as LeafletMap } from "leaflet";
import type { TrackingResult } from "@/lib/tracking/types";

interface TrackingMapProps {
  result: TrackingResult;
}

export function TrackingMap({ result }: TrackingMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<LeafletMap | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);

  // Extract coordinates from lastPosition and route waypoints
  const currentCoords = useMemo(() => {
    return result.lastPosition
      ? {
          lat: result.lastPosition.latitude,
          lng: result.lastPosition.longitude,
        }
      : null;
  }, [result.lastPosition]);

  const portCoords = useMemo(() => {
    return (result.route?.waypoints || [])
      .filter(
        (p) => typeof p.latitude === "number" && typeof p.longitude === "number",
      )
      .map((p) => ({
        name: p.name,
        code: p.code,
        country: p.country,
        lat: p.latitude!,
        lng: p.longitude!,
      }));
  }, [result.route?.waypoints]);

  const hasCoordinates =
    Boolean(currentCoords && typeof currentCoords.lat === "number" && typeof currentCoords.lng === "number") ||
    portCoords.length > 0;

  // Initialize Leaflet map if coordinates exist and window is defined
  useEffect(() => {
    if (!hasCoordinates || typeof window === "undefined" || !mapContainerRef.current) {
      return;
    }

    let isMounted = true;

    async function initMap() {
      try {
        const L = (await import("leaflet")).default;
        // Dynamically import Leaflet CSS if not already present
        if (!document.getElementById("leaflet-css")) {
          const link = document.createElement("link");
          link.id = "leaflet-css";
          link.rel = "stylesheet";
          link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
          document.head.appendChild(link);
        }

        if (!isMounted || !mapContainerRef.current) return;

        // Clean up previous instance if any
        if (mapInstanceRef.current) {
          mapInstanceRef.current.remove();
          mapInstanceRef.current = null;
        }

        // Determine center point
        const initialLat = currentCoords?.lat ?? portCoords[0]?.lat ?? 26.8;
        const initialLng = currentCoords?.lng ?? portCoords[0]?.lng ?? 34.0;

        const map = L.map(mapContainerRef.current, {
          center: [initialLat, initialLng],
          zoom: 4,
          scrollWheelZoom: false,
          attributionControl: true,
        });

        // Add OpenStreetMap tile layer (Free, open-source, no paid API keys required)
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
          maxZoom: 18,
        }).addTo(map);

        const bounds = L.latLngBounds([]);

        // Custom OUT Marker Icons
        const createCustomIcon = (type: "vessel" | "port") => {
          let bg = "#0A0A0A";
          let border = "#F5C500";
          let inner = "📍";
          if (type === "vessel") {
            bg = "#F5C500";
            border = "#0A0A0A";
            inner = "🚢";
          } else {
            bg = "#262626";
            border = "#d4d4d4";
            inner = "⚓";
          }

          return L.divIcon({
            className: "out-map-custom-marker",
            html: `
              <div style="
                background: ${bg};
                color: ${type === "vessel" ? "#0A0A0A" : "#FFFFFF"};
                border: 2px solid ${border};
                border-radius: 50%;
                width: 32px;
                height: 32px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 14px;
                box-shadow: 0 4px 10px rgba(0,0,0,0.3);
                font-family: inherit;
              ">
                ${inner}
              </div>
            `,
            iconSize: [32, 32],
            iconAnchor: [16, 16],
            popupAnchor: [0, -18],
          });
        };

        // Add Port/Station Markers
        portCoords.forEach((pt) => {
          const marker = L.marker([pt.lat, pt.lng], {
            icon: createCustomIcon("port"),
          }).addTo(map);

          marker.bindPopup(`
            <div style="direction: rtl; text-align: right; font-family: 'IBM Plex Sans Arabic', sans-serif;">
              <strong style="color: #0A0A0A; font-size: 14px;">${pt.name}</strong>
              ${pt.code ? `<div style="font-size: 12px; color: #525252; margin-top: 4px;">كود الميناء: ${pt.code}</div>` : ""}
              <div style="font-size: 11px; color: #737373; margin-top: 2px; direction: ltr;">
                ${pt.lat.toFixed(4)}°, ${pt.lng.toFixed(4)}°
              </div>
            </div>
          `);

          bounds.extend([pt.lat, pt.lng]);
        });

        // Add Current Vessel Marker if valid
        if (currentCoords && typeof currentCoords.lat === "number" && typeof currentCoords.lng === "number") {
          const vesselMarker = L.marker([currentCoords.lat, currentCoords.lng], {
            icon: createCustomIcon("vessel"),
          }).addTo(map);

          vesselMarker.bindPopup(`
            <div style="direction: rtl; text-align: right; font-family: 'IBM Plex Sans Arabic', sans-serif;">
              <strong style="color: #0A0A0A; font-size: 14px;">🚢 موقع السفينة الحالي</strong>
              <div style="font-size: 12px; color: #525252; margin-top: 4px;">
                ${result.vessel?.name ? `السفينة: ${result.vessel.name}` : "في عرض البحر"}
              </div>
              <div style="font-size: 11px; color: #737373; margin-top: 2px; direction: ltr;">
                ${currentCoords.lat.toFixed(4)}°, ${currentCoords.lng.toFixed(4)}°
              </div>
            </div>
          `);

          bounds.extend([currentCoords.lat, currentCoords.lng]);
        }

        // Fit map bounds if points were added
        if (bounds.isValid()) {
          map.fitBounds(bounds, { padding: [50, 50], maxZoom: 8 });
        }

        mapInstanceRef.current = map;
      } catch (err) {
        console.error("Map initialization failed:", err);
        setMapError("تعذر تحميل الخريطة التفاعلية.");
      }
    }

    initMap();

    return () => {
      isMounted = false;
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, [hasCoordinates, currentCoords, portCoords, result.vessel?.name]);

  // If no coordinates are available or text-only result:
  // Render the structured visual route schematic without faking coordinates
  if (!hasCoordinates || mapError) {
    const origin = result.route?.originPort;
    const destination = result.route?.destinationPort;

    return (
      <div className="tracking-map-fallback-card" dir="rtl">
        <div className="tracking-map-fallback-header">
          <div className="fallback-title-group">
            <h3 className="tracking-section-title">المسار الملاحي والمحطات</h3>
            <span className="tracking-fallback-badge">
              <Info size={13} className="inline-block ml-1" />
              عرض تخطيطي للمسار
            </span>
          </div>
          <p className="tracking-fallback-notice">
            لا تتوفر إحداثيات جغرافية مؤكدة مباشرة لهذه الرحلة. يتم عرض المحطات المعتمدة من الخط الملاحي أدناه.
          </p>
        </div>

        {/* Visual Port-to-Port Schematic Diagram */}
        <div className="tracking-schematic-flow">
          {origin?.name && (
            <div className="schematic-step origin">
              <div className="schematic-step-icon">
                <Anchor size={18} />
              </div>
              <div className="schematic-step-body">
                <span className="schematic-step-label">نقطة الانطلاق</span>
                <strong className="schematic-step-name">{origin.name}</strong>
                {result.departureDate && (
                  <span className="schematic-step-sub">
                    {new Date(result.departureDate).toLocaleDateString("ar-EG")}
                  </span>
                )}
              </div>
            </div>
          )}

          <div className="schematic-transit-line">
            <div className="schematic-vessel-indicator">
              <Navigation size={16} className="transit-arrow" />
              <span>{result.vessel?.name ? `السفينة: ${result.vessel.name}` : "في مسار الملاحة"}</span>
            </div>
          </div>

          {destination?.name && (
            <div className="schematic-step destination">
              <div className="schematic-step-icon">
                <MapPin size={18} />
              </div>
              <div className="schematic-step-body">
                <span className="schematic-step-label">ميناء الوصول النهائي</span>
                <strong className="schematic-step-name">{destination.name}</strong>
                {result.eta && (
                  <span className="schematic-step-sub arrival-eta">
                    ETA: {new Date(result.eta).toLocaleDateString("ar-EG")}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="tracking-map-container" dir="rtl">
      <div className="tracking-section-header">
        <h3 className="tracking-section-title">الخريطة الملاحية المباشرة</h3>
        <span className="tracking-map-legend">
          <span className="legend-item"><span className="legend-dot vessel" /> موقع السفينة</span>
          <span className="legend-item"><span className="legend-dot port" /> الموانئ والمحطات</span>
        </span>
      </div>

      <div
        ref={mapContainerRef}
        className="tracking-leaflet-wrapper"
        aria-label="خريطة المسار الملاحي"
      />
    </div>
  );
}
