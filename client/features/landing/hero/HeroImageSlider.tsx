"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { HERO_SLIDER_IMAGES } from "@/constant";

interface HeroImageSliderProps {
  images?: string[];
  autoSlideInterval?: number;
}

export function HeroImageSlider({
  images = HERO_SLIDER_IMAGES,
  autoSlideInterval = 4000,
}: HeroImageSliderProps) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setIndex((current) => (current + 1) % images.length);
    }, autoSlideInterval);

    return () => window.clearInterval(interval);
  }, [images.length, autoSlideInterval]);

  return (
    <div className="relative h-full w-full">
      {images.map((src, slideIndex) => (
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
        <p className="text-sm">
          Slide {index + 1} of {images.length}
        </p>
        <div className="flex gap-2">
          {images.map((_, dotIndex) => (
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
