"use client";

import { cn } from "@/lib/utils";
import { useState, useRef } from "react";

export default function NavTootip({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={ref}
      className="relative"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      {children}
      {visible && (
        <div
          role="tooltip"
          className={cn(
            "pointer-events-none absolute left-full top-1/2 z-50 -translate-y-1/2 ml-3",
            "whitespace-nowrap rounded-md bg-[#0d2a3d] px-2.5 py-1.5",
            "text-xs font-medium text-white shadow-lg",
            // small left arrow
            "before:absolute before:-left-1.5 before:top-1/2 before:-translate-y-1/2",
            "before:border-4 before:border-transparent before:border-r-[#0d2a3d]",
          )}
        >
          {label}
        </div>
      )}
    </div>
  );
}

function NavTooltip({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  const [visible, setVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
}
