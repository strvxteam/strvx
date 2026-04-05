"use client";

import Link from "next/link";
import { useRef } from "react";
import { motion, useInView, type Variants } from "framer-motion";
import { useIsMobile } from "../motion-provider";

const staggerContainer: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.1 } },
};

const scaleItem: Variants = {
  hidden: { opacity: 0, scale: 0.9, filter: "blur(6px)" },
  visible: {
    opacity: 1,
    scale: 1,
    filter: "blur(0px)",
    transition: { duration: 0.5, ease: "easeOut" },
  },
};

const fadeUpItem: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: "easeOut" },
  },
};

const mobileFade: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.3 } },
};

const mobileStagger: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.05 } },
};

function Section({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });
  const m = useIsMobile();
  return (
    <motion.section
      ref={ref}
      initial={m ? false : { opacity: 0, y: 40 }}
      animate={m ? undefined : (isInView ? { opacity: 1, y: 0 } : {})}
      transition={m ? undefined : { duration: 0.7, ease: "easeOut" }}
      className={className}
    >
      {children}
    </motion.section>
  );
}

export default function ServicesPage() {
  const m = useIsMobile();

  return (
    <main className="min-h-screen">
      {/* Header */}
      <section className="max-w-7xl mx-auto px-6 md:px-12 pt-20 md:pt-32 pb-16">
        <motion.p
          initial={m ? false : { opacity: 0, x: -30 }}
          animate={m ? undefined : { opacity: 1, x: 0 }}
          transition={m ? undefined : { duration: 0.5 }}
          className="text-xs font-semibold tracking-[0.2em] uppercase text-[#888] mb-6"
        >
          Services
        </motion.p>
        <motion.h1
          initial={m ? false : { opacity: 0, filter: "blur(10px)", y: 20 }}
          animate={m ? undefined : { opacity: 1, filter: "blur(0px)", y: 0 }}
          transition={m ? undefined : { duration: 0.8, ease: "easeOut" }}
          className="text-3xl md:text-7xl font-bold tracking-tight leading-[0.95] mb-6"
        >
          AI that works while you sleep.
        </motion.h1>
        <motion.p
          initial={m ? false : { opacity: 0, y: 20 }}
          animate={m ? undefined : { opacity: 1, y: 0 }}
          transition={m ? undefined : { duration: 0.6, delay: 0.2 }}
          className="text-base text-[#666] max-w-2xl leading-relaxed"
        >
          We deploy AI agents that handle real tasks 24/7, build the internal
          tools your team is missing, and show you exactly where automation will
          actually move the needle.
        </motion.p>
      </section>

      {/* Services */}
      <section className="max-w-7xl mx-auto px-6 md:px-12 pb-20">
        <div className="flex flex-col gap-12">

          {/* 01 — Managed AI Agents */}
          <Section>
            <div className="rounded-xl bg-[#111] border border-white/[0.06] p-8 md:p-12">
              <span className="text-[11px] font-semibold tracking-widest text-[#555] mb-2 block">01</span>
              <h2 className="text-2xl md:text-3xl font-bold tracking-tight mb-4">
                Managed AI Agents
              </h2>
              <p className="text-sm text-[#888] leading-relaxed mb-8">
                AI agents that handle your repetitive tasks around the clock.
                We offer two ways to get started — pick the one that fits your business.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {[
                  {
                    label: "Managed",
                    desc: "We host and run your AI agents on our secure servers. You get a dashboard to monitor your tasks — no setup, no infrastructure to manage. Just tell us what to automate and we handle the rest.",
                    highlights: [
                      "Up and running in days",
                      "No infrastructure to manage",
                      "Secure monitoring dashboard",
                      "We maintain everything",
                    ],
                  },
                  {
                    label: "In-House",
                    desc: "We install and configure AI agents directly on your company's systems. Your data never leaves your building. Ideal for teams with strict privacy requirements or existing IT infrastructure.",
                    highlights: [
                      "Runs on your own systems",
                      "Complete data privacy",
                      "Full team training included",
                      "Ongoing support available",
                    ],
                  },
                ].map((option) => (
                  <div
                    key={option.label}
                    className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-6"
                  >
                    <span className="inline-block text-[10px] tracking-[0.15em] uppercase bg-white/[0.06] text-[#aaa] px-3 py-1 rounded-md mb-4">
                      {option.label}
                    </span>
                    <p className="text-sm text-[#888] leading-relaxed mb-6">
                      {option.desc}
                    </p>
                    <motion.div
                      variants={m ? mobileStagger : staggerContainer}
                      initial={m ? false : "hidden"}
                      whileInView={m ? undefined : "visible"}
                      viewport={{ once: true }}
                      className="grid grid-cols-1 sm:grid-cols-2 gap-2"
                    >
                      {option.highlights.map((h) => (
                        <motion.div
                          key={h}
                          variants={m ? mobileFade : scaleItem}
                          className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg bg-white/[0.03] border border-white/[0.04]"
                        >
                          <div className="w-1.5 h-1.5 rounded-full bg-white/40 shrink-0" />
                          <span className="text-[12px] text-[#999]">{h}</span>
                        </motion.div>
                      ))}
                    </motion.div>
                  </div>
                ))}
              </div>
            </div>
          </Section>

          {/* 02 — AI Strategy & Roadmap */}
          <Section>
            <div className="rounded-xl bg-[#111] border border-white/[0.06] p-8 md:p-12">
              <span className="text-[11px] font-semibold tracking-widest text-[#555] mb-2 block">02</span>
              <h2 className="text-2xl md:text-3xl font-bold tracking-tight mb-4">
                AI Strategy & Roadmap
              </h2>
              <p className="text-sm text-[#888] leading-relaxed mb-10">
                Not sure where AI fits in your business? We walk you through a structured
                process to find the highest-impact opportunities and build a clear plan to act on them.
              </p>
              <motion.div
                variants={m ? mobileStagger : staggerContainer}
                initial={m ? false : "hidden"}
                whileInView={m ? undefined : "visible"}
                viewport={{ once: true }}
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
              >
                {[
                  {
                    step: "01",
                    title: "Discover",
                    desc: "We learn how your team works day-to-day — what's manual, what's slow, and what's costing you money.",
                  },
                  {
                    step: "02",
                    title: "Identify",
                    desc: "We pinpoint the workflows where AI can make a real difference and filter out the ones where it can't.",
                  },
                  {
                    step: "03",
                    title: "Prioritize",
                    desc: "We rank every opportunity by impact and effort so you know exactly what to tackle first.",
                  },
                  {
                    step: "04",
                    title: "Deliver",
                    desc: "You get a clear roadmap with timelines, expected ROI, and a recommended path forward.",
                  },
                ].map((phase) => (
                  <motion.div
                    key={phase.step}
                    variants={m ? mobileFade : fadeUpItem}
                    className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-5 flex flex-col"
                  >
                    <span className="text-[10px] font-semibold tracking-widest text-[#555] mb-3">
                      Phase {phase.step}
                    </span>
                    <h3 className="text-sm font-bold mb-2">{phase.title}</h3>
                    <p className="text-[12px] text-[#888] leading-relaxed">{phase.desc}</p>
                  </motion.div>
                ))}
              </motion.div>
            </div>
          </Section>

          {/* 03 — Custom AI Solutions */}
          <Section>
            <div className="rounded-xl bg-[#111] border border-white/[0.06] p-8 md:p-12">
              <span className="text-[11px] font-semibold tracking-widest text-[#555] mb-2 block">03</span>
              <h2 className="text-2xl md:text-3xl font-bold tracking-tight mb-4">
                Custom AI Solutions
              </h2>
              <p className="text-sm text-[#888] leading-relaxed mb-10">
                Every business works differently. We build AI-powered tools tailored to how your
                team actually operates. Here are some of the things we build — but if you
                need something else, we can build that too.
              </p>
              <motion.div
                variants={m ? mobileStagger : staggerContainer}
                initial={m ? false : "hidden"}
                whileInView={m ? undefined : "visible"}
                viewport={{ once: true }}
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
              >
                {[
                  {
                    title: "Internal Dashboards",
                    desc: "Real-time views of your data, KPIs, and operations — built for your team, not a generic template.",
                  },
                  {
                    title: "Custom CRMs",
                    desc: "A CRM that matches how you actually sell and manage clients — not the other way around.",
                  },
                  {
                    title: "Data Pipelines",
                    desc: "Automated flows that connect your tools, clean your data, and keep everything in sync.",
                  },
                  {
                    title: "AI Chatbots & Assistants",
                    desc: "Customer-facing or internal assistants trained on your business data and processes.",
                  },
                  {
                    title: "System Integrations",
                    desc: "Connect the tools you already use into one seamless workflow — no more copy-pasting between apps.",
                  },
                  {
                    title: "Workflow Automation",
                    desc: "Turn repetitive multi-step processes into one-click automations that run themselves.",
                  },
                ].map((item) => (
                  <motion.div
                    key={item.title}
                    variants={m ? mobileFade : scaleItem}
                    className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-5"
                  >
                    <h3 className="text-sm font-bold mb-2">{item.title}</h3>
                    <p className="text-[12px] text-[#888] leading-relaxed">{item.desc}</p>
                  </motion.div>
                ))}
              </motion.div>
              <p className="text-xs text-[#555] mt-6">
                You own everything we build — the code, the infrastructure, the documentation. No lock-in.
              </p>
            </div>
          </Section>

          {/* 04 — Full Maintenance & Support */}
          <Section>
            <div className="rounded-xl bg-[#111] border border-white/[0.06] p-8 md:p-12">
              <span className="text-[11px] font-semibold tracking-widest text-[#555] mb-2 block">04</span>
              <h2 className="text-2xl md:text-3xl font-bold tracking-tight mb-4">
                Full Maintenance & Support
              </h2>
              <p className="text-sm text-[#888] leading-relaxed mb-10">
                We don&apos;t hand you a product and disappear. Every system we build comes with
                ongoing support. Here&apos;s what we take care of so you don&apos;t have to.
              </p>
              <motion.div
                variants={m ? mobileStagger : staggerContainer}
                initial={m ? false : "hidden"}
                whileInView={m ? undefined : "visible"}
                viewport={{ once: true }}
                className="grid grid-cols-1 sm:grid-cols-2 gap-4"
              >
                {[
                  {
                    title: "Monitoring & Uptime",
                    desc: "We watch your systems around the clock. If something goes down, we know before you do and we fix it.",
                  },
                  {
                    title: "Bug Fixes & Patches",
                    desc: "Something not working right? We diagnose and fix issues fast — no waiting in a support queue.",
                  },
                  {
                    title: "Performance Optimization",
                    desc: "As your usage grows, we make sure your tools stay fast. We tune, optimize, and scale as needed.",
                  },
                  {
                    title: "Feature Iterations",
                    desc: "Your needs will evolve. We add new features, adjust workflows, and improve your tools over time.",
                  },
                  {
                    title: "Security Updates",
                    desc: "We keep your systems patched and secure against new vulnerabilities — no action required on your end.",
                  },
                  {
                    title: "Priority Support",
                    desc: "If something breaks at 2am, that's our problem — not yours. Direct access to the team that built it.",
                  },
                ].map((item) => (
                  <motion.div
                    key={item.title}
                    variants={m ? mobileFade : fadeUpItem}
                    className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-5"
                  >
                    <h3 className="text-sm font-bold mb-2">{item.title}</h3>
                    <p className="text-[12px] text-[#888] leading-relaxed">{item.desc}</p>
                  </motion.div>
                ))}
              </motion.div>
            </div>
          </Section>

        </div>
      </section>

      {/* CTA */}
      <section className="max-w-7xl mx-auto px-6 md:px-12 py-20 md:py-32">
        <div className="rounded-xl bg-[#fafafa] text-[#0a0a0a] p-12 md:p-16 text-center">
          <h2 className="text-3xl md:text-4xl font-bold tracking-tight mb-4">
            Not sure what you need?
          </h2>
          <p className="text-sm text-[#555] mb-8">
            Start with a free call. We&apos;ll tell you what&apos;s worth automating.
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
