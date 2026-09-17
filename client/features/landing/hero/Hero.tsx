// client/features/landing/hero/Hero.tsx
"use client";

import { motion } from "framer-motion";
import dynamic from "next/dynamic";
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

// Animation variants for staggered children
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1, // 100ms delay between each child
      delayChildren: 0.1,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.6,
      ease: [0.21, 0.47, 0.32, 0.98] as const,
    },
  },
};

// Animation for image
const imageVariants = {
  hidden: { opacity: 0, scale: 0.96, y: 30 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: {
      duration: 0.8,
      delay: 0.2,
      ease: [0.21, 0.47, 0.32, 0.98] as const,
    },
  },
};

export default function Hero() {
  return (
    <section 
      className="relative overflow-hidden py-12" 
      aria-label="Hero section"
    >
      {/* Background decoration - radial gradient blob */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background: 'radial-gradient(ellipse 80% 60% at 20% 40%, rgba(99,102,241,0.12), transparent)',
        }}
      />

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid min-h-[400px] items-center gap-12 py-8 lg:grid-cols-[0.86fr_1.14fr]">
          
          {/* Text Content with staggered animations */}
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="max-w-2xl"
          >
           {/* Headline with gradient text on "Dana Motors Limited" */}
            <motion.h1 variants={itemVariants} className="mt-6 text-5xl font-black leading-[1.02] text-foreground tracking-tight lg:text-6xl">
              Expert Care for{" "}
              <span className="">
                Dana Motors Limited
              </span>
            </motion.h1>
            
            {/* Subtitle */}
            <motion.h2 variants={itemVariants} className="mt-2 text-2xl font-bold text-gray-700">
              Workshop Service
            </motion.h2>

            {/* Body text - larger with more spacing */}
            <motion.p variants={itemVariants} className="mt-5 max-w-xl text-[1.125rem] leading-[1.75] text-muted-foreground">
              Book your vehicle in with confidence, track every stage of the repair, review and approve service estimates, and receive timely updates right through to completion.
            </motion.p>

            <motion.p variants={itemVariants} className="mt-5 max-w-xl text-[1.125rem] leading-[1.75] text-muted-foreground">
              From routine maintenance to complex repairs, Dana Motors Limited manages the service operation with the expertise, standards, and accountability your vehicle deserves.
            </motion.p>

            {/* CTA Buttons */}
            <motion.div variants={itemVariants}>
              <HeroActions />
            </motion.div>

            {/* Stats */}
            <motion.div variants={itemVariants}>
              <HeroStats />
            </motion.div>
          </motion.div>

          {/* Image Slider with animation */}
          <motion.div
            variants={imageVariants}
            initial="hidden"
            animate="visible"
            className="relative h-full min-h-[400px] w-full overflow-hidden rounded-[2rem] border border-border bg-card shadow-2xl shadow-blue-950/10 lg:min-h-[500px]"
            role="img"
            aria-label="Car service showcase"
          >
            <HeroImageSlider />
          </motion.div>
        </div>
      </div>
    </section>
  );
}