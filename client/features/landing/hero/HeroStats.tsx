"use client";

import { HERO_STATS } from "@/constant";

interface StatItem {
  value: string;
  label: string;
}

interface HeroStatsProps {
  stats?: StatItem[];
}

export function HeroStats({ stats = HERO_STATS }: HeroStatsProps) {
  return (
    <div className="mt-8 grid max-w-lg grid-cols-3 gap-4 border-t border-border pt-6">
      {stats.map((stat) => (
        <div key={stat.label}>
          <p className="text-2xl font-black">{stat.value}</p>
          <p className="mt-1 text-xs font-medium text-muted-foreground">
            {stat.label}
          </p>
        </div>
      ))}
    </div>
  );
}
