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
        className="absolute inset-0"
        style={{ background: `rgba(5,5,5,${overlay})` }}
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 30%, rgba(5,5,5,0.7) 100%)",
        }}
      />
      <div className="absolute top-0 left-0 right-0 h-40 bg-gradient-to-b from-[#050505] to-transparent z-[1]" />
      <div className="absolute bottom-0 left-0 right-0 h-40 bg-gradient-to-t from-[#050505] to-transparent z-[1]" />

      {children && (
        <div className="relative z-10 h-full flex items-center justify-center px-6">
          {children}
        </div>
      )}
    </section>
  );
}

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

export default function SeaPage() {
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
    <main className="relative overflow-x-hidden bg-[#050505]">

      {/* HERO — MBS + ArtScience */}
      <section ref={heroRef} className="relative h-screen overflow-hidden">
        <motion.div
          className="absolute inset-[-10%]"
          style={{
            backgroundImage:
              "url('https://images.unsplash.com/photo-1508062878650-88b52897f298?w=1920&q=85&auto=format')",
            backgroundSize: "cover",
            backgroundPosition: "center",
            scale: heroScale,
          }}
        />
        <div className="absolute inset-0 bg-[#050505]/40" />
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse at center, transparent 30%, rgba(5,5,5,0.75) 100%)",
          }}
        />
        <div className="absolute bottom-0 left-0 right-0 h-48 bg-gradient-to-t from-[#050505] to-transparent" />

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
              Powering Southeast Asian Enterprise
            </motion.p>

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

      {/* SECTION 2 — Singapore skyline / financial district */}
      <CinematicSection
        src="https://images.unsplash.com/photo-1525625293386-3f8f99389edd?w=1920&q=85&auto=format"
        overlay={0.55}
      >
        <div className="text-center max-w-3xl">
          <WordReveal
            text="Enterprise AI built for the speed and complexity of Southeast Asian markets."
            className="text-xl md:text-3xl lg:text-4xl text-white/90 font-light leading-relaxed tracking-wide"
          />
        </div>
      </CinematicSection>

      {/* SECTION 3 — Aerial Singapore night */}
      <CinematicSection
        src="https://images.unsplash.com/photo-1496939376851-89342e90adcd?w=1920&q=85&auto=format"
        position="center 60%"
        overlay={0.5}
      >
        <div className="text-center max-w-3xl">
          <RevealText>
            <p
              className="text-xl md:text-3xl lg:text-4xl text-white/90 font-light leading-relaxed tracking-wide"
              style={{ textShadow: "0 2px 30px rgba(0,0,0,0.8)" }}
            >
              From document processing to decision intelligence.
            </p>
          </RevealText>
          <RevealText delay={0.3}>
            <p
              className="text-xl md:text-3xl lg:text-4xl text-white font-light leading-relaxed tracking-wide mt-4"
              style={{ textShadow: "0 0 30px rgba(0,0,0,1), 0 0 60px rgba(0,0,0,0.8), 0 2px 4px rgba(0,0,0,0.9)" }}
            >
              Multilingual. Multi-market. Production-ready.
            </p>
          </RevealText>
        </div>
      </CinematicSection>

      {/* SECTION 5 — Regional presence */}
      <CinematicSection
        src="https://images.unsplash.com/photo-1565967511849-76a60a516170?w=1920&q=85&auto=format"
        overlay={0.7}
      >
        <div className="text-center max-w-3xl">
          <RevealText>
            <p className="text-4xl md:text-6xl lg:text-7xl font-bold text-white tracking-tight">
              Singapore.
            </p>
          </RevealText>
          <RevealText delay={0.15}>
            <p className="text-4xl md:text-6xl lg:text-7xl font-bold text-white/70 tracking-tight">
              Jakarta.
            </p>
          </RevealText>
          <RevealText delay={0.3}>
            <p className="text-4xl md:text-6xl lg:text-7xl font-bold text-white/40 tracking-tight">
              Bangkok.
            </p>
          </RevealText>
          <RevealText delay={0.6}>
            <p
              className="text-base md:text-xl font-medium text-white tracking-[0.2em] uppercase mt-12"
              style={{ textShadow: "0 0 30px rgba(0,0,0,1), 0 0 60px rgba(0,0,0,0.8)" }}
            >
              US-headquartered. Internationally embedded.
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
          strvx &middot; San Diego, CA &middot; Singapore
        </span>
      </footer>
    </main>
  );
}
