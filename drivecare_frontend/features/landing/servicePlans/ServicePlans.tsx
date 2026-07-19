"use client";

import { useReactTable, getCoreRowModel, flexRender } from "@tanstack/react-table";
import { useLandingStore } from "../store/landing.store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { serviceColumns, serviceFeatures } from "../constants/landing.data";

export default function ServicePlans() {
  const { careMode, setCareMode } = useLandingStore();
  const table = useReactTable({
    data: serviceFeatures,
    columns: serviceColumns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <section id="services" className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
      <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
        <div className="max-w-2xl">
          <Badge tone="green">Service options</Badge>
          <h2 className="mt-4 text-3xl font-black sm:text-5xl">Choose the right care path for your vehicle.</h2>
        </div>
        <div className="flex rounded-lg border border-border bg-card p-1">
          {(["standard", "priority"] as const).map((mode) => (
            <button
              key={mode}
              className={cn(
                "h-9 rounded-md px-4 text-sm font-bold capitalize",
                careMode === mode && "bg-primary text-primary-foreground",
              )}
              onClick={() => setCareMode(mode)}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-10 grid gap-4 lg:grid-cols-3">
        {[
          ["Routine Service", careMode === "priority" ? "Priority slot" : "Scheduled visit", "Oil, filters, brakes, fluids, tires, and preventive checks."],
          ["Diagnostics", careMode === "priority" ? "Fast review" : "Guided check", "Identify warning lights, AC faults, noise, electrical issues, or performance concerns."],
          ["Repair & Parts", "Dana estimate", "Approve repairs, replacement parts, and pickup timing before work proceeds."],
        ].map(([name, price, copy], index) => (
          <Card key={name} className={cn(index === 1 && "border-primary shadow-xl shadow-blue-500/10") }>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>{name}</CardTitle>
                {index === 1 && <Badge tone="blue">Most requested</Badge>}
              </div>
              <p className="pt-5 text-4xl font-black">{price}</p>
              <p className="text-sm text-muted-foreground">{copy}</p>
            </CardHeader>
            <CardContent>
              <Button className="w-full" variant={index === 1 ? "default" : "outline"}>
                Book {name}
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="mt-8 overflow-hidden rounded-lg border border-border bg-card">
        <table className="w-full min-w-[680px] text-sm">
          <thead className="bg-muted">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th key={header.id} className="px-4 py-3 text-left font-black">
                    {flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} className="border-t border-border">
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-4 py-3 text-muted-foreground">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
