//icons type
import { type LucideIcon } from "lucide-react";

//role types
import { type AppRole } from "./features/auth/roles";

// ─── Nav Types ────────────────────────────────────────────────────────────────────

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  badge?: number;
  roles?: AppRole[];
}

export interface NavGroup {
  label: string;
  items: NavItem[];
  roles?: AppRole[];
}
