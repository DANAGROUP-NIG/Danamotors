"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import Link from "next/link";
import { Menu, Moon, Sun, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HeaderLogo } from "./HeaderLogo";

export default function Header() {
  const [isOpen, setIsOpen] = useState(false);
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    document.body.style.overflow = isOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  return (
    <header className="fixed top-0 left-0 right-0 z-50 w-full bg-black/20 shadow-none backdrop-blur-xl transition-all duration-300">
      <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <HeaderLogo />
        <nav className="hidden items-center gap-7 text-sm font-medium text-white lg:flex">
          <a className="transition hover:text-slate-100" href="/#features">Services</a>
          <a className="transition hover:text-slate-100" href="/#workflow">Workflow</a>
          <a className="transition hover:text-slate-100" href="/#services">Service Plans</a>
          <a className="transition hover:text-slate-100" href="/#book">Book Service</a>
        </nav>
        <div className="flex items-center gap-2 text-white">
          <Button
            aria-label="Toggle theme"
            size="icon"
            variant="ghost"
            className="text-white"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          >
            <Sun className="size-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
            <Moon className="absolute size-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
          </Button>
          <Button className="hidden sm:inline-flex bg-white text-slate-950" variant="default">
            <Link href="/#book">Book now</Link>
          </Button>
          <Button
            aria-label="Open menu"
            className="lg:hidden"
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
          className={`fixed left-0 top-0 h-screen w-[min(18rem,90vw)] overflow-hidden bg-card p-6 shadow-2xl transition-transform duration-300 ${
            isOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <div className="mb-8 flex items-center justify-between">
            <HeaderLogo />
            <Button
              aria-label="Close menu"
              size="icon"
              variant="ghost"
              onClick={() => setIsOpen(false)}
            >
              <X />
            </Button>
          </div>

          <nav className="flex flex-col gap-4 text-base font-medium text-foreground">
            <Link href="/#features" onClick={() => setIsOpen(false)} className="block rounded-md px-2 py-3 hover:bg-muted">
              Services
            </Link>
            <Link href="/#workflow" onClick={() => setIsOpen(false)} className="block rounded-md px-2 py-3 hover:bg-muted">
              Workflow
            </Link>
            <Link href="/#services" onClick={() => setIsOpen(false)} className="block rounded-md px-2 py-3 hover:bg-muted">
              Service Plans
            </Link>
            <Link href="/#book" onClick={() => setIsOpen(false)} className="block rounded-md px-2 py-3 hover:bg-muted">
              Book Service
            </Link>
          </nav>

          <div className="mt-8 flex flex-col gap-3">
            <Button className="w-full justify-center" variant="default">
              <Link href="/#book" onClick={() => setIsOpen(false)} className="text-white">
                Book now
              </Link>
            </Button>
          </div>
        </aside>
      </div>
    </header>
  );
}
