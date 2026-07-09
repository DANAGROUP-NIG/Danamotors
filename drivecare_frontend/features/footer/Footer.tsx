import { Gauge, Github, Linkedin, Mail, MapPin, Twitter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HeaderLogo } from "../header/HeaderLogo";

const footerGroups = [
  {
    title: "DriveCare",
    links: [
      ["Services", "#features"],
      ["How It Works", "#workflow"],
      ["Service Options", "#services"],
      ["Book Service", "#book"],
    ],
  },
  {
    title: "For Drivers",
    links: [
      ["Routine Service", "#services"],
      ["Diagnostics", "#services"],
      ["Repairs", "#services"],
      ["Service Tracking", "#features"],
    ],
  },
  {
    title: "Company",
    links: [
      ["About", "#"],
      ["Contact", "#book"],
      ["Privacy", "#"],
      ["Terms", "#"],
    ],
  },
];

export default function Footer() {
  return (
    <footer className="border-t border-border bg-[#071225] text-white">
      <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="max-w-md">
            
            <HeaderLogo />

            <p className="mt-5 text-sm leading-7 text-slate-300">
              Dana Group&apos;s car service platform for everyday drivers who want
              trusted inspections, transparent repair updates, service approvals,
              and a smoother pickup experience.
            </p>
            <div className="mt-6 grid gap-3 text-sm text-slate-300">
              <a className="flex items-center gap-3 transition hover:text-white" href="mailto:hello@drivecare.ng">
                <Mail className="size-4 text-blue-300" />
                hello@drivecare.ng
              </a>
              <div className="flex items-center gap-3">
                <MapPin className="size-4 text-blue-300" />
                Lagos, Nigeria
              </div>
            </div>
          </div>

          <div className="grid gap-8 sm:grid-cols-3">
            {footerGroups.map((group) => (
              <div key={group.title}>
                <p className="text-sm font-black text-white">{group.title}</p>
                <div className="mt-4 grid gap-3">
                  {group.links.map(([label, href]) => (
                    <a
                      className="text-sm text-slate-400 transition hover:text-white"
                      href={href}
                      key={label}
                    >
                      {label}
                    </a>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-12 rounded-lg border border-white/10 bg-white/[0.05] p-5">
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-lg font-black">Ready to service your car with Dana?</p>
              <p className="mt-1 text-sm text-slate-400">
                Book a visit and let Dana Group manage the inspection, repair flow, and pickup updates.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button asChild variant="secondary">
                <a href="#book">Book Service</a>
              </Button>
              <Button asChild className="border-white/20 bg-transparent text-white hover:bg-white/10" variant="outline">
                <a href="#services">View Services</a>
              </Button>
            </div>
          </div>
        </div>

        <div className="mt-8 flex flex-col gap-5 border-t border-white/10 pt-8 text-sm text-slate-400 sm:flex-row sm:items-center sm:justify-between">
          <p>(c) 2026 DANA DriveCare. All rights reserved.</p>
          <div className="flex items-center gap-2">
            {[
              ["LinkedIn", Linkedin],
              ["Twitter", Twitter],
              ["GitHub", Github],
            ].map(([label, Icon]) => (
              <a
                aria-label={label as string}
                className="grid size-10 place-items-center rounded-md border border-white/10 text-slate-300 transition hover:border-blue-300/50 hover:bg-white/10 hover:text-white"
                href="#"
                key={label as string}
              >
                <Icon className="size-4" />
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
