"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Play, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const heroStats = [
  ["24/7", "service updates"],
  ["6", "clear service stages"],
  ["12k+", "vehicles supported"],
];

const sliderImages = [
  "/bg/hero-1.jpg",
  "/bg/hero-2.jpg",
  "/bg/hero-3.jpg",
  "/bg/hero-5.jpg",
  "/bg/pexels-shvetsa-4315570.jpg",
];

export default function Hero() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <section className="relative mt-20">
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

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button size="lg">
              Book Service
              <ArrowRight />
            </Button>
            <Button size="lg" variant="outline">
              <Play />
              Track My Car
            </Button>
          </div>

          <div className="mt-8 grid max-w-lg grid-cols-3 gap-4 border-t border-border pt-6">
            {heroStats.map(([value, label]) => (
              <div key={label}>
                <p className="text-2xl font-black">{value}</p>
                <p className="mt-1 text-xs font-medium text-muted-foreground">{label}</p>
              </div>
            ))}
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.96, y: 30 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.1 }}
          className="relative h-full overflow-hidden rounded-[2rem] border border-border bg-card shadow-2xl shadow-blue-950/10"
        >
          <div className="absolute inset-0 h-full w-full">
            {mounted ? <ImageSlider /> : <div className="h-full w-full" />}
          </div>
        </motion.div>
      </div>
    </section>
  );
}

function ImageSlider() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setIndex((current) => (current + 1) % sliderImages.length);
    }, 4000);

    return () => window.clearInterval(interval);
  }, []);

  return (
    <div className="relative h-full w-full">
      {sliderImages.map((src, slideIndex) => (
        <div
          key={src}
          className={`absolute inset-0 transition-opacity duration-1000 ${
            slideIndex === index ? "opacity-100" : "opacity-0"
          }`}
        >
          <Image
            src={src}
            alt={`Hero background ${slideIndex + 1}`}
            fill
            sizes="(max-width: 1024px) 100vw, 45vw"
            className="object-cover"
            priority={slideIndex === 0}
          />
          <div className="absolute inset-0 bg-slate-950/30" />
        </div>
      ))}

      <div className="absolute inset-x-0 bottom-4 mx-auto flex max-w-md items-center justify-between rounded-full bg-black/40 px-4 py-3 text-white backdrop-blur-sm">
        <p className="text-sm">Slide {index + 1} of {sliderImages.length}</p>
        <div className="flex gap-2">
          {sliderImages.map((_, dotIndex) => (
            <button
              key={dotIndex}
              type="button"
              onClick={() => setIndex(dotIndex)}
              className={`h-2.5 w-2.5 rounded-full transition ${
                dotIndex === index ? "bg-white" : "bg-white/40"
              }`}
              aria-label={`Show slide ${dotIndex + 1}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
