"use client";

import { ArrowRight, Play } from "lucide-react";
import { Button } from "@/components/ui/button";

interface HeroActionsProps {
  onBookClick?: () => void;
  onTrackClick?: () => void;
}

export function HeroActions({ onBookClick, onTrackClick }: HeroActionsProps) {
  return (
    <div className="mt-8 flex flex-col gap-3 sm:flex-row">
      <Button size="lg" onClick={onBookClick}>
        Book Service
        <ArrowRight />
      </Button>
      <Button size="lg" variant="outline" onClick={onTrackClick}>
        <Play />
        Track My Car
      </Button>
    </div>
  );
}
