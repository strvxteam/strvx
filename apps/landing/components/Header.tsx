"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence, useMotionValue, useTransform, useSpring } from "framer-motion";

const regions = [
  { label: "USA", href: "/" },
  { label: "Government", href: "/government" },
  { label: "Southeast Asia", href: "/sea" },
];

const navLinks = [
  { label: "Services", href: "/services" },
  { label: "Process", href: "/process" },
];

const springConfig = { stiffness: 200, damping: 30, mass: 0.8 };
const pillSpring = { type: "spring" as const, stiffness: 350, damping: 30 };

export default function Header() {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const scrollY = useMotionValue(0);
  const progress = useTransform(scrollY, [0, 120], [0, 1]);
  const smoothProgress = useSpring(progress, springConfig);

  const borderRadius = useTransform(smoothProgress, [0, 1], [20, 50]);
  const paddingX = useTransform(smoothProgress, [0, 1], [28, 16]);
  const paddingY = useTransform(smoothProgress, [0, 1], [14, 8]);
  const width = useTransform(smoothProgress, [0, 1], ["min(92vw, 1100px)", "min(88vw, 780px)"]);
  const top = useTransform(smoothProgress, [0, 1], [16, 12]);

  useEffect(() => {
    const onScroll = () => scrollY.set(window.scrollY);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [scrollY]);

  function isActiveRegion(href: string) {
    if (href === "/") {
      return pathname === "/" || pathname === "/services" || pathname === "/process" || pathname === "/book";
    }
    return pathname.startsWith(href);
  }

  // Measured pill position
  const regionRefs = useRef<(HTMLAnchorElement | null)[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const [pillRect, setPillRect] = useState<{ left: number; width: number } | null>(null);
  const [hasAnimated, setHasAnimated] = useState(false);

  const measure = useCallback(() => {
    const activeIdx = regions.findIndex(r => isActiveRegion(r.href));
    const el = regionRefs.current[activeIdx];
    const container = containerRef.current;
    if (el && container) {
      const elRect = el.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      setPillRect({
        left: elRect.left - containerRect.left,
        width: elRect.width,
      });
    }
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    measure();
    // Enable animation after first measurement
    const t = requestAnimationFrame(() => setHasAnimated(true));
    return () => cancelAnimationFrame(t);
  }, [measure]);

  // Re-measure on resize
  useEffect(() => {
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure]);

  return (
    <motion.header
      className="fixed left-1/2 z-[60]"
      style={{ top, width, x: "-50%" }}
    >
      <motion.div
        className="relative flex items-center justify-between gap-3 md:gap-5 overflow-hidden"
        style={{
          borderRadius,
          paddingLeft: paddingX,
          paddingRight: paddingX,
          paddingTop: paddingY,
          paddingBottom: paddingY,
          background: "linear-gradient(135deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.02) 50%, rgba(255,255,255,0.05) 100%)",
          backdropFilter: "blur(24px) saturate(1.4)",
          WebkitBackdropFilter: "blur(24px) saturate(1.4)",
          border: "1px solid rgba(255,255,255,0.12)",
          boxShadow: "0 8px 32px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.1), inset 0 -1px 0 rgba(255,255,255,0.02)",
        }}
      >
        {/* Left: Region selector with sliding pill */}
        <div ref={containerRef} className="hidden md:flex items-center gap-1 relative">
          {/* Sliding pill background */}
          {pillRect && (
            <motion.div
              className="absolute top-0 bottom-0 rounded-full bg-white/[0.1]"
              initial={false}
              animate={{ left: pillRect.left, width: pillRect.width }}
              transition={hasAnimated ? pillSpring : { duration: 0 }}
            />
          )}
          {regions.map(({ label, href }, i) => (
            <Link
              key={href}
              ref={(el) => { regionRefs.current[i] = el; }}
              href={href}
              className={`relative z-10 text-sm tracking-wide px-3 py-1 rounded-full transition-colors duration-300 ease-out whitespace-nowrap ${
                isActiveRegion(href)
                  ? "text-white"
                  : "text-[#aaa] hover:text-white"
              }`}
            >
              {label}
            </Link>
          ))}
        </div>

        {/* Center: Logo */}
        <Link
          href="/"
          className="text-sm font-bold tracking-[0.12em] uppercase text-white/90 shrink-0"
        >
          strvx
        </Link>

        {/* Right: Nav links — always visible */}
        <div className="hidden md:flex items-center gap-6">
          {navLinks.map(({ label, href }) => (
            <Link
              key={href}
              href={href}
              className="text-sm text-[#aaa] tracking-wide hover:text-white transition-colors duration-300 ease-out whitespace-nowrap"
            >
              {label}
            </Link>
          ))}
          <Link
            href="/book"
            className="text-[11px] tracking-[0.06em] uppercase px-4 py-1.5 rounded-full bg-white text-[#0a0a0a] font-semibold hover:bg-white/90 transition-all duration-300 ease-out whitespace-nowrap"
          >
            Book a call
          </Link>
        </div>

        {/* Mobile: hamburger */}
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="md:hidden text-white shrink-0"
          aria-label="Toggle menu"
        >
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
            <path
              d={mobileMenuOpen ? "M5 5l10 10M15 5L5 15" : "M3 6h14M3 10h14M3 14h14"}
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              className="transition-all duration-300"
            />
          </svg>
        </button>
      </motion.div>

      {/* Mobile dropdown */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0, scale: 0.98 }}
            animate={{ height: "auto", opacity: 1, scale: 1 }}
            exit={{ height: 0, opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
            className="overflow-hidden mt-2 rounded-2xl"
            style={{
              background: "linear-gradient(135deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.02) 50%, rgba(255,255,255,0.05) 100%)",
              backdropFilter: "blur(24px) saturate(1.4)",
              WebkitBackdropFilter: "blur(24px) saturate(1.4)",
              border: "1px solid rgba(255,255,255,0.12)",
              boxShadow: "0 8px 32px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.1)",
            }}
          >
            <div className="flex flex-col gap-2 p-4">
              {/* Region links */}
              <div className="flex gap-2 pb-3 border-b border-white/[0.06]">
                {regions.map(({ label, href }) => (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`text-[10px] tracking-[0.08em] uppercase px-3 py-1.5 rounded-full transition-all duration-300 ${
                      isActiveRegion(href)
                        ? "text-white bg-white/[0.1]"
                        : "text-[#555]"
                    }`}
                  >
                    {label}
                  </Link>
                ))}
              </div>

              {/* Nav links — always shown */}
              {navLinks.map(({ label, href }) => (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setMobileMenuOpen(false)}
                  className="text-sm text-[#888] hover:text-white transition-colors duration-300 py-1"
                >
                  {label}
                </Link>
              ))}
              <Link
                href="/book"
                onClick={() => setMobileMenuOpen(false)}
                className="text-[11px] tracking-[0.06em] uppercase px-5 py-2.5 rounded-full bg-white text-[#0a0a0a] font-semibold text-center mt-1"
              >
                Book a call
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.header>
  );
}
