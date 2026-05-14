"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { GraphEdge, GraphNode } from "@/lib/kg/queries";

// react-force-graph-2d uses Canvas + DOM measurements; must be client-only.
const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), { ssr: false });

const PALETTE: Record<string, string> = {
  Person: "#1a73e8",
  Organization: "#0e7490",
  Note: "#7c3aed",
  Engagement: "#15803d",
  Decision: "#b45309",
  Task: "#ea580c",
  Interaction: "#0891b2",
};

interface Props {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

interface FGNode extends GraphNode {
  color: string;
  display: string;
  hasRealName: boolean;
  degree: number;
}

interface LinkObj {
  source: string | { id: string };
  target: string | { id: string };
  type: string;
}

interface ForceGraphInstance {
  d3Force: (name: string, force?: unknown) => unknown;
  zoomToFit: (ms?: number, padding?: number) => void;
  centerAt: (x: number, y: number, ms?: number) => void;
  zoom: (level: number, ms?: number) => void;
}

function isRealName(name: string, id: string): boolean {
  if (name === id) return false;
  if (/^[a-z]+:[a-z_]+:[0-9a-f-]{20,}/i.test(name)) return false;
  return true;
}

function shortLabel(name: string, max = 22): string {
  if (name.length <= max) return name;
  return name.slice(0, max - 1) + "…";
}

function linkSrcId(l: LinkObj): string {
  return typeof l.source === "object" ? l.source.id : l.source;
}
function linkTgtId(l: LinkObj): string {
  return typeof l.target === "object" ? l.target.id : l.target;
}

export function GraphCanvas({ nodes, edges }: Props) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fgRef = useRef<any>(null);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [hoveredEdge, setHoveredEdge] = useState<{
    type: string;
    sourceId: string;
    targetId: string;
  } | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);

  // Per-render bbox map for label-collision suppression. Reset on every frame
  // via the `onRenderFramePre` hook; nodes are drawn in degree-desc order so
  // hubs always win when they overlap leaf labels.
  const labelBoxesRef = useRef<Array<{ x: number; y: number; w: number; h: number }>>([]);

  // Click vs double-click discriminator: single tap zooms to neighborhood;
  // double tap navigates to entity. We delay single-click reaction by 220ms
  // to give the second click time to land.
  const clickTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const update = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Pre-compute degree so we can size nodes by hub-ness and order draw by priority.
  const degreeMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of edges) {
      m.set(e.source, (m.get(e.source) ?? 0) + 1);
      m.set(e.target, (m.get(e.target) ?? 0) + 1);
    }
    return m;
  }, [edges]);

  const adjacency = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const e of edges) {
      if (!map.has(e.source)) map.set(e.source, new Set());
      if (!map.has(e.target)) map.set(e.target, new Set());
      map.get(e.source)!.add(e.target);
      map.get(e.target)!.add(e.source);
    }
    return map;
  }, [edges]);

  const data = useMemo(() => {
    const fgNodes = nodes
      .map<FGNode>((n) => {
        const real = isRealName(n.name, n.id);
        const display = real
          ? shortLabel(n.name)
          : `${n.label} ${(n.id.split(":").pop() ?? n.id).slice(0, 6)}`;
        return {
          ...n,
          color: PALETTE[n.label] ?? "#888",
          display,
          hasRealName: real,
          degree: degreeMap.get(n.id) ?? 0,
        };
      })
      // Hub-first ordering — force-graph-2d respects array order for canvas
      // draw, so higher-degree nodes get their labels painted first and win
      // collision checks naturally.
      .sort((a, b) => b.degree - a.degree);
    return {
      nodes: fgNodes,
      links: edges.map((e) => ({ source: e.source, target: e.target, type: e.type })),
    };
  }, [nodes, edges, degreeMap]);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      const fg = fgRef.current as ForceGraphInstance | null;
      if (!fg || cancelled) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const d3 = (await import("d3")) as any;
      // Repulsion + collision scale with node degree so hubs claim more space.
      fg.d3Force(
        "charge",
        d3
          .forceManyBody()
          .strength((n: FGNode) => -800 - n.degree * 80)
          .distanceMax(900),
      );
      fg.d3Force(
        "link",
        d3
          .forceLink()
          .id((n: { id: string }) => n.id)
          .distance(160)
          .strength(0.45),
      );
      fg.d3Force(
        "collide",
        d3.forceCollide().radius((n: FGNode) => 30 + Math.sqrt(n.degree) * 12).strength(1),
      );
      fg.d3Force("center", d3.forceCenter(0, 0));
    }, 50);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [size.w, size.h]);

  if (nodes.length === 0) {
    return (
      <div
        style={{
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#888",
          fontSize: 13,
        }}
      >
        No nodes to render. Try a different label filter or raise the limit.
      </div>
    );
  }

  const LABEL_PX = 11;
  const HOVER_LABEL_PX = 13;

  // Constant-screen radius for a node, scaled by sqrt(degree) so hubs are visibly bigger.
  function nodeScreenRadius(n: FGNode, isHovered: boolean): number {
    const base = 3.5 + Math.sqrt(n.degree) * 1.5; // 3.5px for leaves, grows for hubs
    return isHovered ? base * 1.6 : base;
  }

  function focusOnNode(id: string) {
    const fg = fgRef.current as ForceGraphInstance | null;
    if (!fg) return;
    const node = data.nodes.find((n) => n.id === id) as
      | (FGNode & { x?: number; y?: number })
      | undefined;
    if (!node || node.x === undefined || node.y === undefined) return;
    fg.centerAt(node.x, node.y, 600);
    fg.zoom(2.2, 600);
    setFocusedId(id);
  }

  // Hovered node info for the side detail card.
  const hovered = hoveredId
    ? (data.nodes.find((n) => n.id === hoveredId) as FGNode | undefined)
    : null;

  return (
    <div ref={containerRef} style={{ width: "100%", height: "100%", position: "relative" }}>
      {size.w > 0 && size.h > 0 ? (
        <ForceGraph2D
          ref={fgRef}
          width={size.w}
          height={size.h}
          graphData={data}
          backgroundColor="#fafafa"
          nodeRelSize={1}
          nodePointerAreaPaint={(n, color, ctx, globalScale) => {
            const g = n as FGNode & { x?: number; y?: number };
            if (g.x === undefined || g.y === undefined) return;
            const r = Math.max(10, nodeScreenRadius(g, false) + 4) / globalScale;
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(g.x, g.y, r, 0, 2 * Math.PI);
            ctx.fill();
          }}
          nodeLabel={(n) => {
            const g = n as FGNode;
            return `${g.label}: ${g.name}${g.degree ? ` · ${g.degree} edge${g.degree === 1 ? "" : "s"}` : ""}`;
          }}
          linkColor={(l) => {
            const li = l as LinkObj;
            const srcId = linkSrcId(li);
            const tgtId = linkTgtId(li);
            if (hoveredId && (hoveredId === srcId || hoveredId === tgtId)) return "#111";
            if (focusedId && (focusedId === srcId || focusedId === tgtId)) return "#1a73e8";
            return "#d4d8de";
          }}
          linkWidth={(l) => {
            const li = l as LinkObj;
            const srcId = linkSrcId(li);
            const tgtId = linkTgtId(li);
            const lit = hoveredId && (hoveredId === srcId || hoveredId === tgtId);
            const focused = focusedId && (focusedId === srcId || focusedId === tgtId);
            return lit || focused ? 2.2 : 1;
          }}
          linkDirectionalArrowLength={3.5}
          linkDirectionalArrowRelPos={0.92}
          cooldownTicks={220}
          warmupTicks={70}
          onEngineStop={() => {
            const fg = fgRef.current as ForceGraphInstance | null;
            fg?.zoomToFit(500, 80);
          }}
          onNodeHover={(n) => setHoveredId(n ? (n as FGNode).id : null)}
          onLinkHover={(l) => {
            if (!l) {
              setHoveredEdge(null);
              return;
            }
            const li = l as LinkObj;
            setHoveredEdge({
              type: li.type,
              sourceId: linkSrcId(li),
              targetId: linkTgtId(li),
            });
          }}
          onNodeClick={(n) => {
            const g = n as FGNode;
            if (clickTimerRef.current !== null) {
              // Double-click → navigate
              window.clearTimeout(clickTimerRef.current);
              clickTimerRef.current = null;
              router.push(`/kg/entity/${encodeURIComponent(g.id)}`);
              return;
            }
            // First click → wait briefly for a second; if it doesn't come, focus.
            clickTimerRef.current = window.setTimeout(() => {
              clickTimerRef.current = null;
              focusOnNode(g.id);
            }, 220);
          }}
          onBackgroundClick={() => {
            setFocusedId(null);
            const fg = fgRef.current as ForceGraphInstance | null;
            fg?.zoomToFit(500, 80);
          }}
          onRenderFramePre={() => {
            labelBoxesRef.current = [];
          }}
          nodeCanvasObjectMode={() => "replace"}
          nodeCanvasObject={(n, ctx, globalScale) => {
            const g = n as FGNode & { x?: number; y?: number };
            if (g.x === undefined || g.y === undefined) return;
            const isHovered = hoveredId === g.id;
            const isFocused = focusedId === g.id;
            const isNeighbor =
              (hoveredId !== null && adjacency.get(hoveredId)?.has(g.id) === true) ||
              (focusedId !== null && adjacency.get(focusedId)?.has(g.id) === true);
            const anyAnchor = hoveredId !== null || focusedId !== null;
            const isDimmed = anyAnchor && !isHovered && !isFocused && !isNeighbor;

            // Constant SCREEN-px radius, sized by hub-ness.
            const screenR = nodeScreenRadius(g, isHovered || isFocused);
            const r = screenR / globalScale;
            ctx.beginPath();
            ctx.arc(g.x, g.y, r, 0, 2 * Math.PI);
            ctx.fillStyle = isDimmed ? `${g.color}40` : g.color;
            ctx.fill();
            if (isHovered || isFocused) {
              ctx.strokeStyle = isFocused ? "#1a73e8" : "#111";
              ctx.lineWidth = 1.8 / globalScale;
              ctx.stroke();
            } else if (g.degree >= 3) {
              // Subtle hub ring for major nodes.
              ctx.strokeStyle = "rgba(0,0,0,0.18)";
              ctx.lineWidth = 0.8 / globalScale;
              ctx.stroke();
            }

            // Label visibility heuristic:
            //   - hovered/neighbor of hover  → always show
            //   - focused/neighbor of focus  → always show
            //   - real-named, degree≥1, not dimmed → show subject to collision check
            const showLabel =
              isHovered ||
              isFocused ||
              isNeighbor ||
              (g.hasRealName && g.degree >= 1 && !isDimmed);
            if (!showLabel) return;

            const px = isHovered || isFocused ? HOVER_LABEL_PX : LABEL_PX;
            const fontSize = px / globalScale;
            const weight = isHovered || isFocused ? 700 : 500;
            ctx.font = `${weight} ${fontSize}px ui-sans-serif, -apple-system, system-ui`;
            const w = ctx.measureText(g.display).width;
            const padX = 4 / globalScale;
            const padY = 2.5 / globalScale;
            const gap = (screenR + 5) / globalScale;
            const x = g.x;
            const y = g.y + gap;

            const bboxX = x - w / 2 - padX;
            const bboxY = y;
            const bboxW = w + padX * 2;
            const bboxH = fontSize + padY * 2;

            // Label-collision suppression for non-hover labels.
            // We always allow hover/focus/neighbor labels through — they're the
            // user's current attention. Everything else has to not overlap a
            // label already placed this frame (which, because nodes are sorted
            // by degree desc, will be a higher-priority hub).
            const isPriority = isHovered || isFocused || isNeighbor;
            if (!isPriority) {
              const boxes = labelBoxesRef.current;
              const overlap = boxes.some(
                (b) =>
                  bboxX < b.x + b.w &&
                  bboxX + bboxW > b.x &&
                  bboxY < b.y + b.h &&
                  bboxY + bboxH > b.y,
              );
              if (overlap) return;
            }
            labelBoxesRef.current.push({ x: bboxX, y: bboxY, w: bboxW, h: bboxH });

            ctx.textAlign = "center";
            ctx.textBaseline = "top";

            if (isHovered || isFocused) {
              ctx.fillStyle = isFocused ? "rgba(26,115,232,0.96)" : "rgba(17,17,17,0.96)";
              const radius = 3 / globalScale;
              roundRect(ctx, bboxX, bboxY, bboxW, bboxH, radius);
              ctx.fill();
              ctx.fillStyle = "#fff";
              ctx.fillText(g.display, x, y + padY);
            } else {
              ctx.lineWidth = 3 / globalScale;
              ctx.strokeStyle = "rgba(250,250,250,0.95)";
              ctx.lineJoin = "round";
              ctx.miterLimit = 2;
              ctx.strokeText(g.display, x, y + padY);
              ctx.fillStyle = isNeighbor ? "#111" : "#1f2937";
              ctx.fillText(g.display, x, y + padY);
            }
          }}
        />
      ) : null}

      {/* Hover/focus detail card — pinned top-right, doesn't fight with the legend. */}
      {hovered ? <NodeDetailCard node={hovered} /> : null}

      {/* Edge tooltip (cursor-follow not provided by lib; we pin it top-center). */}
      {hoveredEdge ? <EdgeTooltip edge={hoveredEdge} /> : null}
    </div>
  );
}

