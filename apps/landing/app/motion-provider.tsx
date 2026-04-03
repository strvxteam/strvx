"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { MotionConfig } from "framer-motion";

const MobileContext = createContext(false);
const ReducedMotionContext = createContext(false);

export function MotionProvider({ children }: { children: React.ReactNode }) {
  const [isMobile, setIsMobile] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  return (
    <MotionConfig reducedMotion={reducedMotion ? "always" : "never"}>
      <MobileContext.Provider value={isMobile}>
        <ReducedMotionContext.Provider value={reducedMotion}>
          {children}
        </ReducedMotionContext.Provider>
      </MobileContext.Provider>
    </MotionConfig>
  );
}

export function useIsMobile() {
  return useContext(MobileContext);
}

export function useReducedMotion() {
  return useContext(ReducedMotionContext);
}
