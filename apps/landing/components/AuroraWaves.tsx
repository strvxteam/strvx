"use client";

import { useEffect, useRef } from "react";

// Simplex-inspired noise using sine combinations (no dependencies)
function noise(x: number, y: number, t: number): number {
  return (
    Math.sin(x * 0.8 + t * 0.4) * 0.5 +
    Math.sin(y * 0.6 + t * 0.3) * 0.5 +
    Math.sin((x + y) * 0.5 + t * 0.5) * 0.3 +
    Math.sin(x * 1.2 - t * 0.2) * 0.2 +
    Math.sin(y * 1.4 + t * 0.6) * 0.15
  );
}

const WAVE_COLORS = [
  { r: 99, g: 102, b: 241 },   // indigo
  { r: 139, g: 92, b: 246 },   // purple
  { r: 59, g: 130, b: 246 },   // blue
  { r: 34, g: 211, b: 238 },   // cyan
];

export function AuroraWaves() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let w: number;
    let h: number;

    function resize() {
      const dpr = window.devicePixelRatio || 1;
      w = canvas!.offsetWidth;
      h = canvas!.offsetHeight;
      canvas!.width = w * dpr;
      canvas!.height = h * dpr;
      ctx!.scale(dpr, dpr);
    }

    function drawWave(
      time: number,
      color: { r: number; g: number; b: number },
      yOffset: number,
      amplitude: number,
      speed: number,
      alpha: number,
    ) {
      ctx!.beginPath();
      ctx!.moveTo(0, h);

      const segments = 80;
      for (let i = 0; i <= segments; i++) {
        const x = (i / segments) * w;
        const nx = i / segments * 4;
        const ny = yOffset;
        const n = noise(nx, ny, time * speed);
        const y = h * (0.3 + yOffset * 0.15) + n * amplitude;
        if (i === 0) {
          ctx!.moveTo(x, y);
        } else {
          ctx!.lineTo(x, y);
        }
      }

      ctx!.lineTo(w, h);
      ctx!.lineTo(0, h);
      ctx!.closePath();

      const gradient = ctx!.createLinearGradient(0, h * 0.2, 0, h);
      gradient.addColorStop(0, `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha})`);
      gradient.addColorStop(0.6, `rgba(${color.r}, ${color.g}, ${color.b}, ${alpha * 0.3})`);
      gradient.addColorStop(1, `rgba(${color.r}, ${color.g}, ${color.b}, 0)`);
      ctx!.fillStyle = gradient;
      ctx!.fill();
    }

    let startTime = performance.now();

    function animate(now: number) {
      const t = (now - startTime) / 1000;
      ctx!.clearRect(0, 0, w, h);

      // Draw multiple wave layers back to front
      drawWave(t, WAVE_COLORS[0], 0.5, h * 0.25, 0.3, 0.12);
      drawWave(t, WAVE_COLORS[1], 1.5, h * 0.3, 0.4, 0.1);
      drawWave(t, WAVE_COLORS[2], 2.5, h * 0.2, 0.5, 0.15);
      drawWave(t, WAVE_COLORS[3], 3.5, h * 0.18, 0.35, 0.08);

      // Top glow layer
      drawWave(t, WAVE_COLORS[1], 0.8, h * 0.15, 0.25, 0.06);

      rafRef.current = requestAnimationFrame(animate);
    }

    resize();
    rafRef.current = requestAnimationFrame(animate);
    window.addEventListener("resize", resize);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full"
      style={{ background: "#050505" }}
    />
  );
}
