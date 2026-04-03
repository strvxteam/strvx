"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import {
  motion,
  useInView,
  useScroll,
  useTransform,
  useSpring,
  useMotionValueEvent,
  AnimatePresence,
} from "framer-motion";
import type { MotionValue } from "framer-motion";
import { useIsMobile } from "../motion-provider";

const steps = [
  {
    num: "01",
    title: "Discovery",
    desc: "We start with a free 30-minute call to understand your problem deeply. No sales pitch — just a real conversation about what's broken, what's manual, and what success looks like. We'll ask hard questions to make sure AI is actually the right solution.",
    details: [
      "30-minute free consultation",
      "Problem deep-dive",
      "Feasibility assessment",
      "No commitment required",
    ],
  },
  {
    num: "02",
    title: "Scope & Propose",
    desc: "We define exactly what we'll build, how long it will take, and what it will cost. Then we build a quick MVP so you can see the approach in action before committing to the full build. You get a written proposal, a working proof of concept, and zero guesswork.",
    details: [
      "Written proposal & SOW",
      "Working MVP / proof of concept",
      "Transparent pricing & timeline",
      "Technical architecture outlined",
    ],
  },
  {
    num: "03",
    title: "Build",
    desc: "We build your tool with regular async updates so you always know where things stand. You'll see working demos throughout — not a big reveal at the end. We iterate based on your feedback in real time.",
    details: [
      "Async progress updates",
      "Working demos throughout",
      "Real-time feedback loops",
      "2–3 week build cycles",
    ],
  },
  {
    num: "04",
    title: "Deliver",
    desc: "You get working software, not a prototype. We handle deployment, write documentation, and walk your team through everything. The handoff is clean — you own the code, the infrastructure, and the knowledge.",
    details: [
      "Production-ready deployment",
      "Full documentation",
      "Team walkthrough & training",
      "Complete code ownership",
    ],
  },
  {
    num: "05",
    title: "Maintain",
    desc: "We don't disappear after delivery. We offer ongoing support to fix bugs, handle edge cases, and iterate as your needs evolve. Most clients stay on a lightweight maintenance plan to keep things running smoothly.",
    details: [
      "Bug fixes & monitoring",
      "Performance optimization",
      "Feature iterations",
      "Flexible maintenance plans",
    ],
  },
];

