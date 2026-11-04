"use client";

import dynamic from "next/dynamic";

/** Loads the chart (and recharts) only on a monthly information report page, in the browser. */
export const MonthlyTrend = dynamic(() => import("./MonthlyTrendChart"), { ssr: false });
