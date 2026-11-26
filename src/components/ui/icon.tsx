/**
 * Dynamic Icon Component
 *
 * Renders unified Lucide icons with consistent stroke and size.
 */

import React from "react";
import {
  LayoutDashboard,
  Users,
  Package,
  FileText,
  CheckSquare,
  UsersRound,
  Bell,
  BarChart3,
  Settings,
  User,
  LogOut,
  Menu,
  X,
  ChevronLeft,
  ChevronRight,
  PanelRightClose,
  PanelRightOpen,
  Search,
  RotateCw,
  UserCheck,
  UserX,
  ArrowRight,
  ArrowLeft,
  Check,
  AlertCircle,
  AlertTriangle,
  Phone,
  Mail,
  Calendar,
  Shield,
  MoreVertical,
  ExternalLink,
  HelpCircle,
  Eye,
  Download,
  File,
  Filter,
  Copy,
  Navigation,
  Clock,
  MinusCircle,
  CheckCircle,
  CheckCircle2,
  Ship,
  Loader,
  Receipt,
  History,
  DollarSign,
  CreditCard,
  Truck,
  Building2,
  FileCheck,
  CircleAlert,
  Sparkles,
  Info,
  Lock,
  Unlock,
  FileClock,
  CheckCheck,
  type LucideProps,
} from "lucide-react";

export type IconName =
  | "LayoutDashboard"
  | "Users"
  | "Package"
  | "FileText"
  | "CheckSquare"
  | "UsersRound"
  | "Bell"
  | "BarChart3"
  | "Settings"
  | "User"
  | "LogOut"
  | "Menu"
  | "X"
  | "ChevronLeft"
  | "ChevronRight"
  | "PanelRightClose"
  | "PanelRightOpen"
  | "Search"
  | "RotateCw"
  | "UserCheck"
  | "UserX"
  | "ArrowRight"
  | "ArrowLeft"
  | "Check"
  | "AlertCircle"
  | "AlertTriangle"
  | "Phone"
  | "Mail"
  | "Calendar"
  | "Shield"
  | "MoreVertical"
  | "ExternalLink"
  | "Eye"
  | "Download"
  | "File"
  | "Filter"
  | "Copy"
  | "Navigation"
  | "Clock"
  | "MinusCircle"
  | "CheckCircle"
  | "CheckCircle2"
  | "Ship"
  | "Loader"
  | "Receipt"
  | "History"
  | "DollarSign"
  | "CreditCard"
  | "Truck"
  | "Building2"
  | "FileCheck"
  | "CircleAlert"
  | "Sparkles"
  | "Info"
  | "Lock"
  | "Unlock"
  | "FileClock"
  | "CheckCheck"
  | string;

const iconMap: Record<string, React.ComponentType<LucideProps>> = {
  LayoutDashboard,
  Users,
  Package,
  FileText,
  CheckSquare,
  UsersRound,
  Bell,
  BarChart3,
  Settings,
  User,
  LogOut,
  Menu,
  X,
  ChevronLeft,
  ChevronRight,
  PanelRightClose,
  PanelRightOpen,
  Search,
  RotateCw,
  UserCheck,
  UserX,
  ArrowRight,
  ArrowLeft,
  Check,
  AlertCircle,
  AlertTriangle,
  Phone,
  Mail,
  Calendar,
  Shield,
  MoreVertical,
  ExternalLink,
  Eye,
  Download,
  File,
  Filter,
  Copy,
  Navigation,
  Clock,
  MinusCircle,
  CheckCircle,
  CheckCircle2,
  Ship,
  Loader,
  Receipt,
  History,
  DollarSign,
  CreditCard,
  Truck,
  Building2,
  FileCheck,
  CircleAlert,
  Sparkles,
  Info,
  Lock,
  Unlock,
  FileClock,
  CheckCheck,
};

export interface DynamicIconProps extends LucideProps {
  name: IconName;
}

export function DynamicIcon({ name, size = 20, strokeWidth = 1.75, ...props }: DynamicIconProps) {
  const IconComponent = iconMap[name] || HelpCircle;
  return <IconComponent size={size} strokeWidth={strokeWidth} {...props} />;
}
