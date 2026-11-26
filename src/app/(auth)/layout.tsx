import type { Metadata } from "next";

export const instant = false;

export const metadata: Metadata = {
  title: "المصادقة | OUT",
};

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="auth-layout">
      {children}
    </div>
  );
}
