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
  /** Backend permission strings required to see this item (e.g. "customer:read"). Takes precedence over `roles`. */
  permissions?: string[];
  /** Legacy role-based access — used as fallback when `permissions` is not set. */
  roles?: AppRole[];
}

export interface NavGroup {
  label: string;
  items: NavItem[];
  /** Backend permission strings required to see this group. Takes precedence over `roles`. */
  permissions?: string[];
  /** Legacy role-based access — used as fallback when `permissions` is not set. */
  roles?: AppRole[];
}
