"use client";

import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CalendarDays,
  CheckCircle,
  Search,
  ThumbsUp,
  Wrench,
  Truck,
} from "lucide-react";
import { workflow } from "../constants/landing.data";

const stepMeta = [
  {
    title: "Book",
    icon: CalendarDays,
    copy: "Select a date and service for your vehicle.",
  },
  { title: "Check In", icon: CheckCircle, copy: "Arrive and hand over your vehicle at the desk." },
  { title: "Inspect", icon: Search, copy: "Technicians run a clear inspection and estimate." },
  { title: "Approve", icon: ThumbsUp, copy: "Review and approve recommended repairs." },
  { title: "Repair", icon: Wrench, copy: "Technicians perform repairs with quality parts." },
  { title: "Pick Up", icon: Truck, copy: "Get notified when your vehicle is ready for pickup." },
];

const cardVariants = {
  hidden: { opacity: 0, y: 12 },
  enter: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.06, duration: 0.45 } }),
  hover: { scale: 1.03, boxShadow: "0 8px 24px rgba(2,6,23,0.12)" },
};

export default function Workflow() {
  return (
    <section id="workflow" className="mx-auto max-w-7xl px-4 py-24 sm:px-6 lg:px-8">
      <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
        <div className="max-w-2xl">
          <Badge tone="amber">How it works</Badge>
          <h2 className="mt-4 text-3xl font-black sm:text-5xl">A clear service path for every car owner.</h2>
        </div>
        <a href="/#book" className="lg:ml-6">
          <Button variant="outline">
            Book your service
          </Button>
        </a>
      </div>

      <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {stepMeta.map((s, i) => {
          const Icon = s.icon;
          return (
            <motion.div
              key={s.title}
              className="rounded-lg bg-card p-6"
              variants={cardVariants}
              initial="hidden"
              animate="enter"
              whileHover="hover"
              custom={i}
            >
              <div className="flex items-start gap-4">
                <div className="rounded-lg bg-primary/10 p-3 text-primary">
                  <Icon className="size-6" />
                </div>
                <div>
                  <p className="text-sm font-bold text-primary">{`0${i + 1}`}</p>
                  <h3 className="mt-2 text-xl font-black">{s.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{s.copy}</p>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}
