// client/components/headers/LandingHeader.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import HeaderLogo from "./HeaderLogo";

export default function LandingHeader() {
  const [isOpen, setIsOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);

  // Scroll-aware background
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 60);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Body scroll lock for mobile menu
  useEffect(() => {
    document.body.style.overflow = isOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  // Smooth scroll to booking section
  const scrollToBooking = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsOpen(false);
    document.getElementById("book")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  // Navigation items with active indicator
  const navItems = [
    { label: "Services", href: "/#features" },
    { label: "Workflow", href: "/#workflow" },
    { label: "Service Plans", href: "/#services" },
    { label: "Book Service", href: "/#book" },
  ];

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 w-full transition-all duration-300 ${
        isScrolled
          ? "backdrop-blur-md bg-primary/95 border-b border-white/10 shadow-sm"
          : "bg-primary shadow-none backdrop-blur-xl"
      }`}
    >
      <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <HeaderLogo />

        {/* Desktop Navigation */}
        <nav className="hidden items-center gap-7 text-sm font-medium lg:flex">
          {navItems.map((item) => (
            <a
              key={item.label}
              className="relative text-white/80 transition hover:text-white group"
              href={item.href}
            >
              {item.label}
              {/* Active link indicator - shows on hover */}
              <span className="absolute -bottom-1 left-0 h-0.5 w-0 bg-blue-400 transition-all group-hover:w-full" />
            </a>
          ))}
        </nav>

        {/* Desktop CTA Buttons */}
        <div className="flex items-center gap-2 text-white">
          <Button
            className="hidden sm:inline-flex bg-white/10 text-white border border-white/20 hover:bg-white/20"
            variant="default"
            asChild
          >
            <Link href="/login">Login</Link>
          </Button>
          <Button
            className="hidden sm:inline-flex bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold shadow-lg shadow-blue-900/25 transition-all duration-200 border-0"
            variant="default"
            onClick={scrollToBooking}
          >
            Book now
          </Button>
          <Button
            aria-label="Open menu"
            className="lg:hidden bg-white/10 text-white border border-white/20 hover:bg-white/20"
            size="icon"
            variant="outline"
            onClick={() => setIsOpen(true)}
          >
            <Menu />
          </Button>
        </div>
      </div>

      {/* Mobile Menu - Slide-in Drawer with Framer Motion */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 lg:hidden"
          >
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-background/80 backdrop-blur-sm"
              onClick={() => setIsOpen(false)}
            />

            {/* Drawer */}
            <motion.aside
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ 
                duration: 0.3, 
                ease: [0.21, 0.47, 0.32, 0.98] 
              }}
              className="fixed left-0 top-0 h-screen w-[min(18rem,90vw)] overflow-hidden bg-primary p-6 shadow-2xl"
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
                {navItems.map((item) => (
                  <Link
                    key={item.label}
                    href={item.href}
                    onClick={() => setIsOpen(false)}
                    className="block rounded-md px-2 py-3 hover:bg-white/10 hover:text-white transition-colors"
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>

              <div className="mt-8 flex flex-col gap-3">
                <Button
                  className="w-full justify-center bg-white/10 text-white border border-white/20 hover:bg-white/20"
                  variant="default"
                  asChild
                >
                  <Link href="/login" onClick={() => setIsOpen(false)}>
                    Login
                  </Link>
                </Button>
                <Button
                  className="w-full justify-center bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold shadow-lg shadow-blue-900/25 transition-all duration-200 border-0"
                  variant="default"
                  onClick={scrollToBooking}
                >
                  Book now
                </Button>
              </div>
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}