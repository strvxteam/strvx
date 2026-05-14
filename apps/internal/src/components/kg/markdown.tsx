"use client";

import Link from "next/link";
import { Fragment } from "react";

/**
 * Minimal markdown renderer for KG-assistant output.
 *
 * Supports the small subset GPT-4o reliably produces for our briefs/answers:
 *   ## Heading
 *   1. ordered list
 *   - bullet list
 *   **bold**
 *   *italic*
 *   `code`
 *   blank-line paragraph breaks
 *   inline `postgres:table:uuid` → clickable Link to /kg/entity
 *
 * Custom tokenizer (no external dep) so server components can render statically.
 */

interface Props {
  text: string;
  /** Render style: brief (compact, used inside cards) or chat (looser, message bubble). */
  variant?: "brief" | "chat";
}

export function Markdown({ text, variant = "brief" }: Props) {
  const lines = text.split("\n");
  const out: React.ReactNode[] = [];
  let ul: string[] = [];
  let ol: string[] = [];
  let k = 0;

  function flushUL() {
    if (ul.length === 0) return;
    out.push(
      <ul
        key={`ul-${k++}`}
        style={{ margin: "6px 0", paddingLeft: 20, listStyleType: "disc" }}
      >
        {ul.map((b, i) => (
          <li key={i} style={liStyle(variant)}>
            {renderInline(b)}
          </li>
        ))}
      </ul>,
    );
    ul = [];
  }
  function flushOL() {
    if (ol.length === 0) return;
    out.push(
      <ol
        key={`ol-${k++}`}
        style={{ margin: "6px 0", paddingLeft: 22, listStyleType: "decimal" }}
      >
        {ol.map((b, i) => (
          <li key={i} style={liStyle(variant)}>
            {renderInline(b)}
          </li>
        ))}
      </ol>,
    );
    ol = [];
  }

  for (const line of lines) {
    const t = line.trim();
    if (t.startsWith("### ")) {
      flushUL();
      flushOL();
      out.push(
        <h4
          key={`h-${k++}`}
          style={{ fontSize: 12, fontWeight: 700, color: "#111", margin: "12px 0 4px" }}
        >
          {renderInline(t.slice(4))}
        </h4>,
      );
    } else if (t.startsWith("## ")) {
      flushUL();
      flushOL();
      out.push(
        <h3
          key={`h-${k++}`}
          style={{
            fontSize: variant === "brief" ? 11 : 12,
            fontWeight: 700,
            color: "#111",
            margin: "14px 0 6px",
            textTransform: "uppercase",
            letterSpacing: 0.5,
          }}
        >
          {renderInline(t.slice(3))}
        </h3>,
      );
    } else if (/^\d+\.\s/.test(t)) {
      flushUL();
      ol.push(t.replace(/^\d+\.\s/, ""));
    } else if (t.startsWith("- ") || t.startsWith("* ")) {
      flushOL();
      ul.push(t.slice(2));
    } else if (t === "") {
      flushUL();
      flushOL();
    } else {
      flushUL();
      flushOL();
      out.push(
        <p key={`p-${k++}`} style={pStyle(variant)}>
          {renderInline(t)}
        </p>,
      );
    }
  }
  flushUL();
  flushOL();
  return <div>{out}</div>;
}

function liStyle(variant: "brief" | "chat"): React.CSSProperties {
  return {
    fontSize: variant === "brief" ? 13 : 14,
    lineHeight: 1.55,
    marginBottom: 4,
    color: "#222",
  };
}
function pStyle(variant: "brief" | "chat"): React.CSSProperties {
  return {
    fontSize: variant === "brief" ? 13 : 14,
    lineHeight: 1.55,
    margin: "6px 0",
    color: "#222",
  };
}

function renderInline(input: string): React.ReactNode {
  return tokenize(input).map((t, i) => <Fragment key={i}>{t}</Fragment>);
}

interface InlinePattern {
  re: RegExp;
  wrap: (text: string) => React.ReactNode;
}

const PATTERNS: InlinePattern[] = [
  { re: /\*\*([^*]+)\*\*/, wrap: (text) => <strong>{tokenize(text)}</strong> },
  { re: /(?<![*\w])\*([^*\n]+)\*(?!\w)/, wrap: (text) => <em>{tokenize(text)}</em> },
  {
    re: /`([^`]+)`/,
    wrap: (text) => (
      <code
        style={{
          background: "#f0f0f0",
          padding: "1px 6px",
          borderRadius: 4,
          fontFamily: "ui-monospace, SFMono-Regular, monospace",
          fontSize: "0.9em",
        }}
      >
        {text}
      </code>
    ),
  },
  {
    re: /\b([a-z]+:[a-z_]+:[A-Za-z0-9_-]{6,})\b/,
    wrap: (text) => (
      <Link
        href={`/kg/entity/${encodeURIComponent(text)}`}
        style={{ color: "#1a73e8", textDecoration: "underline", textUnderlineOffset: 2 }}
      >
        {idShort(text)}
      </Link>
    ),
  },
];

function tokenize(input: string): React.ReactNode[] {
  if (!input) return [];
  let earliestIdx = -1;
  let earliestLen = 0;
  let earliestPat: InlinePattern | null = null;
  let earliestInner = "";
  for (const pat of PATTERNS) {
    const m = input.match(pat.re);
    if (!m || m.index === undefined) continue;
    if (earliestIdx < 0 || m.index < earliestIdx) {
      earliestIdx = m.index;
      earliestLen = m[0].length;
      earliestPat = pat;
      earliestInner = m[1];
    }
  }
  if (!earliestPat || earliestIdx < 0) return [input];
  const before = input.slice(0, earliestIdx);
  const rest = input.slice(earliestIdx + earliestLen);
  const matched = earliestPat.wrap(earliestInner);
  return [...(before ? [before] : []), matched, ...tokenize(rest)];
}

function idShort(id: string): string {
  const parts = id.split(":");
  if (parts.length < 3) return id;
  return `${parts[1]}/${parts[2].slice(0, 6)}`;
}
