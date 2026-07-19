"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HeaderLogo } from "./HeaderLogo";

export default function Header() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    document.body.style.overflow = isOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  return (
    <header className="fixed top-0 left-0 right-0 z-50 w-full bg-primary shadow-none backdrop-blur-xl transition-all duration-300">
      <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <HeaderLogo />
        <nav className="hidden items-center gap-7 text-sm font-medium text-white/80 lg:flex">
          <a className="transition hover:text-white" href="/#features">Services</a>
          <a className="transition hover:text-white" href="/#workflow">Workflow</a>
          <a className="transition hover:text-white" href="/#services">Service Plans</a>
          <a className="transition hover:text-white" href="/#book">Book Service</a>
        </nav>
        <div className="flex items-center gap-2 text-white">
          <Button className="hidden sm:inline-flex bg-white/10 text-white border border-white/20 hover:bg-white/20" variant="default">
            <Link href="/#book">Book now</Link>
          </Button>
          <Button
            aria-label="Open menu"
            className="lg:hidden text-white border-white/20 hover:bg-white/10"
            size="icon"
            variant="outline"
            onClick={() => setIsOpen(true)}
          >
            <Menu />
          </Button>
        </div>
      </div>

      <div
        className={`fixed inset-0 z-50 lg:hidden transition-opacity duration-300 ${
          isOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
        }`}
      >
        <div
          className="absolute inset-0 bg-background/80 backdrop-blur-sm"
          onClick={() => setIsOpen(false)}
        />
        <aside
          className={`fixed left-0 top-0 h-screen w-[min(18rem,90vw)] overflow-hidden bg-primary p-6 shadow-2xl transition-transform duration-300 ${
            isOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="mb-8 flex items-center justify-between">
            <HeaderLogo />
            <Button
              aria-label="Close menu"
              size="icon"
              variant="ghost"
              className="text-white hover:bg-white/10"
              onClick={() => setIsOpen(false)}
            >
              <X />
            </Button>
          </div>

          <nav className="flex flex-col gap-4 text-base font-medium text-white/80">
            <Link href="/#features" onClick={() => setIsOpen(false)} className="block rounded-md px-2 py-3 hover:bg-white/10 hover:text-white">
              Services
            </Link>
            <Link href="/#workflow" onClick={() => setIsOpen(false)} className="block rounded-md px-2 py-3 hover:bg-white/10 hover:text-white">
              Workflow
            </Link>
            <Link href="/#services" onClick={() => setIsOpen(false)} className="block rounded-md px-2 py-3 hover:bg-white/10 hover:text-white">
              Service Plans
            </Link>
            <Link href="/#book" onClick={() => setIsOpen(false)} className="block rounded-md px-2 py-3 hover:bg-white/10 hover:text-white">
              Book Service
            </Link>
          </nav>

          <div className="mt-8 flex flex-col gap-3">
            <Button className="w-full justify-center bg-white text-primary hover:bg-white/90" variant="default">
              <Link href="/#book" onClick={() => setIsOpen(false)}>
                Book now
              </Link>
            </Button>
          </div>
        </aside>
      </div>
    </header>
  );
}
