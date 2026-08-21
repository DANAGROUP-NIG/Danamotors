"use client";

import { useEffect, useState } from "react";
import { HERO_STATS } from "@/constant";

interface StatItem {
  value: string;
  label: string;
}

interface HeroStatsProps {
  stats?: StatItem[];
}

// Count-up hook
function useCountUp(target: number, duration = 1500) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let start = 0;
    const step = target / (duration / 16);
    const timer = setInterval(() => {
      start += step;
      if (start >= target) {
        setCount(target);
        clearInterval(timer);
      } else {
        setCount(Math.floor(start));
      }
    }, 16);
    return () => clearInterval(timer);
  }, [target, duration]);
  return count;
}

function parseStatValue(value: string): number {
  // Special case for "24/7"
  if (value === "24/7") return 24;
  
  const clean = value.replace(/[^0-9kK+.]/g, "");
  if (clean.includes("k") || clean.includes("K")) {
    const num = parseFloat(clean.replace(/[kK+]/g, ""));
    return num * 1000;
  }
  return parseInt(clean) || 0;
}


function getStatSuffix(value: string): string {
  // Special case for "24/7"
  if (value === "24/7") return "/7";
  
  if (value.includes("%")) return "%";
  if (value.includes("+")) return "+";
  return "";
}

export function HeroStats({ stats = HERO_STATS }: HeroStatsProps) {
  return (
    <div className="mt-12 grid max-w-lg grid-cols-3 gap-4 border-t border-border/50 pt-8">
      
      {stats.map((stat) => {
        // Parse numeric value from string
        const numericValue = parseStatValue(stat.value);
        const suffix = getStatSuffix(stat.value);
        const count = useCountUp(numericValue);

        return (
          <div key={stat.label}>
            <p className="text-2xl font-bold text-foreground sm:text-3xl">
              {count.toLocaleString()}
              {suffix}
            </p>
            <p className="mt-1 text-sm font-medium text-muted-foreground">
              {stat.label}
            </p>
          </div>
        );
      })}
    </div>
  );
}

