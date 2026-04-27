"use client";

import { useRef } from "react";
import Image from "next/image";
import {
  motion,
  useScroll,
  useTransform,
  useSpring,
  useInView,
} from "framer-motion";
import { GovParticleGrid } from "../../components/GovParticleGrid";

/* ------------------------------------------------------------------ */
/*  Animation helpers                                                  */
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

function StaggerReveal({
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
      initial="hidden"
      animate={isInView ? "visible" : "hidden"}
      variants={{
        hidden: {},
        visible: { transition: { staggerChildren: 0.15, delayChildren: delay } },
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

function StaggerChild({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: 30, filter: "blur(10px)" },
        visible: {
          opacity: 1,
          y: 0,
          filter: "blur(0px)",
          transition: { duration: 0.7, ease: [0.25, 0.1, 0.25, 1] },
        },
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Capability card                                                    */
/* ------------------------------------------------------------------ */

interface CapabilityProps {
  icon: React.ReactNode;
  codename: string;
  title: string;
  description: string;
}

function CapabilityCard({ icon, codename, title, description }: CapabilityProps) {
  return (
    <div className="group relative h-full p-6 md:p-8 rounded-2xl bg-white/[0.03] border border-white/[0.08] hover:scale-[1.03] hover:border-white/[0.15] hover:bg-white/[0.06] hover:shadow-[0_8px_30px_rgba(0,0,0,0.4)] transition-all duration-300">
      {/* Subtle corner glow on hover */}
      <div className="absolute top-0 left-0 w-24 h-24 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
        style={{
          background: "radial-gradient(circle at top left, rgba(120,140,255,0.08), transparent 70%)",
        }}
      />
      <div className="text-2xl mb-4">{icon}</div>
      <p className="text-[10px] font-mono tracking-[0.25em] uppercase text-white/30 mb-2">
        {codename}
      </p>
      <h3 className="text-lg font-semibold text-white mb-3">{title}</h3>
      <p className="text-sm text-white/50 leading-relaxed">{description}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Stat counter                                                       */
/* ------------------------------------------------------------------ */

function StatBlock({ value, label }: { value: string; label: string }) {
  return (
    <div className="text-center">
      <p className="text-3xl md:text-4xl font-bold tracking-tight text-white">
        {value}
      </p>
      <p className="text-xs font-mono tracking-[0.15em] uppercase text-white/30 mt-2">
        {label}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

const CAPABILITIES: CapabilityProps[] = [
  {
    icon: <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-white/60"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><path d="M12 18v-6"/><path d="m9 15 3-3 3 3"/></svg>,
    codename: "DOCSTREAM",
    title: "Document Intelligence",
    description:
      "Automated ingestion, classification, and extraction across thousands of document types. From PDFs to handwritten forms — structured data in seconds.",
  },
  {
    icon: <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-white/60"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>,
    codename: "OVERWATCH",
    title: "Decision Support",
    description:
      "Real-time dashboards that surface what matters. Prioritize threats, allocate resources, and accelerate decisions with AI-driven analysis.",
  },
  {
    icon: <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-white/60"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>,
    codename: "CITADEL",
    title: "Zero-Trust Infrastructure",
    description:
      "Air-gapped deployment, end-to-end encryption, and full audit trails. Your data never leaves your infrastructure.",
  },
  {
    icon: <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-white/60"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
    codename: "NEXUS",
    title: "Workflow Automation",
    description:
      "Eliminate manual bottlenecks across procurement, case management, and compliance pipelines. Mission-critical processes that run without friction.",
  },
];

export default function GovernmentPage() {
  const heroRef = useRef(null);
  const { scrollYProgress: heroProgress } = useScroll({
    target: heroRef,
    offset: ["start start", "end start"],
  });
  const heroOpacity = useSpring(
    useTransform(heroProgress, [0, 0.7], [1, 0]),
    { stiffness: 80, damping: 30, mass: 0.5 }
  );
  const heroY = useSpring(
    useTransform(heroProgress, [0, 1], [0, 80]),
    { stiffness: 80, damping: 30, mass: 0.5 }
  );

  return (
    <main className="relative overflow-x-hidden bg-[#030810]">
      {/* ============================================================ */}
      {/*  HERO — Particle grid + bold headline + CTAs                  */}
      {/* ============================================================ */}
      <section ref={heroRef} className="relative h-screen overflow-hidden">
        <GovParticleGrid />

        {/* Vignette overlay */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse at center, transparent 40%, rgba(3,8,16,0.8) 100%)",
          }}
        />
        <div className="absolute bottom-0 left-0 right-0 h-48 bg-gradient-to-t from-[#030810] to-transparent pointer-events-none" />

        <motion.div
          className="relative z-10 h-full flex items-center justify-center px-6 pointer-events-none"
          style={{ opacity: heroOpacity, y: heroY }}
        >
          <div className="text-center max-w-4xl">
            {/* Eyebrow */}
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="text-[11px] font-mono tracking-[0.3em] uppercase text-white/40 mb-6"
            >
              Government &amp; Defense
            </motion.p>

            {/* Headline */}
            <motion.h1
              initial={{ opacity: 0, y: 30, filter: "blur(10px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={{
                duration: 1,
                delay: 0.3,
                ease: [0.25, 0.1, 0.25, 1],
              }}
              className="text-4xl md:text-6xl lg:text-7xl font-bold tracking-tight leading-[1.08] text-white"
            >
              AI That Operates at
              <br />
              <span className="text-white/50">the Speed of Mission</span>
            </motion.h1>

            {/* Sub */}
            <motion.p
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.7 }}
              className="text-base md:text-lg text-white/40 mt-6 max-w-2xl mx-auto leading-relaxed"
            >
              Secure workflow automation and decision intelligence built for
              agencies that can&apos;t afford to wait.
            </motion.p>

            {/* CTAs */}
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 1 }}
              className="flex items-center justify-center gap-4 mt-10"
            >
              <a
                href="mailto:team@strvx.com?subject=Government%20Demo%20Request"
                className="pointer-events-auto px-6 py-3 rounded-lg bg-white text-[#030810] text-sm font-medium hover:bg-white/90 transition-colors duration-300"
              >
                Request Demo
              </a>
              <a
                href="#capabilities"
                className="pointer-events-auto px-6 py-3 rounded-lg border border-white/[0.12] text-sm text-white/70 hover:text-white hover:border-white/25 transition-all duration-300"
              >
                Learn More
              </a>
            </motion.div>

          </div>
        </motion.div>

        {/* Scroll prompt — matches main page */}
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
      {/*  CAPABILITIES — Named product cards in grid                   */}
      {/* ============================================================ */}
      <section id="capabilities" className="relative min-h-[80vh] flex flex-col justify-center py-32 px-6">
        {/* Ambient glow */}
        <div
          className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse, rgba(120,140,255,0.04) 0%, transparent 70%)",
          }}
        />

        <div className="max-w-6xl mx-auto">
          <RevealText>
            <p className="text-[11px] font-mono tracking-[0.3em] uppercase text-white/30 mb-4">
              Platform
            </p>
          </RevealText>
          <RevealText delay={0.1}>
            <h2 className="text-3xl md:text-5xl font-bold tracking-tight text-white mb-4">
              Built for the Mission
            </h2>
          </RevealText>
          <RevealText delay={0.2}>
            <p className="text-base md:text-lg text-white/40 max-w-xl mb-16">
              Four integrated capabilities. One platform. Deployed on your
              infrastructure, under your control.
            </p>
          </RevealText>

          <StaggerReveal
            className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6"
            delay={0.3}
          >
            {CAPABILITIES.map((cap) => (
              <StaggerChild key={cap.codename}>
                <CapabilityCard {...cap} />
              </StaggerChild>
            ))}
          </StaggerReveal>
        </div>
      </section>

      {/* ============================================================ */}
      {/*  PRODUCT — Dashboard screenshot with context                  */}
      {/* ============================================================ */}
      <section className="relative min-h-[80vh] flex flex-col justify-center py-24 px-6 overflow-hidden">
        {/* Ambient glow behind screenshot */}
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1200px] h-[600px] pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse, rgba(120,140,255,0.06) 0%, transparent 60%)",
          }}
        />

        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col lg:flex-row items-center gap-12 lg:gap-16">
            {/* Text side */}
            <div className="lg:w-2/5 flex-shrink-0">
              <RevealText>
                <p className="text-[11px] font-mono tracking-[0.3em] uppercase text-white/30 mb-4">
                  OVERWATCH Dashboard
                </p>
              </RevealText>
              <RevealText delay={0.1}>
                <h2 className="text-2xl md:text-4xl font-bold tracking-tight text-white mb-6">
                  See Everything.
                  <br />
                  <span className="text-white/50">Decide Faster.</span>
                </h2>
              </RevealText>
              <RevealText delay={0.2}>
                <p className="text-sm md:text-base text-white/40 leading-relaxed mb-8">
                  A unified operations view that aggregates data streams,
                  surfaces anomalies, and delivers actionable intelligence —
                  all in real time.
                </p>
              </RevealText>

              {/* Mini stats */}
              <RevealText delay={0.3}>
                <div className="flex gap-8">
                  <StatBlock value="< 100ms" label="Latency" />
                  <StatBlock value="99.99%" label="Uptime" />
                </div>
              </RevealText>
            </div>

            {/* Screenshot */}
            <RevealText delay={0.2} className="lg:w-3/5">
              <div
                className="rounded-xl overflow-hidden"
                style={{
                  border: "1px solid rgba(255,255,255,0.06)",
                  boxShadow:
                    "0 0 80px rgba(120,140,255,0.05), 0 40px 80px rgba(0,0,0,0.5)",
                }}
              >
                <Image
                  src="/overwatch-dashboard-v5.png"
                  alt="STRVX Government Operations Dashboard"
                  width={1920}
                  height={1080}
                  className="w-full h-auto"
                  priority
                />
              </div>
            </RevealText>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/*  TYPOGRAPHY — Air-gapped. Auditable. Automated.               */}
      {/* ============================================================ */}
      <section className="relative min-h-[80vh] flex flex-col justify-center py-40 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <RevealText>
            <p className="text-4xl md:text-6xl lg:text-7xl font-bold text-white tracking-tight">
              Air-gapped.
            </p>
          </RevealText>
          <RevealText delay={0.12}>
            <p className="text-4xl md:text-6xl lg:text-7xl font-bold text-white/60 tracking-tight">
              Auditable.
            </p>
          </RevealText>
          <RevealText delay={0.24}>
            <p className="text-4xl md:text-6xl lg:text-7xl font-bold text-white/30 tracking-tight">
              Automated.
            </p>
          </RevealText>
          <RevealText delay={0.5}>
            <p className="text-sm md:text-base font-mono tracking-[0.2em] uppercase text-white/25 mt-12">
              Your data never leaves your infrastructure
            </p>
          </RevealText>
        </div>

        {/* Subtle divider line */}
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[200px] h-px bg-gradient-to-r from-transparent via-white/[0.08] to-transparent" />
      </section>

      {/* ============================================================ */}
      {/*  CTA — Stronger close                                         */}
      {/* ============================================================ */}
      <section className="relative min-h-[80vh] flex flex-col justify-center py-32 px-6">
        <div className="max-w-2xl mx-auto text-center">
          <RevealText>
            <h2 className="text-2xl md:text-4xl font-bold tracking-tight text-white mb-4">
              Ready to Deploy
            </h2>
          </RevealText>
          <RevealText delay={0.1}>
            <p className="text-sm md:text-base text-white/40 mb-10 max-w-md mx-auto">
              We work directly with program offices and prime contractors.
              Let&apos;s talk about your mission.
            </p>
          </RevealText>
          <RevealText delay={0.2}>
            <div className="flex items-center justify-center gap-4">
              <a
                href="mailto:team@strvx.com?subject=Government%20Inquiry"
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
          strvx &middot; San Diego, CA
        </span>
      </footer>
    </main>
  );
}
