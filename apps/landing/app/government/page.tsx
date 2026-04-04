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

/* ------------------------------------------------------------------ */
/*  Spring config                                                     */
/* ------------------------------------------------------------------ */
const smooth = { stiffness: 80, damping: 30, mass: 0.5 };

/* ------------------------------------------------------------------ */
/*  Full-viewport cinematic section with deep parallax                */
/* ------------------------------------------------------------------ */

function CinematicSection({
  src,
  position = "center",
  overlay = 0.5,
  children,
}: {
  src: string;
  position?: string;
  overlay?: number;
  children?: React.ReactNode;
}) {
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });

  const rawY = useTransform(scrollYProgress, [0, 1], ["-15%", "15%"]);
  const rawScale = useTransform(scrollYProgress, [0, 0.5, 1], [1.15, 1.05, 1.15]);
  const y = useSpring(rawY, smooth);
  const scale = useSpring(rawScale, smooth);

  return (
    <section ref={ref} className="relative h-screen overflow-hidden">
      <motion.div
        className="absolute inset-[-15%]"
        style={{
          y,
          scale,
          backgroundImage: `url('${src}')`,
          backgroundSize: "cover",
          backgroundPosition: position,
        }}
      />
      <div
        className="absolute inset-0 transition-opacity duration-700"
        style={{ background: `rgba(3,8,16,${overlay})` }}
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 30%, rgba(3,8,16,0.7) 100%)",
        }}
      />
      {/* Top + bottom fade for seamless blending */}
      <div className="absolute top-0 left-0 right-0 h-40 bg-gradient-to-b from-[#030810] to-transparent z-[1]" />
      <div className="absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-t from-[#030810] to-transparent z-[1]" />

      {children && (
        <div className="relative z-10 h-full flex items-center justify-center px-6">
          {children}
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Animated text that fades + blurs in on scroll                     */
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
/*  Staggered word reveal                                             */
/* ------------------------------------------------------------------ */

function WordReveal({
  text,
  className = "",
}: {
  text: string;
  className?: string;
}) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-15%" });
  const words = text.split(" ");

  return (
    <p ref={ref} className={className}>
      {words.map((word, i) => (
        <motion.span
          key={i}
          className="inline-block mr-[0.3em]"
          initial={{ opacity: 0, y: 20 }}
          animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
          transition={{
            duration: 0.5,
            delay: i * 0.06,
            ease: [0.25, 0.1, 0.25, 1],
          }}
        >
          {word}
        </motion.span>
      ))}
    </p>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                              */
/* ------------------------------------------------------------------ */

export default function GovernmentPage() {
  const heroRef = useRef(null);
  const { scrollYProgress: heroProgress } = useScroll({
    target: heroRef,
    offset: ["start start", "end start"],
  });
  const heroOpacity = useSpring(
    useTransform(heroProgress, [0, 0.8], [1, 0]),
    smooth
  );
  const heroScale = useSpring(
    useTransform(heroProgress, [0, 1], [1, 0.95]),
    smooth
  );

  return (
    <main className="relative overflow-x-hidden bg-[#030810]">
      {/* HERO — Earth from orbit */}
      <section
        ref={heroRef}
        className="relative h-screen overflow-hidden"
      >
        <motion.div
          className="absolute inset-[-10%]"
          style={{
            backgroundImage:
              "url('https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=1920&q=85&auto=format')",
            backgroundSize: "cover",
            backgroundPosition: "center 60%",
            scale: heroScale,
          }}
        />
        <div className="absolute inset-0 bg-[#030810]/35" />
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse at center, transparent 30%, rgba(3,8,16,0.75) 100%)",
          }}
        />
        <div className="absolute bottom-0 left-0 right-0 h-48 bg-gradient-to-t from-[#030810] to-transparent" />

        <motion.div
          className="relative z-10 h-full flex items-center justify-center px-6"
          style={{ opacity: heroOpacity }}
        >
          <div className="text-center">
            <motion.h1
              initial={{ opacity: 0, y: 30, filter: "blur(12px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={{
                duration: 1,
                delay: 0.2,
                ease: [0.25, 0.1, 0.25, 1],
              }}
              className="text-4xl md:text-7xl lg:text-8xl font-bold tracking-tight leading-[1.05] text-white max-w-4xl mx-auto"
              style={{ textShadow: "0 4px 40px rgba(0,0,0,0.5)" }}
            >
              AI Powered Workflow Automation
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.8 }}
              className="text-base md:text-xl font-medium tracking-[0.25em] uppercase text-white mt-10"
              style={{
                textShadow:
                  "0 0 30px rgba(0,0,0,1), 0 0 60px rgba(0,0,0,0.8), 0 2px 4px rgba(0,0,0,0.9)",
              }}
            >
              Supporting National Security
            </motion.p>

            {/* Scroll indicator */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.3 }}
              transition={{ delay: 2, duration: 1 }}
              className="mt-16"
            >
              <motion.div
                animate={{ y: [0, 8, 0] }}
                transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
                className="w-5 h-8 mx-auto rounded-full border border-white/20 flex items-start justify-center pt-1.5"
              >
                <div className="w-1 h-1.5 rounded-full bg-white/40" />
              </motion.div>
            </motion.div>
          </div>
        </motion.div>
      </section>

      {/* SECTION 2 — Data center with text */}
      <CinematicSection
        src="https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=1920&q=85&auto=format"
        overlay={0.6}
      >
        <div className="text-center max-w-3xl">
          <WordReveal
            text="Secure infrastructure. Zero-trust architecture. Built by engineers with clearance and conviction."
            className="text-xl md:text-3xl lg:text-4xl text-white/90 font-light leading-relaxed tracking-wide"
          />
        </div>
      </CinematicSection>

      {/* SECTION 3 — Real product screenshot */}
      <section className="relative min-h-screen flex items-center justify-center py-12 px-2 overflow-hidden">
        {/* Ambient glow */}
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1000px] h-[600px] pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse, rgba(11,132,255,0.1) 0%, transparent 70%)",
          }}
        />
        <RevealText>
          <div
            className="w-[85vw] max-w-[1200px] mx-auto rounded-xl overflow-hidden"
            style={{
              border: "1px solid rgba(0,180,255,0.12)",
              boxShadow:
                "0 0 120px rgba(0,120,255,0.08), 0 40px 80px rgba(0,0,0,0.5)",
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
      </section>

      {/* SECTION 4 — Satellite with text */}
      <CinematicSection
        src="https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?w=1920&q=85&auto=format"
        position="center 40%"
        overlay={0.45}
      >
        <div className="text-center max-w-3xl">
          <RevealText>
            <p
              className="text-xl md:text-3xl lg:text-4xl text-white/90 font-light leading-relaxed tracking-wide"
              style={{ textShadow: "0 2px 30px rgba(0,0,0,0.8)" }}
            >
              From document intelligence to decision support.
            </p>
          </RevealText>
          <RevealText delay={0.3}>
            <p
              className="text-xl md:text-3xl lg:text-4xl text-white/60 font-light leading-relaxed tracking-wide mt-4"
              style={{ textShadow: "0 2px 30px rgba(0,0,0,0.8)" }}
            >
              AI that operates at the speed of mission.
            </p>
          </RevealText>
        </div>
      </CinematicSection>

      {/* SECTION 5 — Cyber / Network */}
      <CinematicSection
        src="https://images.unsplash.com/photo-1550751827-4bd374c3f58b?w=1920&q=85&auto=format"
        position="center 40%"
        overlay={0.7}
      >
        <div className="text-center max-w-3xl">
          <RevealText>
            <p className="text-4xl md:text-6xl lg:text-7xl font-bold text-white tracking-tight">
              Air-gapped.
            </p>
          </RevealText>
          <RevealText delay={0.15}>
            <p className="text-4xl md:text-6xl lg:text-7xl font-bold text-white/70 tracking-tight">
              Auditable.
            </p>
          </RevealText>
          <RevealText delay={0.3}>
            <p className="text-4xl md:text-6xl lg:text-7xl font-bold text-white/40 tracking-tight">
              Automated.
            </p>
          </RevealText>
          <RevealText delay={0.6}>
            <p
              className="text-base md:text-xl font-medium text-white tracking-[0.2em] uppercase mt-12"
              style={{ textShadow: "0 0 30px rgba(0,0,0,1), 0 0 60px rgba(0,0,0,0.8)" }}
            >
              Your data never leaves your infrastructure
            </p>
          </RevealText>
        </div>
      </CinematicSection>

      {/* CONTACT */}
      <section className="relative h-[50vh] flex items-center justify-center px-6">
        <RevealText>
          <a
            href="mailto:strvxteam@gmail.com"
            className="text-base md:text-lg tracking-[0.15em] uppercase text-white/50 hover:text-white transition-colors duration-500"
          >
            strvxteam@gmail.com
          </a>
        </RevealText>
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
