"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { HeroActions } from "./HeroActions";
import { HeroStats } from "./HeroStats";
import { HeroImageSlider } from "./HeroImageSlider";

export default function Hero() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <section className="relative">
      <div className="mx-auto grid h-[calc(100vh-5rem)] max-w-7xl items-center gap-12 px-4 sm:px-6 lg:grid-cols-[0.86fr_1.14fr] lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7 }}
          className="max-w-2xl"
        >
          <Badge tone="blue">
            <Sparkles className="size-3.5" />
            Car service platform
          </Badge>

          <h1 className="mt-6 text-5xl font-black leading-[1.02] text-foreground lg:text-6xl">
            Dana Motors
          </h1>

          <p className="font-bold text-2xl">Workshop service</p>

          <p className="mt-5 max-w-xl text-lg leading-8 text-muted-foreground">
            Book trusted car service, track your repair progress, approve estimates,
            and know exactly when your vehicle is ready for pickup. Dana Group handles
            the service operations behind the scenes.
          </p>

          <HeroActions />

          <HeroStats />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 30 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.1 }}
          className="relative h-full overflow-hidden rounded-[2rem] border border-border bg-card shadow-2xl shadow-blue-950/10"
        >
          <div className="absolute inset-0 h-full w-full">
            {mounted ? <HeroImageSlider /> : <div className="h-full w-full" />}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
