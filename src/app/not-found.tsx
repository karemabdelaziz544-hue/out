/**
 * Global Not Found Page
 */

import type { Metadata } from "next";
import { routes } from "@/config/app";

export const metadata: Metadata = {
  title: "الصفحة غير موجودة | OUT",
};

export default function NotFound() {
  return (
    <main
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100dvh",
        fontFamily: "IBM Plex Sans Arabic, sans-serif",
        textAlign: "center",
        padding: "2rem",
        direction: "rtl",
        gap: "1rem",
      }}
    >
      <h1 style={{ fontSize: "4rem", fontWeight: 700 }}>404</h1>
      <h2 style={{ fontSize: "1.5rem" }}>الصفحة غير موجودة</h2>
      <p style={{ color: "#525252" }}>الصفحة التي تبحث عنها غير موجودة أو تم نقلها.</p>
      <a
        href={routes.dashboard}
        style={{
          marginTop: "1rem",
          display: "inline-block",
          padding: "0.75rem 2rem",
          backgroundColor: "#0A0A0A",
          color: "#FAFAFA",
          borderRadius: "0.5rem",
          textDecoration: "none",
          fontWeight: 500,
        }}
      >
        العودة إلى لوحة التحكم
      </a>
    </main>
  );
}