function NodeDetailCard({ node }: { node: FGNode }) {
  return (
    <div
      style={{
        position: "absolute",
        top: 12,
        right: 12,
        background: "rgba(255,255,255,0.97)",
        border: "1px solid #e0e0e0",
        borderRadius: 8,
        padding: "10px 12px",
        maxWidth: 260,
        boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
        pointerEvents: "none",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: 999,
            background: node.color,
            display: "inline-block",
          }}
        />
        <span
          style={{
            fontSize: 10,
            fontWeight: 600,
            color: "#888",
            textTransform: "uppercase",
            letterSpacing: 0.6,
          }}
        >
          {node.label}
        </span>
        <span style={{ marginLeft: "auto", fontSize: 10, color: "#888" }}>
          {node.degree} edge{node.degree === 1 ? "" : "s"}
        </span>
      </div>
      <div
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: "#111",
          marginBottom: 4,
          wordBreak: "break-word",
        }}
      >
        {node.name}
      </div>
      <div
        style={{
          fontSize: 10,
          color: "#888",
          fontFamily: "ui-monospace, SFMono-Regular, monospace",
          wordBreak: "break-all",
        }}
      >
        {node.id}
      </div>
      <div style={{ fontSize: 11, color: "#1a73e8", marginTop: 8 }}>
        Click to focus · double-click to open
      </div>
    </div>
  );
}

function EdgeTooltip({ edge }: { edge: { type: string; sourceId: string; targetId: string } }) {
  return (
    <div
      style={{
        position: "absolute",
        top: 12,
        left: "50%",
        transform: "translateX(-50%)",
        background: "rgba(17,17,17,0.92)",
        color: "#fff",
        borderRadius: 6,
        padding: "4px 10px",
        fontSize: 11,
        fontFamily: "ui-monospace, SFMono-Regular, monospace",
        pointerEvents: "none",
      }}
    >
      {shortId(edge.sourceId)} ─ {edge.type} → {shortId(edge.targetId)}
    </div>
  );
}

function shortId(id: string): string {
  const parts = id.split(":");
  if (parts.length < 3) return id;
  return `${parts[1]}/${parts[2].slice(0, 6)}`;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}
