"use client";

import Image from "next/image";
import Link from "next/link";
import { useRef, useEffect, useState, useCallback } from "react";
import {
  motion,
  AnimatePresence,
  useInView,
  useScroll,
  useTransform,
  useMotionValue,
  useSpring,
  type Variants,
} from "framer-motion";
import { useIsMobile } from "./motion-provider";
// spotlight-card removed — using plain cards
// Hero background options (saved):
// import { ParticleField } from "../components/ParticleField";
// import { AuroraWaves } from "../components/AuroraWaves";
// import { FluidBackground } from "../components/FluidBackground";
import { HeroVideoCarousel } from "../components/HeroVideoCarousel";

/* ------------------------------------------------------------------ */
/*  Animation helpers                                                 */
/* ------------------------------------------------------------------ */

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } },
};

const fadeIn: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.6 } },
};

const staggerContainer: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.1 } },
};

const staggerItem: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } },
};

const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.92, filter: "blur(8px)" },
  visible: { opacity: 1, scale: 1, filter: "blur(0px)", transition: { duration: 0.6, ease: "easeOut" } },
};

const slideFromLeft: Variants = {
  hidden: { opacity: 0, x: -60 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.7, ease: "easeOut" } },
};

const slideFromRight: Variants = {
  hidden: { opacity: 0, x: 60 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.7, ease: "easeOut" } },
};

const staggerScaleContainer: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08 } },
};

const staggerScaleItem: Variants = {
  hidden: { opacity: 0, scale: 0.9, filter: "blur(6px)" },
  visible: { opacity: 1, scale: 1, filter: "blur(0px)", transition: { duration: 0.5, ease: "easeOut" } },
};

const mobileFade: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.3 } },
};

const mobileStagger: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.05 } },
};

function Section({ children, className = "", delay = 0, id }: { children: React.ReactNode; className?: string; delay?: number; id?: string }) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });
  const m = useIsMobile();
  return (
    <motion.section
      id={id}
      ref={ref}
      initial={m ? false : "hidden"}
      animate={m ? undefined : (isInView ? "visible" : "hidden")}
      variants={m
        ? { hidden: { opacity: 0 }, visible: { opacity: 1, transition: { duration: 0.3, delay } } }
        : { hidden: { opacity: 0, y: 40 }, visible: { opacity: 1, y: 0, transition: { duration: 0.7, ease: "easeOut", delay } } }
      }
      className={className}
    >
      {children}
    </motion.section>
  );
}

/* ------------------------------------------------------------------ */
/*  Hero mockup helpers                                               */
/* ------------------------------------------------------------------ */

function HeroTypingMessage({ text, delay }: { text: string; delay: number }) {
  const [displayed, setDisplayed] = useState("");
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const timeout = setTimeout(() => setStarted(true), delay * 1000);
    return () => clearTimeout(timeout);
  }, [delay]);

  useEffect(() => {
    if (!started) return;
    let i = 0;
    const interval = setInterval(() => {
      i++;
      setDisplayed(text.slice(0, i));
      if (i >= text.length) clearInterval(interval);
    }, 25);
    return () => clearInterval(interval);
  }, [started, text]);

  if (!started) return null;
  return (
    <div className="flex items-start gap-2">
      <span className="text-indigo-400 text-[10px] mt-0.5 shrink-0">▸</span>
      <span className="text-[11px] md:text-xs text-white/70 font-mono leading-relaxed">
        {displayed}
        {displayed.length < text.length && <span className="animate-blink text-indigo-400">|</span>}
      </span>
    </div>
  );
}

