/**
 * Avatar Component
 */

import { type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export interface AvatarProps extends HTMLAttributes<HTMLDivElement> {
  src?: string | null;
  name?: string | null;
  size?: "sm" | "md" | "lg";
}

function getInitials(name: string | null | undefined): string {
  if (!name) return "؟";
  const words = name.trim().split(/\s+/);
  if (words.length === 1) return words[0]?.charAt(0).toUpperCase() ?? "؟";
  return (words[0]?.charAt(0) ?? "") + (words[words.length - 1]?.charAt(0) ?? "");
}

const sizeClasses = {
  sm: "avatar--sm",
  md: "avatar--md",
  lg: "avatar--lg",
};

export function Avatar({ src, name, size = "md", className, ...props }: AvatarProps) {
  return (
    <div className={cn("avatar", sizeClasses[size], className)} {...props}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={name ?? "صورة المستخدم"} className="avatar__image" />
      ) : (
        <span className="avatar__initials" aria-label={name ?? undefined}>
          {getInitials(name)}
        </span>
      )}
    </div>
  );
}
