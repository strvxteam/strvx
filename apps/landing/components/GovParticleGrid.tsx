"use client";

import { useEffect, useRef } from "react";

interface Node {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  opacity: number;
  /** 0 = normal, 1 = hub (larger, brighter) */
  type: number;
  /** Hub-only: tactical label */
  label?: string;
  /** Hub-only: status text */
  status?: string;
}

interface Shockwave {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  opacity: number;
}

interface LockedHub {
  node: Node;
  lockProgress: number; // 0 → 1 as reticle animates in
}

const HUB_LABELS = [
  { label: "NODE-7A", status: "ACTIVE" },
  { label: "RELAY-3C", status: "ONLINE" },
  { label: "SAT-09", status: "LINKED" },
  { label: "OPS-12", status: "NOMINAL" },
  { label: "SIGINT-4", status: "ACTIVE" },
  { label: "C2-WEST", status: "SECURE" },
  { label: "MESH-06", status: "ONLINE" },
  { label: "UPLINK-1", status: "ACTIVE" },
  { label: "TANGO-2", status: "STANDBY" },
  { label: "VIPER-8", status: "ONLINE" },
  { label: "RECON-5B", status: "ACTIVE" },
  { label: "BASTION", status: "SECURE" },
  { label: "ARC-11", status: "NOMINAL" },
  { label: "PRISM-4", status: "LINKED" },
  { label: "ECHO-7", status: "ACTIVE" },
  { label: "FORGE-3", status: "ONLINE" },
];

