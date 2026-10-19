"use client";

import Link from "next/link";
import { PageHeader } from "@/components/headers/page-header";

const SETTINGS_CARDS = [
  { title: "Party reports", description: "Set company defaults for ageing limits.", href: "/settings/party-reports" },
  {
    title: "Users & Roles",
    description: "Manage staff accounts and permission levels.",
    href: "/settings/roles",
  },
  {
    title: "Company & Branch Settings",
    description: "Company details on documents; each branch's VAT, round-off, repeat-job, booking and workshop rules.",
    href: "/settings/company",
  },
  {
    title: "Notifications",
    description: "Configure customer and internal alert preferences.",
    href: "/settings",
  },
  {
    title: "Workshop Masters",
    description: "Vehicle catalogue, services, bays, defects, designations, geography, UOM and tax codes.",
    href: "/settings/workshop-masters",
  },
  {
    title: "Service Checklists",
    description: "Parts and labour per checklist and model, and the checklist due at each mileage.",
    href: "/settings/service-checklists",
  },
  {
    title: "Part Categories",
    description: "Retail multiplier per price category and each branch's discount, handling and cost %.",
    href: "/settings/part-categories",
  },
  {
    title: "Terms & Conditions",
    description: "Terms and footer messages printed on estimates, job cards, bills, quotations and receipts.",
    href: "/settings/document-terms",
  },
  {
    title: "Integrations",
    description: "Connect payment gateways and external services.",
    href: "/settings",
  },
  {
    title: "Warranty",
    description: "Model warranty policies and manufacturer claim codes.",
    href: "/warranty/settings",
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
