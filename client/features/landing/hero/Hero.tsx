"use client";

import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import dynamic from "next/dynamic";
import { Badge } from "@/components/ui/badge";
import { HeroActions } from "./HeroActions";
import { HeroStats } from "./HeroStats";


// Lazy load the slider to prevent hydration issues
const HeroImageSlider = dynamic(
  () => import("./HeroImageSlider").then((mod) => mod.HeroImageSlider),
  {
    ssr: false,
    loading: () => (
      <div className="h-full w-full animate-pulse bg-muted/20" />
    ),
  }
);

// Animation constants
const ANIMATION = {
  text: {
    initial: { opacity: 0, y: 24 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.7, ease: "easeOut" },
  },
  image: {
    initial: { opacity: 0, scale: 0.96, y: 30 },
    animate: { opacity: 1, scale: 1, y: 0 },
    transition: { duration: 0.8, delay: 0.1, ease: "easeOut" },
  },
} as const;

export default function Hero() {
  

  return (
<section 
  className="relative py-12"  // Use padding instead of min-height
  aria-label="Hero section"
>
      <div className="mx-auto grid h-full max-w-7xl items-center gap-12 px-4 py-8 sm:px-6 lg:grid-cols-[0.86fr_1.14fr] lg:px-8">
        {/* Text Content */}
        <motion.div
          initial={ANIMATION.text.initial}
          animate={ANIMATION.text.animate}
          transition={ANIMATION.text.transition}
          className="max-w-2xl"
        >
          <Badge 
            tone="blue" 
            className="inline-flex items-center gap-2"
            aria-label="Service type"
          >
            <Sparkles className="size-3.5" aria-hidden="true" />
            Car service platform
          </Badge>

          <h1 className="mt-6 text-5xl font-black leading-[1.02] text-foreground lg:text-6xl">
            Dana Motors
          </h1>
          
          <h2 className="mt-2 text-2xl font-bold text-foreground/90">
            Workshop service
          </h2>

          <p className="mt-5 max-w-xl text-lg leading-8 text-muted-foreground">
            Book trusted car service, track your repair progress, approve estimates,
            and know exactly when your vehicle is ready for pickup. Dana Group handles
            the service operations behind the scenes.
          </p>

          <HeroActions />
          <HeroStats />
        </motion.div>

        {/* Image Slider */}
        <motion.div
          initial={ANIMATION.image.initial}
          animate={ANIMATION.image.animate}
          transition={ANIMATION.image.transition}
          className="relative h-full min-h-[400px] w-full overflow-hidden rounded-[2rem] border border-border bg-card shadow-2xl shadow-blue-950/10 lg:min-h-[500px]"
          role="img"
          aria-label="Car service showcase"
        >
          <HeroImageSlider />
        </motion.div>
      </div>
    </section>
  );
}