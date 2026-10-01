import React from "react";
import {
  Home,
  Package,
  Building2,
  Users,
  ShoppingCart,
  Receipt,
  BarChart3,
  Settings,
  X,
  Check,
  AlertTriangle,
  Search,
  Plus,
  Pencil,
  Trash2,
  ChevronDown,
  ChevronRight,
  ArrowLeft,
  LogOut,
  RefreshCw,
  User,
  FileText,
  Star,
  Flame,
  Gift,
  Download,
  Eye,
  EyeOff,
  type LucideProps,
} from "lucide-react";

const registry = {
  home: Home,
  stock: Package,
  properties: Building2,
  clients: Users,
  "shopping-list": ShoppingCart,
  billing: Receipt,
  reports: BarChart3,
  settings: Settings,
  close: X,
  check: Check,
  warning: AlertTriangle,
  search: Search,
  add: Plus,
  edit: Pencil,
  delete: Trash2,
  "chevron-down": ChevronDown,
  "chevron-right": ChevronRight,
  back: ArrowLeft,
  "log-out": LogOut,
  refresh: RefreshCw,
  user: User,
  document: FileText,
  star: Star,
  flame: Flame,
  gift: Gift,
  download: Download,
  eye: Eye,
  "eye-off": EyeOff,
} as const;

export type IconName = keyof typeof registry;

type IconProps = Omit<LucideProps, "ref"> & { name: IconName };

/**
 * Thin wrapper around lucide-react so call sites use a stable name instead of
 * importing individual icon components. Keeps the icon set small and
 * consistent (replacing emoji used across nav/buttons/status indicators).
 */
export const Icon: React.FC<IconProps> = ({ name, size = 18, strokeWidth = 1.75, ...rest }) => {
  const Component = registry[name];
  return <Component size={size} strokeWidth={strokeWidth} aria-hidden="true" {...rest} />;
};
