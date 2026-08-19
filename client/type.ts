//icons type
import { type LucideIcon } from "lucide-react";

//role types
import { type AppRole } from "./features/auth/roles";

// ─── Nav Types ────────────────────────────────────────────────────────────────────

export interface NavItem {
  label: string;
  href?: string;
  /** Optional children for nested menus */
  children?: NavItem[];
  icon: LucideIcon;
  badge?: number;
  roles?: AppRole[];
}

export interface NavGroup {
  label: string;
  items: NavItem[];
  roles?: AppRole[];
}