export function GovParticleGrid() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: -1000, y: -1000 });
  const nodesRef = useRef<Node[]>([]);
  const rafRef = useRef<number>(0);
  const timeRef = useRef(0);
  const shockwavesRef = useRef<Shockwave[]>([]);
  const lockedHubRef = useRef<LockedHub | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const NODE_COUNT = 100;
    const CONNECTION_DIST = 180;
    const MOUSE_RADIUS = 220;
    const LOCK_DIST = 150; // How close cursor must be to lock a hub
    const SHOCKWAVE_SPEED = 6;
    const SHOCKWAVE_MAX = 300;

    function resize() {
      const dpr = window.devicePixelRatio || 1;
      canvas!.width = canvas!.offsetWidth * dpr;
      canvas!.height = canvas!.offsetHeight * dpr;
      ctx!.scale(dpr, dpr);
    }

    function initNodes() {
      const w = canvas!.offsetWidth;
      const h = canvas!.offsetHeight;
      nodesRef.current = Array.from({ length: NODE_COUNT }, (_, i) => {
        const isHub = i < 16;
        return {
          x: Math.random() * w,
          y: Math.random() * h,
          vx: (Math.random() - 0.5) * 0.25,
          vy: (Math.random() - 0.5) * 0.25,
          radius: isHub ? Math.random() * 2 + 1.5 : Math.random() * 1.2 + 0.4,
          opacity: isHub ? 0.8 : Math.random() * 0.4 + 0.3,
          type: isHub ? 1 : 0,
          label: isHub ? HUB_LABELS[i].label : undefined,
          status: isHub ? HUB_LABELS[i].status : undefined,
        };
      });
    }

    /* -------------------------------------------------------------- */
    /*  Draw reticle around a locked hub                               */
    /* -------------------------------------------------------------- */
    function drawReticle(node: Node, progress: number) {
      const size = 18 + (1 - progress) * 12; // Shrinks as it locks on
      const alpha = progress * 0.7;
      const rotation = timeRef.current * 2;

      ctx!.save();
      ctx!.translate(node.x, node.y);
      ctx!.rotate(rotation);

      // Outer rotating brackets
      ctx!.strokeStyle = `rgba(140, 170, 255, ${alpha})`;
      ctx!.lineWidth = 1;
      const gap = Math.PI * 0.15;
      for (let i = 0; i < 4; i++) {
        const startAngle = (i * Math.PI) / 2 + gap;
        const endAngle = ((i + 1) * Math.PI) / 2 - gap;
        ctx!.beginPath();
        ctx!.arc(0, 0, size, startAngle, endAngle);
        ctx!.stroke();
      }

      // Inner diamond
      ctx!.rotate(-rotation * 1.5);
      const innerSize = 6 * progress;
      ctx!.strokeStyle = `rgba(180, 200, 255, ${alpha * 0.6})`;
      ctx!.lineWidth = 0.8;
      ctx!.beginPath();
      ctx!.moveTo(0, -innerSize);
      ctx!.lineTo(innerSize, 0);
      ctx!.lineTo(0, innerSize);
      ctx!.lineTo(-innerSize, 0);
      ctx!.closePath();
      ctx!.stroke();

      ctx!.restore();

      // Label + status text (fades in with progress)
      if (progress > 0.3 && node.label) {
        const textAlpha = (progress - 0.3) / 0.7;
        const offsetX = size + 12;
        const offsetY = -8;

        // Label background
        ctx!.fillStyle = `rgba(3, 8, 16, ${textAlpha * 0.8})`;
        ctx!.fillRect(
          node.x + offsetX - 4,
          node.y + offsetY - 10,
          90,
          28
        );

        // Label border
        ctx!.strokeStyle = `rgba(120, 140, 255, ${textAlpha * 0.3})`;
        ctx!.lineWidth = 0.5;
        ctx!.strokeRect(
          node.x + offsetX - 4,
          node.y + offsetY - 10,
          90,
          28
        );

        // Label text
        ctx!.font = "10px monospace";
        ctx!.fillStyle = `rgba(180, 200, 255, ${textAlpha * 0.9})`;
        ctx!.fillText(node.label, node.x + offsetX, node.y + offsetY);

        // Status text
        ctx!.font = "8px monospace";
        ctx!.fillStyle = `rgba(100, 220, 160, ${textAlpha * 0.7})`;
        ctx!.fillText(
          `● ${node.status}`,
          node.x + offsetX,
          node.y + offsetY + 12
        );
      }
    }

    /* -------------------------------------------------------------- */
    /*  Draw shockwave rings                                           */
    /* -------------------------------------------------------------- */
    function drawShockwaves() {
      const waves = shockwavesRef.current;
      for (let i = waves.length - 1; i >= 0; i--) {
        const w = waves[i];
        w.radius += SHOCKWAVE_SPEED;
        w.opacity = 1 - w.radius / w.maxRadius;

        if (w.radius >= w.maxRadius) {
          waves.splice(i, 1);
          continue;
        }

        // Outer ring
        ctx!.beginPath();
        ctx!.arc(w.x, w.y, w.radius, 0, Math.PI * 2);
        ctx!.strokeStyle = `rgba(140, 170, 255, ${w.opacity * 0.4})`;
        ctx!.lineWidth = 2;
        ctx!.stroke();

        // Inner ring (trails behind)
        if (w.radius > 20) {
          ctx!.beginPath();
          ctx!.arc(w.x, w.y, w.radius * 0.7, 0, Math.PI * 2);
          ctx!.strokeStyle = `rgba(140, 170, 255, ${w.opacity * 0.15})`;
          ctx!.lineWidth = 1;
          ctx!.stroke();
        }

        // Fill glow
        const grd = ctx!.createRadialGradient(
          w.x, w.y, 0,
          w.x, w.y, w.radius
        );
        grd.addColorStop(0, `rgba(120, 140, 255, 0)`);
        grd.addColorStop(0.7, `rgba(120, 140, 255, 0)`);
        grd.addColorStop(1, `rgba(120, 140, 255, ${w.opacity * 0.05})`);
        ctx!.fillStyle = grd;
        ctx!.fill();
      }
    }

    /* -------------------------------------------------------------- */
    /*  Main animation loop                                            */
    /* -------------------------------------------------------------- */
    function animate() {
      const w = canvas!.offsetWidth;
      const h = canvas!.offsetHeight;
      ctx!.clearRect(0, 0, w, h);

      timeRef.current += 0.002;
      const nodes = nodesRef.current;
      const mouse = mouseRef.current;
      const waves = shockwavesRef.current;

      // Update positions + apply shockwave force
      for (const n of nodes) {
        n.x += n.vx;
        n.y += n.vy;
        if (n.x < 0 || n.x > w) n.vx *= -1;
        if (n.y < 0 || n.y > h) n.vy *= -1;

        // Mouse attraction
        const dx = mouse.x - n.x;
        const dy = mouse.y - n.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < MOUSE_RADIUS && dist > 0) {
          const force = (MOUSE_RADIUS - dist) / MOUSE_RADIUS;
          n.vx += (dx / dist) * force * 0.08;
          n.vy += (dy / dist) * force * 0.08;
        }

        // Shockwave repulsion
        for (const sw of waves) {
          const sdx = n.x - sw.x;
          const sdy = n.y - sw.y;
          const sDist = Math.sqrt(sdx * sdx + sdy * sdy);
          // Push particles at the wavefront
          const waveDelta = Math.abs(sDist - sw.radius);
          if (waveDelta < 30 && sDist > 0) {
            const pushForce = (1 - waveDelta / 30) * sw.opacity * 2;
            n.vx += (sdx / sDist) * pushForce;
            n.vy += (sdy / sDist) * pushForce;
          }
        }

        n.vx *= 0.995;
        n.vy *= 0.995;
      }

      // Find nearest hub for lock-on
      let nearestHub: Node | null = null;
      let nearestDist = LOCK_DIST;
      if (mouse.x > 0 && mouse.y > 0) {
        for (const n of nodes) {
          if (n.type !== 1) continue;
          const dx = n.x - mouse.x;
          const dy = n.y - mouse.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < nearestDist) {
            nearestDist = dist;
            nearestHub = n;
          }
        }
      }

      // Update lock state
      const locked = lockedHubRef.current;
      if (nearestHub) {
        if (locked && locked.node === nearestHub) {
          locked.lockProgress = Math.min(locked.lockProgress + 0.04, 1);
        } else {
          lockedHubRef.current = { node: nearestHub, lockProgress: 0.05 };
        }
      } else if (locked) {
        locked.lockProgress -= 0.06;
        if (locked.lockProgress <= 0) {
          lockedHubRef.current = null;
        }
      }

      // Draw grid connections
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[i].x - nodes[j].x;
          const dy = nodes[i].y - nodes[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < CONNECTION_DIST) {
            const alpha = (1 - dist / CONNECTION_DIST) * 0.12;
            ctx!.beginPath();
            ctx!.moveTo(nodes[i].x, nodes[i].y);
            ctx!.lineTo(nodes[j].x, nodes[j].y);
            ctx!.strokeStyle = `rgba(120, 140, 255, ${alpha})`;
            ctx!.lineWidth = 0.5;
            ctx!.stroke();
          }
        }
      }

      // Mouse connections
      for (const n of nodes) {
        const dx = n.x - mouse.x;
        const dy = n.y - mouse.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < MOUSE_RADIUS) {
          const alpha = (1 - dist / MOUSE_RADIUS) * 0.2;
          ctx!.beginPath();
          ctx!.moveTo(n.x, n.y);
          ctx!.lineTo(mouse.x, mouse.y);
          ctx!.strokeStyle = `rgba(140, 160, 255, ${alpha})`;
          ctx!.lineWidth = 0.8;
          ctx!.stroke();
        }
      }

      // Draw shockwaves
      drawShockwaves();

      // Draw nodes
      for (const n of nodes) {
        if (n.type === 1) {
          const pulse =
            Math.sin(timeRef.current * 3 + n.x * 0.01) * 0.3 + 0.7;
          ctx!.beginPath();
          ctx!.arc(n.x, n.y, n.radius * 4, 0, Math.PI * 2);
          ctx!.fillStyle = `rgba(120, 140, 255, ${0.04 * pulse})`;
          ctx!.fill();
        }

        ctx!.beginPath();
        ctx!.arc(n.x, n.y, n.radius, 0, Math.PI * 2);
        ctx!.fillStyle = `rgba(180, 190, 255, ${n.opacity})`;
        ctx!.fill();
      }

      // Draw reticle on locked hub
      if (lockedHubRef.current) {
        drawReticle(
          lockedHubRef.current.node,
          lockedHubRef.current.lockProgress
        );
      }

      // Subtle scan line effect
      const scanY = (timeRef.current * 80) % h;
      const gradient = ctx!.createLinearGradient(0, scanY - 40, 0, scanY + 40);
      gradient.addColorStop(0, "rgba(120, 140, 255, 0)");
      gradient.addColorStop(0.5, "rgba(120, 140, 255, 0.015)");
      gradient.addColorStop(1, "rgba(120, 140, 255, 0)");
      ctx!.fillStyle = gradient;
      ctx!.fillRect(0, scanY - 40, w, 80);

      rafRef.current = requestAnimationFrame(animate);
    }

    /* -------------------------------------------------------------- */
    /*  Event handlers                                                 */
    /* -------------------------------------------------------------- */
    function handleMouseMove(e: MouseEvent) {
      const rect = canvas!.getBoundingClientRect();
      mouseRef.current = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
    }

    function handleMouseLeave() {
      mouseRef.current = { x: -1000, y: -1000 };
    }

    function handleClick(e: MouseEvent) {
      const rect = canvas!.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      shockwavesRef.current.push({
        x,
        y,
        radius: 0,
        maxRadius: SHOCKWAVE_MAX,
        opacity: 1,
      });
    }

    resize();
    initNodes();
    animate();

    window.addEventListener("resize", () => {
      resize();
      initNodes();
    });
    canvas.addEventListener("mousemove", handleMouseMove);
    canvas.addEventListener("mouseleave", handleMouseLeave);
    canvas.addEventListener("click", handleClick);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("mousemove", handleMouseMove);
      canvas.removeEventListener("mouseleave", handleMouseLeave);
      canvas.removeEventListener("click", handleClick);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full cursor-crosshair"
      style={{ background: "#030810" }}
    />
  );
}
