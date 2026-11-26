/**
 * Error Boundary — Client Component
 *
 * Next.js error.tsx — catches errors in the route segment and sub-segments.
 * Shows a user-friendly message without exposing technical details.
 */

"use client";

import { useEffect } from "react";

interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function Error({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    // Log to error reporting service in production (e.g. Sentry)
    // Never log sensitive data
    if (process.env.NODE_ENV === "development") {
      console.error("[ErrorBoundary]", error.message);
    }
  }, [error]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "60vh",
        fontFamily: "IBM Plex Sans Arabic, sans-serif",
        textAlign: "center",
        padding: "2rem",
        direction: "rtl",
        gap: "1rem",
      }}
    >
      <h2 style={{ fontSize: "1.5rem", fontWeight: 600 }}>حدث خطأ ما</h2>
      <p style={{ color: "#525252" }}>
        نعتذر عن هذا الخطأ. يرجى المحاولة مرة أخرى.
      </p>
      {process.env.NODE_ENV === "development" && (
        <code
          style={{
            fontSize: "0.75rem",
            background: "#f3f3f3",
            padding: "0.5rem 1rem",
            borderRadius: "0.25rem",
            maxWidth: "600px",
            wordBreak: "break-all",
          }}
        >
          {error.message}
        </code>
      )}
      <button
        onClick={reset}
        style={{
          marginTop: "0.5rem",
          padding: "0.75rem 2rem",
          backgroundColor: "#0A0A0A",
          color: "#FAFAFA",
          border: "none",
          borderRadius: "0.5rem",
          cursor: "pointer",
          fontFamily: "inherit",
          fontSize: "1rem",
        }}
      >
        حاول مجدداً
      </button>
    </div>
  );
}
