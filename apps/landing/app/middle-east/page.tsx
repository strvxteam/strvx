"use client";

import { useRef } from "react";
import {
  motion,
  useScroll,
  useTransform,
  useSpring,
  useInView,
} from "framer-motion";

/* ------------------------------------------------------------------ */
/*  Spring config                                                     */
/* ------------------------------------------------------------------ */
const smooth = { stiffness: 80, damping: 30, mass: 0.5 };

/* ------------------------------------------------------------------ */
/*  Animated text reveals                                             */
/* ------------------------------------------------------------------ */

function RevealText({
  children,
  className = "",
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-15%" });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 30, filter: "blur(10px)" }}
      animate={
        isInView
          ? { opacity: 1, y: 0, filter: "blur(0px)" }
          : { opacity: 0, y: 30, filter: "blur(10px)" }
      }
      transition={{
        duration: 0.9,
        delay,
        ease: [0.25, 0.1, 0.25, 1],
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  SVG Map of the Middle East — full width                           */
/* ------------------------------------------------------------------ */

function MiddleEastMap({ className = "" }: { className?: string }) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-10%" });

  // Cities laid out by approximate Mercator-projected geography
  // (longitude/latitude → viewBox 60..860 × 30..690).
  // All cities share the same visual style.
  const CITY_R = 5;
  const CITY_OPACITY = 0.85;
  const cities: {
    name: string;
    x: number;
    y: number;
    delay: number;
    labelDx?: number;
    labelDy?: number;
  }[] = [
    { name: "DUBAI", x: 720, y: 336, delay: 0.4 },
    { name: "RIYADH", x: 519, y: 349, delay: 0.5 },
    { name: "DOHA", x: 631, y: 333, delay: 0.6 },
    { name: "ABU DHABI", x: 698, y: 354, delay: 0.7, labelDy: 38 },
    { name: "AMMAN", x: 268, y: 160, delay: 0.8 },
    { name: "KUWAIT", x: 549, y: 226, delay: 0.9 },
    { name: "BEIRUT", x: 258, y: 109, delay: 1.0 },
    { name: "DAMASCUS", x: 277, y: 119, delay: 1.1, labelDx: 55 },
  ];

  // Fully-connected mesh — every city to every other city.
  const connections: [number, number][] = [];
  for (let i = 0; i < cities.length; i++) {
    for (let j = i + 1; j < cities.length; j++) {
      connections.push([i, j]);
    }
  }

  const oceanFill = "#060d18";
  const landFill = "#0a2a1a";
  const landStroke = "#1a4a30";

  // Middle East landmass — Arabian Peninsula + Levant + Iraq, clockwise from Beirut.
  // Coastline shaped so all 8 city dots sit cleanly inland of the boundary.
  const landmassPath = "M 247,109 L 282,88 L 340,41 L 410,28 L 480,28 L 526,54 L 540,160 L 560,212 L 550,234 L 580,275 L 605,318 L 608,305 L 638,312 L 638,350 L 650,358 L 700,360 L 720,320 L 745,358 L 783,419 L 818,419 L 783,471 L 690,549 L 643,549 L 573,614 L 444,657 L 421,549 L 340,510 L 317,393 L 293,289 L 240,237 L 247,184 Z";

  return (
    <div ref={ref} className={className}>
      <svg viewBox="60 30 800 660" className="w-full h-full">
        <defs>
          <radialGradient id="city-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#60a5fa" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#60a5fa" stopOpacity="0" />
          </radialGradient>
<radialGradient id="map-vignette" cx="50%" cy="50%" r="55%">
            <stop offset="0%" stopColor="transparent" stopOpacity="0" />
            <stop offset="70%" stopColor="transparent" stopOpacity="0" />
            <stop offset="100%" stopColor="#050505" stopOpacity="0.9" />
          </radialGradient>
          <filter id="soft-glow">
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="land-glow">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Ocean background */}
        <rect x="60" y="30" width="800" height="660" fill={oceanFill} rx="8" />

        {/* Subtle grid — latitude/longitude lines */}
        {Array.from({ length: 16 }).map((_, i) => (
          <line
            key={`grid-v-${i}`}
            x1={120 + i * 46}
            y1={30}
            x2={120 + i * 46}
            y2={690}
            stroke="#1a3050"
            strokeWidth="0.3"
            opacity="0.25"
          />
        ))}
        {Array.from({ length: 14 }).map((_, i) => (
          <line
            key={`grid-h-${i}`}
            x1={60}
            y1={80 + i * 46}
            x2={860}
            y2={80 + i * 46}
            stroke="#1a3050"
            strokeWidth="0.3"
            opacity="0.25"
          />
        ))}

        {/* Middle East landmass */}
        <motion.path
          d={landmassPath}
          fill={landFill}
          stroke={landStroke}
          strokeWidth="0.8"
          filter="url(#land-glow)"
          initial={{ opacity: 0 }}
          animate={isInView ? { opacity: 1 } : { opacity: 0 }}
          transition={{ duration: 1.5, delay: 0.15 }}
        />

        {/* Vignette overlay */}
        <rect x="60" y="30" width="800" height="660" fill="url(#map-vignette)" rx="8" />

        {/* Connection lines — flight routes (draw stroke-by-stroke) */}
        {connections.map(([a, b], i) => (
          <motion.path
            key={`line-${i}`}
            d={`M ${cities[a].x},${cities[a].y} L ${cities[b].x},${cities[b].y}`}
            stroke="#60a5fa"
            strokeWidth="1"
            strokeDasharray="5 4"
            fill="none"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={
              isInView
                ? { pathLength: 1, opacity: 0.28 }
                : { pathLength: 0, opacity: 0 }
            }
            transition={{
              pathLength: { duration: 0.9, delay: 1.4 + i * 0.045, ease: [0.25, 0.1, 0.25, 1] },
              opacity: { duration: 0.4, delay: 1.4 + i * 0.045 },
            }}
          />
        ))}

        {/* City nodes — uniform styling, spring pop-in */}
        {cities.map((city) => (
          <g key={city.name}>
            {/* Outer glow */}
            <motion.circle
              cx={city.x}
              cy={city.y}
              r={CITY_R * 8}
              fill="url(#city-glow)"
              initial={{ opacity: 0, scale: 0 }}
              animate={
                isInView
                  ? { opacity: CITY_OPACITY * 0.55, scale: 1 }
                  : { opacity: 0, scale: 0 }
              }
              transition={{
                duration: 1,
                delay: city.delay,
                ease: [0.25, 0.1, 0.25, 1],
              }}
              style={{ transformOrigin: `${city.x}px ${city.y}px` }}
            />
            {/* Core dot — spring pop */}
            <motion.circle
              cx={city.x}
              cy={city.y}
              r={CITY_R}
              fill="#60a5fa"
              filter="url(#soft-glow)"
              initial={{ opacity: 0, scale: 0 }}
              animate={
                isInView
                  ? { opacity: CITY_OPACITY, scale: 1 }
                  : { opacity: 0, scale: 0 }
              }
              transition={{
                type: "spring",
                stiffness: 240,
                damping: 14,
                delay: city.delay,
              }}
              style={{ transformOrigin: `${city.x}px ${city.y}px` }}
            />
            {/* Label */}
            <motion.text
              x={city.x + (city.labelDx ?? 0)}
              y={city.y - CITY_R * 2.5 - 5 + (city.labelDy ?? 0)}
              textAnchor="middle"
              fill="white"
              fontSize="10"
              fontWeight="600"
              fontFamily="var(--font-heading), system-ui"
              letterSpacing="3"
              initial={{ opacity: 0, y: 4 }}
              animate={
                isInView
                  ? { opacity: 0.85, y: 0 }
                  : { opacity: 0, y: 4 }
              }
              transition={{ duration: 0.5, delay: city.delay + 0.2 }}
            >
              {city.name}
            </motion.text>
          </g>
        ))}
      </svg>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Industry card                                                     */
/* ------------------------------------------------------------------ */

function IndustryCard({
  title,
  description,
  delay = 0,
}: {
  title: string;
  description: string;
  delay?: number;
}) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-10%" });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 24 }}
      animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 24 }}
      transition={{ duration: 0.7, delay, ease: [0.25, 0.1, 0.25, 1] }}
      className="border border-white/[0.08] rounded-2xl p-8 bg-white/[0.03] hover:scale-[1.03] hover:border-white/[0.15] hover:bg-white/[0.06] hover:shadow-[0_8px_30px_rgba(0,0,0,0.4)] transition-all duration-300"
    >
      <h3 className="text-lg md:text-xl font-semibold text-white tracking-tight mb-3">
        {title}
      </h3>
      <p className="text-sm md:text-base text-white/50 leading-relaxed">
        {description}
      </p>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                              */
/* ------------------------------------------------------------------ */

export default function MiddleEastPage() {
  const heroRef = useRef(null);
  const { scrollYProgress: heroProgress } = useScroll({
    target: heroRef,
    offset: ["start start", "end start"],
  });
  const heroOpacity = useSpring(
    useTransform(heroProgress, [0, 0.8], [1, 0]),
    smooth
  );
  const heroY = useSpring(
    useTransform(heroProgress, [0, 1], [0, -60]),
    smooth
  );
  const photoScale = useSpring(
    useTransform(heroProgress, [0, 1], [1, 1.08]),
    smooth
  );


  return (
    <main className="relative overflow-x-hidden bg-[#050505]">
      {/* ============================================================ */}
      {/*  HERO — Editorial typography + large photo frame             */}
      {/* ============================================================ */}
      <section ref={heroRef} className="relative min-h-screen flex flex-col justify-center px-6 md:px-16 lg:px-24 pt-32 pb-20">
        {/* Corner labels */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, delay: 1.2 }}
          className="absolute top-8 left-6 md:left-16 lg:left-24"
        >
          <span className="text-[10px] md:text-xs tracking-[0.3em] uppercase text-white/25 font-medium">
            Est. San Diego, CA
          </span>
        </motion.div>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, delay: 1.4 }}
          className="absolute top-8 right-6 md:right-16 lg:right-24"
        >
          <span className="text-[10px] md:text-xs tracking-[0.3em] uppercase text-white/25 font-medium">
            Expanding across the Middle East
          </span>
        </motion.div>

        <motion.div style={{ opacity: heroOpacity, y: heroY }}>
          {/* Main heading */}
          <motion.div
            initial={{ opacity: 0, y: 40, filter: "blur(12px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{ duration: 1, delay: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
          >
            <h1 className="text-5xl md:text-7xl lg:text-[5.5rem] font-bold tracking-tight leading-[1.05] text-white max-w-5xl font-[family-name:var(--font-heading)]">
              AI Infrastructure
            </h1>
            <h1 className="text-5xl md:text-7xl lg:text-[5.5rem] font-bold tracking-tight leading-[1.05] text-white/35 max-w-5xl font-[family-name:var(--font-heading)]">
              for the Middle East
            </h1>
          </motion.div>

          {/* Large photo frame — Burj Khalifa, Dubai */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1, delay: 0.6, ease: [0.25, 0.1, 0.25, 1] }}
            className="mt-12 md:mt-16 w-full"
          >
            <div className="relative border border-white/[0.08] rounded-sm overflow-hidden">
              {/* Photo label */}
              <div className="absolute top-0 left-0 right-0 z-10 flex justify-between items-center px-5 py-3 bg-gradient-to-b from-[#050505]/80 to-transparent">
                <span className="text-[9px] md:text-[11px] tracking-[0.25em] uppercase text-white/30">
                  Burj Khalifa — Dubai
                </span>
                <span className="text-[9px] md:text-[11px] tracking-[0.25em] uppercase text-white/20">
                  2025
                </span>
              </div>

              <motion.div
                style={{ scale: photoScale }}
                className="aspect-[16/9] md:aspect-[2/1] overflow-hidden"
              >
                <img
                  src="https://images.unsplash.com/photo-1512453979798-5ea266f8880c?w=1920&q=85&auto=format"
                  alt="Burj Khalifa and Dubai skyline at night"
                  className="w-full h-full object-cover object-center"
                />
              </motion.div>

              {/* Bottom gradient */}
              <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-[#050505]/70 to-transparent" />
            </div>
          </motion.div>

          {/* Subtext */}
          <motion.p
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 1 }}
            className="mt-8 text-sm md:text-base text-white/40 max-w-xl leading-relaxed"
          >
            Workflow automation and decision intelligence
            across the Middle East&apos;s fastest-growing markets.
          </motion.p>
        </motion.div>

        {/* Scroll indicator — matches government page */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 1.2 }}
          className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-2"
        >
          <span className="text-[10px] text-white/40 tracking-[0.15em] uppercase">Scroll</span>
          <motion.div
            animate={{ y: [0, 6, 0] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
            className="w-5 h-8 rounded-full border border-white/20 flex items-start justify-center pt-1.5"
          >
            <div className="w-1 h-1.5 rounded-full bg-white/50" />
          </motion.div>
        </motion.div>
      </section>

      {/* ============================================================ */}
      {/*  SECTION 3 — Industries                                      */}
      {/* ============================================================ */}
      <section className="relative py-24 md:py-36 px-6 md:px-16 lg:px-24">
        <div className="max-w-5xl mx-auto">
          <RevealText>
            <span className="text-[10px] md:text-xs tracking-[0.3em] uppercase text-white/30 font-medium">
              Industries
            </span>
          </RevealText>
          <RevealText delay={0.15}>
            <h2 className="mt-4 text-3xl md:text-4xl lg:text-5xl font-bold text-white tracking-tight">
              Built for the region&apos;s
              <br />
              <span className="text-white/40">core verticals.</span>
            </h2>
          </RevealText>

          <div className="mt-14 grid grid-cols-1 md:grid-cols-3 gap-5">
            <IndustryCard
              title="Finance"
              description="Compliance automation, document extraction, and risk analysis for banking and fintech across multiple regulatory jurisdictions."
              delay={0.1}
            />
            <IndustryCard
              title="Energy"
              description="Operations intelligence, predictive maintenance, and document automation for oil, gas, and utilities across the GCC."
              delay={0.25}
            />
            <IndustryCard
              title="SMBs"
              description="Affordable AI-powered workflows that scale — invoice processing, customer ops, and back-office automation without enterprise overhead."
              delay={0.4}
            />
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/*  SECTION 4 — Regional presence with LARGE SVG map            */}
      {/* ============================================================ */}
      <section className="relative py-32 md:py-44 px-6 md:px-16 lg:px-24 overflow-hidden">
        <div className="max-w-6xl mx-auto">
          {/* Text — centered above map */}
          <div className="text-center mb-16 md:mb-20">
            <RevealText>
              <span className="text-[10px] md:text-xs tracking-[0.3em] uppercase text-white/30 font-medium">
                Presence
              </span>
            </RevealText>
            <RevealText delay={0.15}>
              <h2 className="mt-4 text-4xl md:text-5xl lg:text-6xl font-bold text-white tracking-tight leading-tight">
                US-headquartered.
              </h2>
            </RevealText>
            <RevealText delay={0.3}>
              <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white/40 tracking-tight leading-tight">
                Internationally expanding.
              </h2>
            </RevealText>
            <RevealText delay={0.5}>
              <p className="mt-6 text-sm md:text-base text-white/35 max-w-lg mx-auto leading-relaxed">
                Headquartered in San Diego with active expansion into
                Dubai, Riyadh, and Doha, building local
                partnerships and regional infrastructure.
              </p>
            </RevealText>
          </div>

          {/* Full-width map */}
          <RevealText delay={0.3}>
            <div className="relative">
              {/* Subtle border frame */}
              <div className="border border-white/[0.05] rounded-lg p-6 md:p-10 bg-white/[0.01]">
                <MiddleEastMap className="w-full max-w-4xl mx-auto" />
              </div>
            </div>
          </RevealText>
        </div>
      </section>

      {/* ============================================================ */}
      {/*  CTA                                                         */}
      {/* ============================================================ */}
      <section className="relative py-32 px-6">
        <div className="max-w-2xl mx-auto text-center">
          <RevealText>
            <h2 className="text-2xl md:text-4xl font-bold tracking-tight text-white mb-4">
              Ready to Deploy
            </h2>
          </RevealText>
          <RevealText delay={0.1}>
            <p className="text-sm md:text-base text-white/40 mb-10 max-w-md mx-auto">
              Workflow automation and decision intelligence
              for the Middle East&apos;s fastest-growing markets. Let&apos;s talk.
            </p>
          </RevealText>
          <RevealText delay={0.2}>
            <div className="flex items-center justify-center gap-4">
              <a
                href="mailto:team@strvx.com?subject=Middle%20East%20Inquiry"
                className="px-8 py-3.5 rounded-lg bg-white text-[#030810] text-sm font-medium hover:bg-white/90 transition-colors duration-300"
              >
                Get in Touch
              </a>
            </div>
          </RevealText>
          <RevealText delay={0.4}>
            <p className="text-xs font-mono text-white/20 mt-8 tracking-wider">
              team@strvx.com
            </p>
          </RevealText>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-white/[0.04] py-8 text-center">
        <span className="text-[10px] text-white/30 tracking-[0.1em] uppercase">
          strvx &middot; San Diego, CA &middot; Dubai
        </span>
      </footer>
    </main>
  );
}
