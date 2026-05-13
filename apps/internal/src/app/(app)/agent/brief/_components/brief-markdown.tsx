"use client";

import ReactMarkdown from "react-markdown";

/**
 * Minimal markdown renderer with inline styles — the project's Tailwind setup
 * doesn't include the typography plugin, and JIT won't pick up dynamic classes
 * built from string concatenation. Inline styles avoid both problems.
 */
export function BriefMarkdown({ content }: { content: string }) {
  return (
    <div style={{ color: "#222", fontSize: 14, lineHeight: 1.6 }}>
      <ReactMarkdown
        components={{
          h1: (props) => (
            <h1
              style={{
                fontSize: 22,
                fontWeight: 600,
                marginTop: 24,
                marginBottom: 12,
                color: "#111",
              }}
              {...props}
            />
          ),
          h2: (props) => (
            <h2
              style={{
                fontSize: 16,
                fontWeight: 600,
                marginTop: 24,
                marginBottom: 8,
                color: "#111",
                borderBottom: "1px solid #e0e0e0",
                paddingBottom: 4,
              }}
              {...props}
            />
          ),
          h3: (props) => (
            <h3
              style={{
                fontSize: 14,
                fontWeight: 600,
                marginTop: 16,
                marginBottom: 6,
                color: "#222",
              }}
              {...props}
            />
          ),
          p: (props) => (
            <p style={{ marginTop: 8, marginBottom: 8 }} {...props} />
          ),
          ul: (props) => (
            <ul
              style={{
                marginTop: 6,
                marginBottom: 10,
                paddingLeft: 20,
                listStyle: "disc",
              }}
              {...props}
            />
          ),
          ol: (props) => (
            <ol
              style={{
                marginTop: 6,
                marginBottom: 10,
                paddingLeft: 20,
                listStyle: "decimal",
              }}
              {...props}
            />
          ),
          li: (props) => (
            <li style={{ marginTop: 2, marginBottom: 2 }} {...props} />
          ),
          a: (props) => (
            <a
              style={{ color: "#1a73e8", textDecoration: "underline" }}
              {...props}
            />
          ),
          strong: (props) => <strong style={{ fontWeight: 600 }} {...props} />,
          em: (props) => <em style={{ fontStyle: "italic" }} {...props} />,
          code: (props) => (
            <code
              style={{
                background: "#f5f5f5",
                padding: "1px 4px",
                borderRadius: 3,
                fontSize: 13,
                fontFamily:
                  "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
              }}
              {...props}
            />
          ),
          hr: () => (
            <hr
              style={{
                border: 0,
                borderTop: "1px solid #e0e0e0",
                marginTop: 16,
                marginBottom: 16,
              }}
            />
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