function HeroCounter({ target, delay, decimals = 0, suffix = "" }: { target: number; delay: number; decimals?: number; suffix?: string }) {
  const [display, setDisplay] = useState("0");

  useEffect(() => {
    const timeout = setTimeout(() => {
      const duration = 1000;
      const start = performance.now();
      const tick = (now: number) => {
        const elapsed = now - start;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        const val = target * eased;
        setDisplay(decimals > 0 ? val.toFixed(decimals) : Math.round(val).toString());
        if (progress < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }, delay * 1000);
    return () => clearTimeout(timeout);
  }, [target, delay, decimals]);

  return (
    <span className="text-lg md:text-2xl font-bold tracking-tight text-white">
      {display}{suffix}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Animated counter                                                  */
/* ------------------------------------------------------------------ */

function AnimatedStat({ value, label }: { value: string; label: string }) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-40px" });
  const [display, setDisplay] = useState("0");

  useEffect(() => {
    if (!isInView) return;
    const numericMatch = value.match(/^(\d+)/);
    if (!numericMatch) { setDisplay(value); return; }
    const target = parseInt(numericMatch[1]);
    const suffix = value.replace(/^\d+/, "");
    const duration = 1200;
    const start = performance.now();

    const tick = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(target * eased) + suffix);
      if (progress < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [isInView, value]);

  return (
    <div ref={ref}>
      <span className="block text-3xl md:text-4xl font-bold tracking-tight mb-1">
        {display}
      </span>
      <span className="text-xs text-[#888] tracking-wide">{label}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Mouse-tracking tilt card                                          */
/* ------------------------------------------------------------------ */

function TiltCard({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const m = useIsMobile();
  const ref = useRef<HTMLDivElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotateX = useSpring(useTransform(y, [-0.5, 0.5], [4, -4]), { stiffness: 300, damping: 30 });
  const rotateY = useSpring(useTransform(x, [-0.5, 0.5], [-4, 4]), { stiffness: 300, damping: 30 });

  function handleMouse(e: React.MouseEvent) {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    x.set((e.clientX - rect.left) / rect.width - 0.5);
    y.set((e.clientY - rect.top) / rect.height - 0.5);
  }

  function handleLeave() { x.set(0); y.set(0); }

  if (m) return <div className={className}>{children}</div>;

  return (
    <motion.div
      ref={ref}
      onMouseMove={handleMouse}
      onMouseLeave={handleLeave}
      style={{ rotateX, rotateY, transformPerspective: 800 }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Mockup building blocks                                            */
/* ------------------------------------------------------------------ */

function MockSidebarItem({ icon, label, active }: { icon: string; label: string; active?: boolean }) {
  return (
    <div className={`flex items-center gap-2.5 px-3 py-1.5 rounded-md text-xs ${active ? "bg-white/[0.06] text-[#ccc]" : "text-[#888]"}`}>
      <span className="text-[10px]">{icon}</span>
      <span>{label}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Typing text effect                                                */
/* ------------------------------------------------------------------ */

function TypingText({ text, delay = 0 }: { text: string; delay?: number }) {
  const [displayed, setDisplayed] = useState("");
  const [started, setStarted] = useState(false);
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true });

  useEffect(() => {
    if (!isInView) return;
    const timer = setTimeout(() => setStarted(true), delay);
    return () => clearTimeout(timer);
  }, [isInView, delay]);

  useEffect(() => {
    if (!started) return;
    let i = 0;
    const interval = setInterval(() => {
      setDisplayed(text.slice(0, i + 1));
      i++;
      if (i >= text.length) clearInterval(interval);
    }, 30);
    return () => clearInterval(interval);
  }, [started, text]);

  return (
    <span ref={ref}>
      {displayed}
      {started && displayed.length < text.length && (
        <span className="animate-blink">|</span>
      )}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Hero Dashboard Mockup                                             */
/* ------------------------------------------------------------------ */

function HeroDashboardMockup() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });
  const m = useIsMobile();

  return (
    <motion.div
      ref={ref}
      initial={m ? false : { opacity: 0, y: 50, scale: 0.97 }}
      animate={m ? undefined : (isInView ? { opacity: 1, y: 0, scale: 1 } : {})}
      transition={m ? undefined : { duration: 0.8, ease: "easeOut", delay: 0.3 }}
    >
      <TiltCard className="mockup-shadow rounded-xl bg-[#0a0a0a] border border-white/[0.06] overflow-hidden max-w-4xl mx-auto">
        {/* Top bar */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.06] bg-[#111]">
          <div className="flex items-center gap-3">
            <div className="flex gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-[#333]" />
              <div className="w-2.5 h-2.5 rounded-full bg-[#333]" />
              <div className="w-2.5 h-2.5 rounded-full bg-[#333]" />
            </div>
            <span className="text-[10px] text-[#666] ml-2">internal-tools.acme.co</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-white/30 animate-pulse-glow" />
            <span className="text-[10px] text-[#666]">Connected</span>
          </div>
        </div>

        <div className="flex min-h-0">
          {/* Sidebar */}
          <div className="w-44 border-r border-white/[0.06] p-3 space-y-1 hidden md:block">
            <div className="text-[9px] uppercase tracking-widest text-[#555] mb-3 px-3">Workspace</div>
            <MockSidebarItem icon="&#x25A0;" label="Documents" active />
            <MockSidebarItem icon="&#x25B2;" label="Reports" />
            <MockSidebarItem icon="&#x25CF;" label="Query" />
            <MockSidebarItem icon="&#x2699;" label="Settings" />
            <div className="text-[9px] uppercase tracking-widest text-[#555] mt-5 mb-3 px-3">Recent</div>
            <MockSidebarItem icon="&#x25CB;" label="Q4 Revenue" />
            <MockSidebarItem icon="&#x25CB;" label="Vendor Audit" />
          </div>

          {/* Main - AI chat */}
          <div className="flex-1 p-5 space-y-5">
            {/* User message */}
            <div className="flex gap-3">
              <div className="w-6 h-6 rounded-full shrink-0 mt-0.5 flex items-center justify-center text-[9px] font-bold bg-white/[0.08] text-[#888]">U</div>
              <div className="text-[11px] leading-relaxed text-[#999] flex-1">
                <TypingText text="Summarize Q4 revenue from the uploaded reports and flag any anomalies." delay={800} />
              </div>
            </div>

            {/* AI response */}
            <motion.div
              initial={m ? false : { opacity: 0, y: 10 }}
              animate={m ? undefined : (isInView ? { opacity: 1, y: 0 } : {})}
              transition={m ? undefined : { delay: 3.5, duration: 0.5 }}
              className="flex gap-3"
            >
              <div className="w-6 h-6 rounded-full shrink-0 mt-0.5 flex items-center justify-center text-[9px] font-bold bg-white text-[#0a0a0a]">AI</div>
              <div className="text-[11px] leading-relaxed text-[#999] flex-1">
                <p className="mb-2">Based on the 3 uploaded Q4 reports, here&apos;s the summary:</p>
                <div className="bg-white/[0.05] border border-white/[0.06] rounded-lg p-3 my-2 font-mono text-[10px] space-y-1">
                  <div className="flex justify-between"><span className="text-[#999]">Total Revenue</span><span className="text-white/70">$2.4M</span></div>
                  <div className="flex justify-between"><span className="text-[#999]">QoQ Growth</span><span className="text-white/70">+12.3%</span></div>
                  <div className="flex justify-between"><span className="text-[#999]">Anomaly Detected</span><span className="text-white/50">Vendor #47, 3x spike</span></div>
                </div>
                <p className="text-[#999] mt-2">Vendor #47 shows a 3x billing spike vs Q3. Recommend manual review.</p>
              </div>
            </motion.div>
          </div>
        </div>
      </TiltCard>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Service Card Mockups                                              */
/* ------------------------------------------------------------------ */

function DocProcessingMockup() {
  return (
    <div className="bg-[#0a0a0a] rounded-lg border border-white/[0.06] p-4 mt-5">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-6 h-6 bg-white/[0.06] rounded flex items-center justify-center text-[9px] text-[#888]">PDF</div>
        <span className="text-[10px] text-[#888]">invoice_march.pdf</span>
        <span className="text-[9px] text-white/40 ml-auto">Parsed</span>
      </div>
      <div className="font-mono text-[10px] text-[#888] space-y-0.5 bg-[#111] rounded p-2.5">
        <div>{`{`}</div>
        <div className="pl-3"><span className="text-white/50">&quot;vendor&quot;</span>: <span className="text-white/30">&quot;Acme Corp&quot;</span>,</div>
        <div className="pl-3"><span className="text-white/50">&quot;amount&quot;</span>: <span className="text-white/70">12450.00</span>,</div>
        <div className="pl-3"><span className="text-white/50">&quot;date&quot;</span>: <span className="text-white/30">&quot;2026-03-01&quot;</span>,</div>
        <div className="pl-3"><span className="text-white/50">&quot;status&quot;</span>: <span className="text-white/40">&quot;pending_review&quot;</span></div>
        <div>{`}`}</div>
      </div>
    </div>
  );
}

function ReportingMockup() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true });
  return (
    <div ref={ref} className="bg-[#0a0a0a] rounded-lg border border-white/[0.06] p-4 mt-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] text-[#888]">Weekly Report, Auto-generated</span>
        <span className="text-[9px] text-white/40">Live</span>
      </div>
      <div className="space-y-2">
        {[
          { label: "Revenue", value: "$142K", pct: 78 },
          { label: "Costs", value: "$89K", pct: 52 },
          { label: "Margin", value: "37%", pct: 37 },
        ].map((row, i) => (
          <div key={row.label}>
            <div className="flex justify-between text-[10px] mb-1">
              <span className="text-[#888]">{row.label}</span>
              <span className="text-[#aaa]">{row.value}</span>
            </div>
            <div className="h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
              <motion.div
                className="h-full bg-white/20 rounded-full"
                initial={{ width: 0 }}
                animate={isInView ? { width: `${row.pct}%` } : {}}
                transition={{ duration: 1, delay: 0.3 + i * 0.15, ease: "easeOut" }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AIToolMockup() {
  return (
    <div className="bg-[#0a0a0a] rounded-lg border border-white/[0.06] p-4 mt-5">
      <div className="flex items-center gap-2 mb-3 bg-white/[0.05] rounded-lg px-3 py-2">
        <span className="text-[10px] text-[#555]">&#x2315;</span>
        <span className="text-[10px] text-[#888]">Which vendors had late deliveries in Q1?</span>
      </div>
      <div className="space-y-1.5 text-[10px]">
        {[
          { vendor: "Vendor #12", days: "4 days late", highlight: true },
          { vendor: "Vendor #38", days: "2 days late", highlight: true },
          { vendor: "Vendor #7", days: "1 day late", highlight: false },
        ].map((r) => (
          <div key={r.vendor} className="flex items-center justify-between px-2.5 py-1.5 bg-[#111] rounded">
            <span className="text-[#999]">{r.vendor}</span>
            <span className={r.highlight ? "text-white/50" : "text-[#666]"}>{r.days}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DataExtractionMockup() {
  return (
    <div className="bg-[#0a0a0a] rounded-lg border border-white/[0.06] p-4 mt-5">
      <div className="flex items-center gap-3 mb-3">
        <div className="flex-1">
          <div className="text-[9px] text-[#666] uppercase tracking-wider mb-1.5">Input</div>
          <div className="bg-[#111] rounded p-2 text-[10px] text-[#888] leading-relaxed">
            &quot;Please send 200 units of SKU-4421 to the Austin warehouse by Friday...&quot;
          </div>
        </div>
        <motion.div
          animate={{ x: [0, 4, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          className="text-[#555] text-lg"
        >
          &#x2192;
        </motion.div>
        <div className="flex-1">
          <div className="text-[9px] text-[#666] uppercase tracking-wider mb-1.5">Output</div>
          <div className="bg-[#111] rounded p-2 font-mono text-[10px] text-[#888] space-y-0.5">
            <div><span className="text-white/50">SKU</span>: 4421</div>
            <div><span className="text-white/50">Qty</span>: 200</div>
            <div><span className="text-white/50">Dest</span>: Austin</div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Process Pipeline Mockup                                           */
/* ------------------------------------------------------------------ */

function ProcessPipelineMockup() {
  const steps = [
    {
      num: "01",
      title: "Discovery",
      desc: "We start with a free 30-minute call to understand your problem deeply. No sales pitch, just a real conversation about what is broken, what is manual, and what success looks like.",
      details: ["30-minute free consultation", "Problem deep-dive", "Feasibility assessment", "No commitment required"],
    },
    {
      num: "02",
      title: "MVP",
      desc: "We define exactly what we will build, how long it will take, and what it will cost. You get a written proposal, a working proof of concept, and zero guesswork.",
      details: ["Written proposal & SOW", "Working MVP / proof of concept", "Transparent pricing & timeline", "Technical architecture outlined"],
    },
    {
      num: "03",
      title: "Build",
      desc: "We build your tool collaboratively. You are part of every decision, not a bystander. Regular async updates, working demos at every stage, and real-time feedback loops so nothing is ever a surprise.",
      details: ["You're included in every decision", "Working demos at every stage", "Real-time feedback loops", "No big reveal at the end"],
    },
    {
      num: "04",
      title: "Deliver",
      desc: "Working software, not a prototype. We handle deployment, documentation, and walk your team through everything. You own the code.",
      details: ["Production-ready deployment", "Full documentation", "Team walkthrough & training", "Complete code ownership"],
    },
    {
      num: "05",
      title: "Maintain",
      desc: "We do not disappear after delivery. Ongoing support to fix bugs, handle edge cases, and iterate as your needs evolve.",
      details: ["Bug fixes & monitoring", "Performance optimization", "Feature iterations", "Flexible maintenance plans"],
    },
  ];

  const [activeStep, setActiveStep] = useState(0);
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });
  const m = useIsMobile();

  return (
    <motion.div
      ref={ref}
      initial={m ? false : { opacity: 0, y: 40, scale: 0.97 }}
      animate={m ? undefined : (isInView ? { opacity: 1, y: 0, scale: 1 } : {})}
      transition={m ? undefined : { duration: 0.8, ease: "easeOut" }}
      className="rounded-2xl overflow-hidden max-w-6xl mx-auto"
      style={{
        background: "#0a0a0a",
        border: "1px solid rgba(255, 255, 255, 0.08)",
        boxShadow: "0 25px 60px rgba(0,0,0,0.4), 0 0 40px rgba(255,255,255,0.02)",
      }}
    >
      {/* Step selector */}
      <div className="px-4 md:px-8 pt-6 md:pt-10 pb-4 md:pb-6">
        <div className="flex items-center gap-2 md:gap-0">
          {steps.map((step, i) => (
            <button
              key={step.num}
              onClick={() => setActiveStep(i)}
              className="flex-1 group relative cursor-pointer"
            >
              {/* Progress bar segment */}
              <div className="h-1 rounded-full mx-1 mb-4 overflow-hidden bg-white/[0.06]">
                <motion.div
                  className="h-full rounded-full"
                  initial={false}
                  animate={{
                    width: i < activeStep ? "100%" : i === activeStep ? "100%" : "0%",
                    background: i <= activeStep ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.06)",
                  }}
                  transition={{ duration: 0.5, ease: "easeOut" }}
                />
              </div>
              <div className="text-center px-1">
                <span className={`text-[10px] md:text-xs font-mono block mb-1 transition-all duration-300 ${i === activeStep ? "text-white" : "text-white/20"}`}>
                  {step.num}
                </span>
                <span className={`text-[11px] md:text-sm font-medium block transition-all duration-300 ${i === activeStep ? "text-white" : "text-white/30 group-hover:text-white/50"}`}>
                  {step.title}
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="h-px bg-white/[0.06]" />

      {/* Content */}
      <div className="p-6 md:p-14 min-h-[280px] md:min-h-[380px]">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeStep}
            initial={{ opacity: 0, y: 20, filter: "blur(4px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: -10, filter: "blur(4px)" }}
            transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
          >
            <div className="flex items-center gap-4 mb-6">
              <span className="text-3xl md:text-5xl font-bold text-white/10 font-mono">{steps[activeStep].num}</span>
              <div className="h-px flex-1 bg-white/[0.06]" />
            </div>
            <h3 className="text-2xl md:text-4xl font-bold tracking-tight mb-4 md:mb-6">{steps[activeStep].title}</h3>
            <p className="text-sm md:text-lg text-[#999] leading-relaxed max-w-2xl mb-8 md:mb-12">{steps[activeStep].desc}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
              {steps[activeStep].details.map((detail, i) => (
                <motion.div
                  key={detail}
                  initial={{ opacity: 0, x: -15 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.15 + i * 0.08, duration: 0.4, ease: "easeOut" }}
                  className="flex items-center gap-3 px-4 md:px-6 py-3.5 md:py-5 rounded-xl"
                  style={{ background: "#111", border: "1px solid rgba(255,255,255,0.06)" }}
                >
                  <div className="w-2 h-2 rounded-full bg-white/30 shrink-0" />
                  <span className="text-xs md:text-sm text-white/70">{detail}</span>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </motion.div>
  );
}


/* ------------------------------------------------------------------ */
/*  Splash Screen                                                     */
/* ------------------------------------------------------------------ */

const X_WORDS  = ["automation", "intelligence", "efficiency", "excellence", "innovation"];
const X_COLORS = ["#f97316", "#a855f7", "#22d3ee", "#4ade80", "#f43f5e"];

// text-3xl = 1.875rem (30px) mobile · text-6xl = 3.75rem (60px) desktop
const L      = "font-medium text-3xl sm:text-5xl md:text-6xl lg:text-8xl xl:text-9xl leading-[1.1]";
const EASE   = [0.22, 1, 0.36, 1] as const;

function SplashScreen({ onDone }: { onDone: () => void }) {
  const m = useIsMobile();
  const [phase, setPhase] = useState<"strvx" | "expand" | "white" | "space" | "carousel">("strvx");
  const [wordIdx, setWordIdx] = useState(0);
  const [exiting, setExiting] = useState(false);
  const exitingRef = useRef(false);

  const dismiss = useCallback(() => {
    if (exitingRef.current) return;
    exitingRef.current = true;
    setExiting(true);
    setTimeout(onDone, 800);
  }, [onDone]);

  useEffect(() => {
    const t1 = setTimeout(() => setPhase("expand"),    700); // ie expands in (dim)
    const t2 = setTimeout(() => setPhase("white"),     950); // ie turns white
    const t3 = setTimeout(() => setPhase("carousel"), 1200); // gap opens + carousel begins together
    const t4 = setTimeout(dismiss, 10000);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (phase !== "carousel") return;
    const iv = setInterval(() => {
      setWordIdx(i => {
        if (i + 1 >= X_WORDS.length) {
          clearInterval(iv);
          setTimeout(dismiss, 200);
          return i;
        }
        return i + 1;
      });
    }, 700);
    return () => clearInterval(iv);
  }, [phase, dismiss]);

  const expanding  = phase !== "strvx";
  const ieWhite    = phase === "white" || phase === "space" || phase === "carousel";
  const spaced     = phase === "space" || phase === "carousel";
  const inCarousel = phase === "carousel";

  return (
    <motion.div
      onClick={dismiss}
      animate={{ opacity: exiting ? 0 : 1 }}
      transition={{ duration: 0.8, ease: "easeInOut" }}
      className="fixed inset-0 z-[100] bg-[#050505] flex items-center justify-center cursor-pointer select-none font-heading overflow-hidden px-4"
    >
      <div className="flex flex-col items-center md:flex-row md:items-end max-w-full">

        {/* strive group */}
        <motion.div
          layout
          className="flex items-end"
          animate={{ marginRight: spaced && !m ? "2rem" : "0rem" }}
          transition={{
            layout:      { duration: 1, ease: [0.16, 1, 0.3, 1] },
            marginRight: { duration: 1, ease: [0.16, 1, 0.3, 1] },
          }}
        >
          <span className={`${L} text-white`}>s</span>
          <span className={`${L} text-white`}>t</span>
          <span className={`${L} text-white`}>r</span>

          {/* 'i' */}
          <motion.span
            initial={{ maxWidth: "0rem", opacity: 0 }}
            animate={{
              maxWidth: expanding ? "8rem" : "0rem",
              opacity:  expanding ? 1 : 0,
              color:    ieWhite ? "rgba(255,255,255,1)" : "rgba(255,255,255,0.38)",
            }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            style={{ overflow: "hidden", display: "inline-block" }}
            className={L}
          >i</motion.span>

          <span className={`${L} text-white`}>v</span>

          {/* 'e' — 80ms stagger */}
          <motion.span
            initial={{ maxWidth: "0rem", opacity: 0 }}
            animate={{
              maxWidth: expanding ? "8rem" : "0rem",
              opacity:  expanding ? 1 : 0,
              color:    ieWhite ? "rgba(255,255,255,1)" : "rgba(255,255,255,0.38)",
            }}
            transition={{ duration: 0.5, ease: "easeOut", delay: 0.08 }}
            style={{ overflow: "hidden", display: "inline-block" }}
            className={L}
          >e</motion.span>
        </motion.div>

        {/* x → carousel */}
        <AnimatePresence mode="popLayout">
          {!inCarousel ? (
            <motion.span
              key="x"
              exit={{ opacity: 0, filter: "blur(10px)", transition: { duration: 0.45, ease: "easeIn" } }}
              className={`${L} text-white`}
            >x</motion.span>
          ) : (
            <motion.span
              key="carousel"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3 }}
              className="inline-flex relative overflow-hidden [mask-image:linear-gradient(to_bottom,transparent_0%,black_12%,black_95%,transparent_100%)]"
            >
              {/* Invisible sizer — holds width of longest word so layout doesn't jump */}
              <span className={`${L} whitespace-nowrap invisible`} aria-hidden="true">
                {X_WORDS.reduce((a, b) => a.length >= b.length ? a : b)}
              </span>
              <AnimatePresence mode="popLayout">
                <motion.span
                  key={wordIdx}
                  initial={{ y: "40%", opacity: 0 }}
                  animate={{ y: "0%", opacity: 1 }}
                  exit={{ y: "-40%", opacity: 0 }}
                  transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
                  style={{ color: X_COLORS[wordIdx % X_COLORS.length] }}
                  className={`${L} whitespace-nowrap absolute inset-0 text-center md:text-left`}
                >
                  {X_WORDS[wordIdx]}
                </motion.span>
              </AnimatePresence>
            </motion.span>
          )}
        </AnimatePresence>

      </div>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.18 }}
        transition={{ delay: 2.2, duration: 1 }}
        className="absolute bottom-8 text-[10px] text-white tracking-[0.25em] uppercase"
      >
        click to skip
      </motion.p>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Page                                                         */
/* ------------------------------------------------------------------ */

export default function Home() {
  const m = useIsMobile();
  const heroRef = useRef(null);
  const { scrollYProgress } = useScroll({ target: heroRef, offset: ["start start", "end start"] });
  const heroY = useTransform(scrollYProgress, [0, 1], [0, 120]);
  const heroOpacity = useTransform(scrollYProgress, [0, 0.8], [1, 0]);

  const [splashDone, setSplashDone] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem('strvx-splash-seen')) {
      setSplashDone(true);
    }
  }, []);

  const handleSplashDone = useCallback(() => {
    setSplashDone(true);
    sessionStorage.setItem('strvx-splash-seen', '1');
  }, []);

  return (
    <>
      <AnimatePresence>
        {!splashDone && <SplashScreen key="splash" onDone={handleSplashDone} />}
      </AnimatePresence>
    <main className="relative overflow-x-hidden usa-grid-bg">
      {/* Subtle radial glow behind hero */}
      <div className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[600px] bg-[radial-gradient(ellipse,rgba(255,255,255,0.04)_0%,transparent_65%)]" />

      {/* HERO */}
      <motion.section ref={heroRef} style={{ y: heroY, opacity: heroOpacity }} className="relative min-h-screen flex flex-col justify-center pt-24 md:pt-16 overflow-hidden">
        {/* Cycling video background */}
        <HeroVideoCarousel />
        {/* Edge vignette */}
        <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse at center, transparent 30%, rgba(5,5,5,0.85) 100%)" }} />
        <div className="absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-t from-[#050505] to-transparent" />

        <div className="relative z-10 text-center mb-8 md:mb-12 px-6 md:px-12 max-w-7xl mx-auto">
          <motion.div
            initial={m ? false : { opacity: 0, scale: 0.9 }}
            animate={m ? undefined : { opacity: 1, scale: 1 }}
            transition={m ? undefined : { duration: 0.5, delay: 0.2 }}
            className="inline-flex items-center border border-white/[0.15] rounded-full px-4 py-1.5 mb-5 md:mb-8 bg-black/30 backdrop-blur-sm"
          >
            <span className="text-[11px] text-white/70 tracking-[0.08em]">
              AI Consulting, San Diego
            </span>
          </motion.div>
          <motion.h1
            initial={m ? false : { opacity: 0, y: 20 }}
            animate={m ? undefined : { opacity: 1, y: 0 }}
            transition={m ? undefined : { duration: 0.6, delay: 0.3 }}
            className="text-4xl md:text-8xl lg:text-9xl font-medium leading-[1] tracking-tighter mb-5 md:mb-8 max-w-5xl mx-auto"
          >
            We build internal AI tools that{" "}
            <span className="text-white underline decoration-white/20 underline-offset-[6px]">work.</span>
          </motion.h1>
          <motion.p
            initial={m ? false : { opacity: 0, y: 20 }}
            animate={m ? undefined : { opacity: 1, y: 0 }}
            transition={m ? undefined : { duration: 0.6, delay: 0.45 }}
            className="text-base md:text-xl text-white/70 max-w-xl mx-auto leading-relaxed mb-8 md:mb-12"
          >
            For businesses with real technical problems and no time to solve them manually.
          </motion.p>
          <motion.div
            initial={m ? false : { opacity: 0, y: 20 }}
            animate={m ? undefined : { opacity: 1, y: 0 }}
            transition={m ? undefined : { duration: 0.6, delay: 0.6 }}
            className="flex flex-wrap gap-4 justify-center"
          >
            <Link
              href="/book"
              className="inline-block px-8 md:px-10 py-3 md:py-4 rounded-lg bg-white text-[#0a0a0a] text-xs md:text-sm font-bold tracking-[0.06em] uppercase hover:bg-white/90 hover:scale-[1.02] hover:shadow-[0_0_20px_rgba(150,150,255,0.15)] active:scale-[0.98] transition-all duration-200"
            >
              Book a free call
            </Link>
          </motion.div>
        </div>

        {/* Scroll prompt */}
        <motion.div
          initial={m ? false : { opacity: 0 }}
          animate={m ? undefined : { opacity: 1 }}
          transition={m ? undefined : { duration: 0.6, delay: 1.2 }}
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

      </motion.section>

      {/* WHAT WE DO */}
      <Section id="services" className="max-w-7xl mx-auto px-6 md:px-12 py-12 md:py-20 min-h-screen flex flex-col justify-center border-t border-white/[0.06] md:border-t-0">
        <motion.p
          variants={m ? mobileFade : slideFromLeft}
          initial={m ? false : "hidden"}
          whileInView={m ? undefined : "visible"}
          viewport={{ once: true }}
          className="text-[10px] md:text-xs font-semibold tracking-[0.2em] uppercase text-[#888] mb-3 md:mb-6"
        >
          What we do
        </motion.p>
        <motion.h2
          initial={m ? false : { opacity: 0, filter: "blur(10px)", y: 20 }}
          whileInView={m ? undefined : { opacity: 1, filter: "blur(0px)", y: 0 }}
          viewport={{ once: true }}
          transition={m ? undefined : { duration: 0.8, ease: "easeOut" }}
          className="text-2xl md:text-6xl font-bold tracking-tight leading-tight mb-4 md:mb-6"
        >
          AI that works while you sleep
        </motion.h2>
        <motion.p
          variants={m ? mobileFade : slideFromRight}
          initial={m ? false : "hidden"}
          whileInView={m ? undefined : "visible"}
          viewport={{ once: true }}
          className="text-sm md:text-lg text-[#999] max-w-xl leading-relaxed mb-8 md:mb-14"
        >
          From AI strategy to custom-built tools, we handle everything so you can focus on running your business.
        </motion.p>

        <motion.div
          variants={m ? mobileStagger : staggerScaleContainer}
          initial={m ? false : "hidden"}
          whileInView={m ? undefined : "visible"}
          viewport={{ once: true, margin: "-60px" }}
          className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-6"
        >
          {[
            { title: "Managed AI Agents", desc: "AI agents that handle your repetitive tasks around the clock. Hosted and secured by us, or deployed on your infrastructure." },
            { title: "AI Strategy & Roadmap", desc: "We map your workflows and show you exactly where AI will save time and money." },
            { title: "Custom AI Solutions", desc: "Dashboards, CRMs, pipelines, and integrations built for how your team actually works." },
            { title: "Full Maintenance & Support", desc: "We keep everything running. If something breaks at 2am, that is our problem, not yours." },
          ].map((item) => (
            <motion.div
              key={item.title}
              variants={m ? mobileFade : staggerScaleItem}
            >
              <div className="w-full h-full rounded-2xl border border-white/[0.08] bg-white/[0.03] transition-all duration-300 hover:scale-[1.03] hover:border-white/[0.15] hover:bg-white/[0.06] hover:shadow-[0_8px_30px_rgba(0,0,0,0.4)]">
                <div className="p-5 md:p-10">
                  <div
                    className="mb-3 md:mb-5"
                    style={{
                      height: "2px",
                      width: "48px",
                      background: "linear-gradient(90deg, rgba(255, 255, 255, 0.25), transparent)",
                      borderRadius: "1px",
                    }}
                  />
                  <h3 className="text-sm md:text-lg font-semibold mb-1 md:mb-3">{item.title}</h3>
                  <p className="text-xs md:text-base text-[#aaa] leading-relaxed">{item.desc}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </motion.div>

        {/* Why us — inline, no separate section */}
        <motion.div
          variants={m ? mobileStagger : staggerContainer}
          initial={m ? false : "hidden"}
          whileInView={m ? undefined : "visible"}
          viewport={{ once: true, margin: "-40px" }}
          className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6 mt-8 md:mt-12 pt-6 md:pt-10 border-t border-white/[0.08]"
        >
          {[
            { stat: "24/7", label: "Your agents never stop working" },
            { stat: "Weeks", label: "From kickoff to production" },
            { stat: "Yours", label: "You own every line of code" },
            { stat: "Zero", label: "Vendor lock-in" },
          ].map((item) => (
            <motion.div
              key={item.label}
              variants={m ? mobileFade : staggerItem}
              className="text-center"
            >
              <span className="block text-xl md:text-4xl font-bold tracking-tight mb-1 md:mb-2" style={{ color: "rgba(255, 255, 255, 0.9)" }}>{item.stat}</span>
              <span className="text-xs md:text-sm text-[#999]">{item.label}</span>
            </motion.div>
          ))}
        </motion.div>
      </Section>

      {/* WHO THIS IS FOR */}
      <Section className="max-w-7xl mx-auto px-6 md:px-12 py-12 md:py-20 min-h-screen flex flex-col justify-center border-t border-white/[0.06] md:border-t-0">
        <motion.p
          variants={m ? mobileFade : slideFromLeft}
          initial={m ? false : "hidden"}
          whileInView={m ? undefined : "visible"}
          viewport={{ once: true }}
          className="text-[10px] md:text-xs font-semibold tracking-[0.2em] uppercase text-[#888] mb-3 md:mb-6"
        >
          Who this is for
        </motion.p>
        <motion.h2
          initial={m ? false : { opacity: 0, filter: "blur(10px)", y: 20 }}
          whileInView={m ? undefined : { opacity: 1, filter: "blur(0px)", y: 0 }}
          viewport={{ once: true }}
          transition={m ? undefined : { duration: 0.8, ease: "easeOut" }}
          className="text-2xl md:text-6xl font-bold tracking-tight leading-tight mb-4 md:mb-6"
        >
          You have a real business with real problems.
        </motion.h2>
        <motion.p
          variants={m ? mobileFade : slideFromRight}
          initial={m ? false : "hidden"}
          whileInView={m ? undefined : "visible"}
          viewport={{ once: true }}
          className="text-sm md:text-lg text-[#999] max-w-xl leading-relaxed mb-8 md:mb-14"
        >
          We work best with teams that know what is broken but do not have the bandwidth to fix it themselves.
        </motion.p>

        <motion.div
          variants={m ? mobileStagger : staggerScaleContainer}
          initial={m ? false : "hidden"}
          whileInView={m ? undefined : "visible"}
          viewport={{ once: true, margin: "-60px" }}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-6"
        >
          {[
            { title: "Small businesses drowning in manual work", desc: "You are copy-pasting between spreadsheets, manually generating reports, or spending hours on tasks a machine could handle." },
            { title: "Growing teams that need better systems", desc: "You have outgrown your current tools but do not have the engineering team to build what you need." },
            { title: "Companies exploring AI for the first time", desc: "You know AI could help but are not sure where to start, and you do not want to waste money on the wrong solution." },
          ].map((item) => (
            <motion.div
              key={item.title}
              variants={m ? mobileFade : staggerScaleItem}
            >
              <div className="w-full h-full rounded-2xl border border-white/[0.08] bg-white/[0.03] transition-all duration-300 hover:scale-[1.03] hover:border-white/[0.15] hover:bg-white/[0.06] hover:shadow-[0_8px_30px_rgba(0,0,0,0.4)]">
                <div className="p-5 md:p-10">
                  <div
                    className="mb-3 md:mb-5"
                    style={{
                      height: "2px",
                      width: "48px",
                      background: "linear-gradient(90deg, rgba(255, 255, 255, 0.25), transparent)",
                      borderRadius: "1px",
                    }}
                  />
                  <h3 className="text-sm md:text-lg font-semibold mb-2 md:mb-4">{item.title}</h3>
                  <p className="text-xs md:text-base text-[#aaa] leading-relaxed">{item.desc}</p>
                </div>
              </div>
            </motion.div>
          ))}
        </motion.div>

        {/* Trust signals */}
        <motion.div
          variants={m ? mobileStagger : staggerContainer}
          initial={m ? false : "hidden"}
          whileInView={m ? undefined : "visible"}
          viewport={{ once: true, margin: "-40px" }}
          className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6 mt-8 md:mt-12 pt-6 md:pt-10 border-t border-white/[0.08]"
        >
          {[
            { signal: "Fixed scope", label: "No surprise invoices" },
            { signal: "You own it", label: "Full code ownership, no lock-in" },
            { signal: "San Diego", label: "Based in California, USA" },
            { signal: "Maintained", label: "Ongoing support after delivery" },
          ].map((item) => (
            <motion.div
              key={item.label}
              variants={m ? mobileFade : staggerItem}
              className="text-center"
            >
              <span className="block text-xl md:text-4xl font-bold tracking-tight mb-1 md:mb-2" style={{ color: "rgba(255, 255, 255, 0.9)" }}>{item.signal}</span>
              <span className="text-xs md:text-sm text-[#999]">{item.label}</span>
            </motion.div>
          ))}
        </motion.div>
      </Section>

      {/* HOW WE WORK */}
      <Section id="process" className="max-w-7xl mx-auto px-6 md:px-12 py-12 md:py-20 min-h-screen flex flex-col justify-center border-t border-white/[0.06] md:border-t-0">
        <motion.p variants={m ? mobileFade : slideFromLeft} initial={m ? false : "hidden"} whileInView={m ? undefined : "visible"} viewport={{ once: true }} className="text-[10px] md:text-xs font-semibold tracking-[0.2em] uppercase text-[#888] mb-3 md:mb-6">
          How we work
        </motion.p>
        <motion.h2 initial={m ? false : { opacity: 0, filter: "blur(10px)", y: 20 }} whileInView={m ? undefined : { opacity: 1, filter: "blur(0px)", y: 0 }} viewport={{ once: true }} transition={m ? undefined : { duration: 0.8, ease: "easeOut" }} className="text-2xl md:text-6xl font-bold tracking-tight leading-tight mb-4 md:mb-6">
          From problem to production in weeks.
        </motion.h2>
        <motion.p variants={m ? mobileFade : slideFromRight} initial={m ? false : "hidden"} whileInView={m ? undefined : "visible"} viewport={{ once: true }} className="text-sm md:text-lg text-[#999] max-w-xl leading-relaxed mb-8 md:mb-14">
          A clear, repeatable process so you always know where your project stands.
        </motion.p>
        <ProcessPipelineMockup />
      </Section>

      {/* TEAM */}
      <Section id="team" className="max-w-7xl mx-auto px-6 md:px-12 py-12 md:py-20 min-h-screen flex flex-col justify-center border-t border-white/[0.06] md:border-t-0">
        <motion.p variants={m ? mobileFade : slideFromLeft} initial={m ? false : "hidden"} whileInView={m ? undefined : "visible"} viewport={{ once: true }} className="text-[10px] md:text-xs font-semibold tracking-[0.2em] uppercase text-[#888] mb-3 md:mb-6">
          Team
        </motion.p>
        <motion.h2 initial={m ? false : { opacity: 0, filter: "blur(10px)", y: 20 }} whileInView={m ? undefined : { opacity: 1, filter: "blur(0px)", y: 0 }} viewport={{ once: true }} transition={m ? undefined : { duration: 0.8, ease: "easeOut" }} className="text-2xl md:text-6xl font-bold tracking-tight leading-tight mb-4 md:mb-6">
          Built by engineers, not salespeople.
        </motion.h2>
        <motion.p variants={m ? mobileFade : slideFromRight} initial={m ? false : "hidden"} whileInView={m ? undefined : "visible"} viewport={{ once: true }} className="text-sm md:text-lg text-[#999] max-w-xl leading-relaxed mb-8 md:mb-14">
          A small, senior team that builds. No account managers, no handoffs, no bloat.
        </motion.p>

        <motion.div
          variants={m ? mobileStagger : staggerScaleContainer}
          initial={m ? false : "hidden"}
          whileInView={m ? undefined : "visible"}
          viewport={{ once: true, margin: "-60px" }}
          className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-8 max-w-3xl mx-auto"
        >
          {[
            {
              name: "Alex Battikha",
              photo: "/cofounder-1.jpeg",
              imgClass: "object-contain",
              focus: "AI & Robotics",
              linkedin: "https://www.linkedin.com/in/alex-battikha/",
              bullets: [
                "Robotics Researcher, Johns Hopkins University",
                "Jacobs Scholar, UCSD Advanced Robotics & Controls Lab",
                "Bioengineering, AI Systems & Intelligent Automation",
                "FIRST Tech Challenge World Championship Finalist",
              ],
            },
            {
              name: "Nicolas Dos Santos",
              photo: "/cofounder-2.jpeg",
              focus: "Engineering & Strategy",
              linkedin: "https://www.linkedin.com/in/nicolas2007/",
              bullets: [
                "Software Engineer @ Datacurve (YC W24)",
                "Cyber Defense Operations, United States Air Force",
                "Built World Monitor: 420k concurrent users at peak",
                "Startup Operator & Technical Lead",
              ],
            },
          ].map((person, i) => (
            <motion.div
              key={i}
              variants={m ? mobileFade : staggerItem}
              whileHover={m ? {} : {
                y: -6,
                borderColor: "rgba(255, 255, 255, 0.15)",
                boxShadow: "0 8px 32px rgba(255, 255, 255, 0.06)",
              }}
              transition={{ duration: 0.25 }}
              className="rounded-xl border p-5 md:p-10 text-center flex flex-col"
              style={{
                background: "#0e0e0e",
                borderColor: "rgba(255, 255, 255, 0.08)",
              }}
            >
              <motion.div
                whileHover={m ? {} : { scale: 1.05 }}
                className="w-24 h-24 md:w-36 md:h-36 mx-auto mb-5 md:mb-8 rounded-full overflow-hidden"
                style={{
                  border: "2px solid rgba(255, 255, 255, 0.15)",
                }}
              >
                <Image
                  src={person.photo}
                  alt={person.name}
                  width={144}
                  height={144}
                  className={`w-full h-full rounded-full ${person.imgClass ?? "object-cover"}`}
                />
              </motion.div>
              <h3 className="text-base md:text-xl font-semibold mb-1">{person.name}</h3>
              <p className="text-[10px] md:text-xs text-[#aaa] tracking-[0.1em] uppercase mb-3 md:mb-5">{person.focus}</p>
              <ul className="text-left space-y-1.5 md:space-y-3 mb-4 md:mb-6">
                {person.bullets.map((b, bIdx) => (
                  <li key={b} className={`flex items-start gap-2 md:gap-2.5 text-xs md:text-sm leading-relaxed ${bIdx === 0 ? "text-[#ccc] font-medium" : "text-[#999]"}`}>
                    <span className={`w-1 h-1 md:w-1.5 md:h-1.5 rounded-full shrink-0 mt-[5px] md:mt-[7px] ${bIdx === 0 ? "bg-[#aaa]" : "bg-[#888]"}`} />
                    {b}
                  </li>
                ))}
              </ul>
              <div className="mt-auto pt-4 md:pt-6 border-t border-white/[0.08] flex justify-center">
                <a
                  href={person.linkedin}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#aaa] border border-white/[0.1] rounded-full p-2 hover:text-white hover:border-white/30 transition-colors inline-flex"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                  </svg>
                </a>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </Section>

      {/* CONTACT */}
      <Section id="contact" className="max-w-7xl mx-auto px-6 md:px-12 py-12 md:py-20 min-h-screen flex flex-col justify-center border-t border-white/[0.06] md:border-t-0">
        <div
          className="rounded-xl p-px"
          style={{ background: "#0e0e0e" }}
        >
        <div className="rounded-xl bg-[#fafafa] text-[#0a0a0a] p-8 md:p-16 text-center">
          <motion.p initial={m ? false : { opacity: 0 }} whileInView={m ? undefined : { opacity: 1 }} viewport={{ once: true }} transition={m ? undefined : { duration: 0.5 }} className="text-[10px] md:text-xs font-semibold tracking-[0.2em] uppercase text-[#555] mb-3 md:mb-6">
            Contact
          </motion.p>
          <motion.h2 initial={m ? false : { opacity: 0, scale: 0.9, filter: "blur(10px)" }} whileInView={m ? undefined : { opacity: 1, scale: 1, filter: "blur(0px)" }} viewport={{ once: true }} transition={m ? undefined : { duration: 0.8, ease: "easeOut" }} className="text-2xl md:text-6xl font-bold tracking-tight leading-tight mb-4 md:mb-6">
            Have a problem worth solving?
          </motion.h2>
          <motion.p initial={m ? false : { opacity: 0, y: 20 }} whileInView={m ? undefined : { opacity: 1, y: 0 }} viewport={{ once: true }} transition={m ? undefined : { duration: 0.6, delay: 0.2 }} className="text-sm md:text-lg text-[#555] mb-8 md:mb-12 max-w-lg mx-auto">
            Book a free 30-minute call or send us an email. No pitch, just an honest conversation about your problem.
          </motion.p>
          <motion.div initial={m ? false : { opacity: 0, y: 20 }} whileInView={m ? undefined : { opacity: 1, y: 0 }} viewport={{ once: true }} transition={m ? undefined : { duration: 0.6, delay: 0.4 }} className="flex flex-col sm:flex-row items-center justify-center gap-3 md:gap-6">
            <Link
              href="/book"
              className="inline-block px-8 md:px-10 py-3 md:py-4 rounded-lg bg-[#0a0a0a] text-[#fafafa] text-xs md:text-sm font-semibold tracking-[0.06em] uppercase hover:opacity-90 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200"
            >
              Book a free call
            </Link>
            <a
              href="mailto:strvxteam@gmail.com"
              className="inline-block px-6 md:px-8 py-3 md:py-4 rounded-lg border border-[#333] text-xs md:text-sm font-semibold tracking-[0.06em] uppercase text-[#333] hover:border-[#111] hover:text-[#111] transition-all duration-200"
            >
              strvxteam@gmail.com
            </a>
          </motion.div>
        </div>
        </div>
      </Section>

      {/* FOOTER */}
      <motion.footer
        initial={m ? false : "hidden"}
        whileInView={m ? undefined : "visible"}
        viewport={{ once: true }}
        variants={m ? mobileFade : fadeIn}
        className="px-6 md:px-12 pt-10 pb-8"
        style={{ borderTop: "1px solid rgba(255, 255, 255, 0.06)" }}
      >
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6 relative">
          <div className="flex flex-col items-center md:items-start gap-1">
            <span className="text-xs font-semibold tracking-[0.12em] uppercase">strvx</span>
            <span className="text-xs text-[#888]">&copy; 2026. San Diego, CA.</span>
          </div>
          <nav className="flex items-center gap-6 md:absolute md:left-1/2 md:-translate-x-1/2">
            <a href="#services" className="text-xs text-[#888] hover:text-white transition-colors">Services</a>
            <a href="#process" className="text-xs text-[#888] hover:text-white transition-colors">Process</a>
            <Link href="/book" className="text-xs text-[#888] hover:text-white transition-colors">Book a call</Link>
          </nav>
          <a
            href="https://www.linkedin.com/company/strvx"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#888] hover:text-white transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
              <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
            </svg>
          </a>
        </div>
      </motion.footer>
    </main>
    </>
  );
}
