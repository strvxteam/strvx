"use client";

import { useEffect, useRef, useState } from "react";

const VIDEOS = [
  { src: "/hero-2.mp4", playbackRate: 1.5, startAt: 0, duration: 5000 },
  { src: "/hero-3.mp4", playbackRate: 1, startAt: 2, duration: 2500 },
  { src: "/hero-1.mp4", playbackRate: 1, startAt: 3, duration: 2500 },
];

export function HeroVideoCarousel() {
  const [activeIndex, setActiveIndex] = useState(0);
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  // Schedule next clip based on current clip's duration
  useEffect(() => {
    timerRef.current = setTimeout(() => {
      setActiveIndex((prev) => (prev + 1) % VIDEOS.length);
    }, VIDEOS[activeIndex].duration);
    return () => clearTimeout(timerRef.current);
  }, [activeIndex]);

  // Play active, pre-seek next
  useEffect(() => {
    videoRefs.current.forEach((video, i) => {
      if (!video) return;
      if (i === activeIndex) {
        video.playbackRate = VIDEOS[i].playbackRate;
        video.play().catch(() => {});
      } else {
        video.pause();
        // Pre-seek the next video so it's ready for instant cut
        const nextIndex = (activeIndex + 1) % VIDEOS.length;
        if (i === nextIndex) {
          video.currentTime = VIDEOS[i].startAt;
        }
      }
    });
  }, [activeIndex]);

  // Set initial start positions on mount
  useEffect(() => {
    videoRefs.current.forEach((video, i) => {
      if (video) {
        video.currentTime = VIDEOS[i].startAt;
      }
    });
  }, []);

  return (
    <div className="absolute inset-0 overflow-hidden bg-[#050505]">
      {VIDEOS.map((vid, i) => (
        <video
          key={vid.src}
          ref={(el) => { videoRefs.current[i] = el; }}
          src={vid.src}
          muted
          playsInline
          loop
          preload="auto"
          className="absolute inset-0 w-full h-full object-cover"
          style={{
            filter: "saturate(0.3) brightness(0.45)",
            visibility: i === activeIndex ? "visible" : "hidden",
          }}
        />
      ))}
      {/* Dark overlay for text readability */}
      <div className="absolute inset-0 bg-[#050505]/40" />
    </div>
  );
}
