"use client";

import { createContext, useContext, useSyncExternalStore } from "react";
import { MotionConfig } from "framer-motion";

const MobileContext = createContext(false);
const ReducedMotionContext = createContext(false);

function subscribeResize(cb: () => void) {
  window.addEventListener("resize", cb);
  return () => window.removeEventListener("resize", cb);
}

function subscribeMediaQuery(query: string) {
  return (cb: () => void) => {
    const mq = window.matchMedia(query);
    mq.addEventListener("change", cb);
    return () => mq.removeEventListener("change", cb);
  };
}

export function MotionProvider({ children }: { children: React.ReactNode }) {
  const isMobile = useSyncExternalStore(
    subscribeResize,
    () => window.innerWidth < 768,
    () => true,
  );

  const reducedMotion = useSyncExternalStore(
    subscribeMediaQuery("(prefers-reduced-motion: reduce)"),
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  );

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
