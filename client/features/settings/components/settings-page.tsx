"use client";

import Link from "next/link";
import { PageHeader } from "@/components/headers/page-header";

const SETTINGS_CARDS = [
  {
    title: "Users & Roles",
    description: "Manage staff accounts and permission levels.",
    href: "/settings/roles",
  },
  {
    title: "Workshop Profile",
    description: "Update workshop name, address, and contact details.",
    href: "/settings",
  },
  {
    title: "Notifications",
    description: "Configure customer and internal alert preferences.",
    href: "/settings",
  },
  {
    title: "Service Types",
    description: "Manage the list of service types offered.",
    href: "/settings",
  },
  {
    title: "Integrations",
    description: "Connect payment gateways and external services.",
    href: "/settings",
  },
  {
    title: "Audit Log",
    description: "Review a history of system actions and changes.",
    href: "/settings/audit-log",
  },
];

export function SettingsPage() {
  return (
    <div className="flex flex-col gap-5 p-4 lg:p-6">
      <PageHeader
        title="Settings"
        description="Application settings, roles, and administration."
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SETTINGS_CARDS.map(({ title, description, href }) => (
          <div
            key={title}
            className="rounded-xl border border-[#e8edf3] bg-white p-5 shadow-sm transition hover:shadow-md"
          >
            <p className="font-semibold text-foreground">{title}</p>
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
            <Link
              href={href}
              className="mt-4 inline-block text-sm font-semibold text-primary hover:underline"
            >
              Configure →
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}
