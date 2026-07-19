"use client";

import { PageHeader } from "@/components/ui/page-header";

const SETTINGS_CARDS = [
  { title: "Users & Roles",      description: "Manage staff accounts and permission levels." },
  { title: "Workshop Profile",   description: "Update workshop name, address, and contact details." },
  { title: "Notifications",      description: "Configure customer and internal alert preferences." },
  { title: "Service Types",      description: "Manage the list of service types offered." },
  { title: "Integrations",       description: "Connect payment gateways and external services." },
  { title: "Audit Log",          description: "Review a history of system actions and changes." },
];

export function SettingsPage() {
  return (
    <div className="flex flex-col gap-5 p-4 lg:p-6">
      <PageHeader
        title="Settings"
        description="Application settings, roles, and administration."
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SETTINGS_CARDS.map(({ title, description }) => (
          <div key={title} className="rounded-xl border border-[#e8edf3] bg-white p-5 shadow-sm transition hover:shadow-md">
            <p className="font-semibold text-foreground">{title}</p>
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
            <button type="button" className="mt-4 text-sm font-semibold text-primary hover:underline">
              Configure →
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
