"use client";

import { motion } from "framer-motion";
import { ReactNode } from "react";

interface FadeInSectionProps {
  children: ReactNode;
  delay?: number;
  className?: string;
}

export function FadeInSection({ 
  children, 
  delay = 0, 
  className = "" 
}: FadeInSectionProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ 
        duration: 0.65, 
        ease: [0.21, 0.47, 0.32, 0.98], 
        delay 
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}