function TimelineStep({
  step,
  index,
  scrollYProgress,
  total,
}: {
  step: (typeof steps)[number];
  index: number;
  scrollYProgress: MotionValue<number>;
  total: number;
}) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });
  const isLeft = index % 2 === 0;
  const m = useIsMobile();

  const threshold = total > 1 ? index / (total - 1) : 0;
  const [isActive, setIsActive] = useState(false);
  useMotionValueEvent(scrollYProgress, "change", (v) => {
    setIsActive(v >= threshold - 0.02);
  });

  return (
    <div
      ref={ref}
      className="relative flex items-start md:items-center gap-0 md:gap-8"
    >
      {/* Left content (even) or spacer (odd) */}
      <div className={`hidden md:block flex-1 ${isLeft ? "" : "order-3"}`}>
        <motion.div
          initial={m ? false : { opacity: 0, x: isLeft ? -60 : 60 }}
          animate={m ? undefined : (isInView ? { opacity: 1, x: 0 } : {})}
          transition={m ? undefined : { duration: 0.7, ease: "easeOut" }}
          className={isLeft ? "text-right pr-8" : "text-left pl-8"}
        >
          <span className="text-[11px] font-semibold tracking-widest text-[#555]">
            {step.num}
          </span>
          <h3 className="text-3xl font-bold tracking-tight mt-1 mb-3">
            {step.title}
          </h3>
          <p className="text-sm text-[#888] leading-relaxed max-w-lg inline-block">
            {step.desc}
          </p>
        </motion.div>
      </div>

      {/* Center dot */}
      <div className="flex flex-col items-center shrink-0 md:order-2 mr-5 md:mr-0">
        <motion.div
          initial={m ? false : { scale: 0 }}
          animate={m ? undefined : (isInView ? { scale: 1 } : {})}
          transition={m ? undefined : {
            duration: 0.4,
            type: "spring",
            stiffness: 200,
          }}
          className="relative z-10"
        >
          <div className="w-5 h-5 rounded-full bg-white shadow-[0_0_20px_rgba(255,255,255,0.5)]" />
          <div className="absolute inset-0 rounded-full bg-white animate-ping opacity-20" />
        </motion.div>
      </div>

      {/* Right content (even detail card) or left content (odd) */}
      <div className={`flex-1 ${isLeft ? "order-3" : ""}`}>
        <motion.div
          initial={m ? false : { opacity: 0, x: isLeft ? 60 : -60 }}
          animate={m ? undefined : (isInView ? { opacity: 1, x: 0 } : {})}
          transition={m ? undefined : { duration: 0.7, delay: 0.15, ease: "easeOut" }}
        >
          {/* Mobile: title + desc */}
          <div className="md:hidden mb-4">
            <span className="text-[11px] font-semibold tracking-widest text-[#555]">
              {step.num}
            </span>
            <h3 className="text-2xl font-bold tracking-tight mt-1 mb-2">
              {step.title}
            </h3>
            <p className="text-sm text-[#888] leading-relaxed mb-3">
              {step.desc}
            </p>
          </div>

          {/* Detail card */}
          <div
            className={`rounded-xl bg-[#111] border p-6 transition-all duration-500 ${
              isActive
                ? "border-white/30 shadow-[0_0_30px_rgba(255,255,255,0.08)]"
                : "border-white/[0.06]"
            }`}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {step.details.map((detail, i) => (
                <motion.div
                  key={detail}
                  initial={m ? false : { opacity: 0, y: 10 }}
                  animate={m ? undefined : (isInView ? { opacity: 1, y: 0 } : {})}
                  transition={m ? undefined : { delay: 0.3 + i * 0.1, duration: 0.3 }}
                  className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg bg-white/[0.03] border border-white/[0.04]"
                >
                  <div className="w-1.5 h-1.5 rounded-full bg-white/40 shrink-0" />
                  <span className="text-[12px] text-[#999]">{detail}</span>
                </motion.div>
              ))}
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

export default function ProcessPage() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const m = useIsMobile();
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start center", "end center"],
  });
  const lineHeight = useSpring(
    useTransform(scrollYProgress, [0, 1], ["0%", "100%"]),
    { stiffness: 80, damping: 30 }
  );

  return (
    <main className="min-h-screen">
      {/* Nav */}
      <nav className="sticky top-0 z-50 backdrop-blur-xl bg-[#050505]/80 border-b border-white/[0.06] px-6 md:px-12 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between md:justify-center gap-10">
          <Link href="/" className="text-sm font-bold tracking-[0.12em] uppercase md:mr-4">
            strvx
          </Link>
          <ul className="hidden md:flex items-center gap-8 list-none">
            <li>
              <Link href="/services" className="text-sm text-[#777] tracking-wide hover:text-[#0a0a0a] hover:bg-white px-3 py-1.5 rounded-full transition-all duration-200">
                Services
              </Link>
            </li>
            <li>
              <Link href="/process" className="text-sm text-[#777] tracking-wide hover:text-[#0a0a0a] hover:bg-white px-3 py-1.5 rounded-full transition-all duration-200">
                Process
              </Link>
            </li>
            <li>
              <Link href="/book" className="text-xs tracking-[0.06em] uppercase px-5 py-2.5 rounded-lg bg-white text-[#0a0a0a] font-semibold hover:bg-white/90 transition-colors duration-200">
                Book a call
              </Link>
            </li>
          </ul>
          <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="md:hidden text-white" aria-label="Toggle menu">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d={mobileMenuOpen ? "M5 5l10 10M15 5L5 15" : "M3 6h14M3 10h14M3 14h14"} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
          </button>
        </div>
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.2 }} className="md:hidden overflow-hidden">
              <div className="flex flex-col gap-4 pt-4 pb-2">
                {[["Services", "/services"], ["Process", "/process"]].map(([label, href]) => (
                  <Link key={href} href={href as string} onClick={() => setMobileMenuOpen(false)} className="text-sm text-[#888] hover:text-white transition-colors">{label}</Link>
                ))}
                <Link href="/book" onClick={() => setMobileMenuOpen(false)} className="text-xs tracking-[0.06em] uppercase px-5 py-2.5 rounded-lg bg-white text-[#0a0a0a] font-semibold text-center">Book a call</Link>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </nav>

      {/* Header */}
      <section className="max-w-7xl mx-auto px-6 md:px-12 pt-20 md:pt-32 pb-16">
        <motion.p
          initial={m ? false : { opacity: 0, x: -30 }}
          animate={m ? undefined : { opacity: 1, x: 0 }}
          transition={m ? undefined : { duration: 0.5 }}
          className="text-xs font-semibold tracking-[0.2em] uppercase text-[#888] mb-6"
        >
          How we work
        </motion.p>
        <motion.h1
          initial={m ? false : { opacity: 0, filter: "blur(10px)", y: 20 }}
          animate={m ? undefined : { opacity: 1, filter: "blur(0px)", y: 0 }}
          transition={m ? undefined : { duration: 0.8, ease: "easeOut" }}
          className="text-3xl md:text-7xl font-bold tracking-tight leading-[0.95] mb-6"
        >
          From problem to production.
        </motion.h1>
        <motion.p
          initial={m ? false : { opacity: 0, y: 20 }}
          animate={m ? undefined : { opacity: 1, y: 0 }}
          transition={m ? undefined : { duration: 0.6, delay: 0.2 }}
          className="text-base text-[#666] max-w-xl leading-relaxed"
        >
          A clear, repeatable process so you always know where your project
          stands. Scroll down to walk through each phase.
        </motion.p>
      </section>

      {/* Scroll Timeline */}
      <section className="max-w-6xl mx-auto px-6 md:px-12 pb-20 md:pb-32">
        <div ref={containerRef} className="relative">
          {/* Background line */}
          <div className="absolute left-[9px] md:left-1/2 md:-translate-x-[0.5px] top-0 bottom-0 w-[1px] bg-white/[0.06]" />
          {/* Animated fill line */}
          <motion.div
            className="absolute left-[9px] md:left-1/2 md:-translate-x-[0.5px] top-0 w-[1px] bg-gradient-to-b from-white/60 to-white/20"
            style={{ height: lineHeight }}
          />

          <div className="flex flex-col gap-24 md:gap-32">
            {steps.map((step, i) => (
              <TimelineStep key={step.num} step={step} index={i} scrollYProgress={scrollYProgress} total={steps.length} />
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-7xl mx-auto px-6 md:px-12 py-20 md:py-32">
        <div className="rounded-xl bg-[#fafafa] text-[#0a0a0a] p-12 md:p-16 text-center">
          <motion.h2
            initial={m ? false : { opacity: 0, scale: 0.95 }}
            whileInView={m ? undefined : { opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={m ? undefined : { duration: 0.6 }}
            className="text-3xl md:text-4xl font-bold tracking-tight mb-4"
          >
            Ready to start?
          </motion.h2>
          <p className="text-sm text-[#555] mb-8">
            Step one is a free 30-minute call. No pitch, no commitment.
          </p>
          <Link
            href="/book"
            className="inline-block bg-[#0a0a0a] text-[#fafafa] text-sm font-semibold px-8 py-3 rounded-lg hover:opacity-90 transition-opacity"
          >
            Book a free call
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="px-6 md:px-12 pt-10 pb-8" style={{ borderTop: "1px solid rgba(255, 255, 255, 0.06)" }}>
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex flex-col items-center md:items-start gap-1">
            <span className="text-xs font-semibold tracking-[0.12em] uppercase">strvx</span>
            <span className="text-xs text-[#555]">&copy; 2026. San Diego, CA.</span>
          </div>
          <nav className="flex items-center gap-6">
            <Link href="/" className="text-xs text-[#555] hover:text-white transition-colors">Home</Link>
            <Link href="/services" className="text-xs text-[#555] hover:text-white transition-colors">Services</Link>
            <Link href="/process" className="text-xs text-[#555] hover:text-white transition-colors">Process</Link>
            <Link href="/book" className="text-xs text-[#555] hover:text-white transition-colors">Book a call</Link>
          </nav>
          <a
            href="https://www.linkedin.com/company/strvx"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#555] hover:text-white transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
              <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
            </svg>
          </a>
        </div>
      </footer>
    </main>
  );
}
