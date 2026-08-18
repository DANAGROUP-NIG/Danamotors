"use client";

import Link from "next/link";
import { ArrowRight, Play } from "lucide-react";
import { Button } from "@/components/ui/button";

interface HeroActionsProps {
  onBookClick?: () => void;
  onTrackClick?: () => void;
}

export function HeroActions({ onBookClick, onTrackClick }: HeroActionsProps) {
  // Smooth scroll to booking section
  function scrollToBooking(e: React.MouseEvent) {
    e.preventDefault();
    document.getElementById("book")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
    if (onBookClick) onBookClick();
  }

  return (
    <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:gap-4">
      {/* Primary CTA - Gradient with shadow */}
      {onBookClick ? (
        <Button 
          size="lg" 
          onClick={scrollToBooking}
          className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold shadow-lg shadow-blue-900/25 transition-all duration-200"
        >
          Book Service
          <ArrowRight className="ml-2 size-4" />
        </Button>
      ) : (
        <Button 
          size="lg" 
          asChild
          className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold shadow-lg shadow-blue-900/25 transition-all duration-200"
        >
          <Link href="/#book" onClick={scrollToBooking}>
            Book Service
            <ArrowRight className="ml-2 size-4" />
          </Link>
        </Button>
      )}

      {/* Secondary CTA - Ghost with animated border */}
      {onTrackClick ? (
        <Button 
          size="lg" 
          variant="outline" 
          onClick={onTrackClick}
          className="border-border/60 hover:border-border transition-all duration-200 relative overflow-hidden group"
        >
          <span className="relative z-10 flex items-center">
            <Play className="mr-2 size-4" />
            Track My Car
          </span>
          {/* Animated border glow effect */}
          <span className="absolute inset-0 rounded-md bg-gradient-to-r from-blue-500/10 to-indigo-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
        </Button>
      ) : (
        <Button 
          size="lg" 
          variant="outline" 
          asChild
          className="border-border/60 hover:border-border transition-all duration-200 relative overflow-hidden group"
        >
          <Link href="/login">
            <span className="relative z-10 flex items-center">
              <Play className="mr-2 size-4" />
              Track My Car
            </span>
            {/* Animated border glow effect */}
            <span className="absolute inset-0 rounded-md bg-gradient-to-r from-blue-500/10 to-indigo-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
          </Link>
        </Button>
      )}
    </div>
  );
}