"use client";

import type { ReactNode } from "react";

export function ItemRow({
  icon,
  title,
  subtitle,
  href,
  onPrimaryClick,
  overflowActions,
  tint = "normal",
}: {
  icon: ReactNode;
  title: string;
  subtitle?: string | null;
  href?: string;
  onPrimaryClick?: () => void;
  overflowActions?: { label: string; onClick: () => void }[];
  tint?: "normal" | "warning" | "danger";
}) {
  const tintBg =
    tint === "danger" ? "bg-[#fef5f5]" : tint === "warning" ? "bg-[#fffbf0]" : "hover:bg-[#fafafa]";
  const Wrapper: React.ElementType = href ? "a" : "div";
  const wrapperProps = href ? { href } : {};

  return (
    <Wrapper
      {...wrapperProps}
      className={`flex items-center gap-3 border-b border-[#f0f0f0] px-4 py-2.5 text-[13px] ${tintBg}`}
    >
      <span
        className="flex h-5 w-5 shrink-0 items-center justify-center"
        onClick={(e) => {
          if (onPrimaryClick) {
            e.preventDefault();
            onPrimaryClick();
          }
        }}
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[#222]">{title}</p>
        {subtitle && <p className="truncate text-[11px] text-[#888]">{subtitle}</p>}
      </div>
      {overflowActions && overflowActions.length > 0 && <Overflow actions={overflowActions} />}
    </Wrapper>
  );
}

function Overflow({ actions }: { actions: { label: string; onClick: () => void }[] }) {
  // Simplified — can use shadcn DropdownMenu if preferred
  // For MVP, inline a simple button-reveal pattern
  return (
    <details className="relative">
      <summary className="list-none cursor-pointer rounded p-1 text-[#999] hover:bg-[#f0f0f0]">⋯</summary>
      <div className="absolute right-0 top-full z-10 mt-1 w-44 rounded-md border border-[#e0e0e0] bg-white py-1 shadow-lg">
        {actions.map((a) => (
          <button
            key={a.label}
            onClick={a.onClick}
            className="block w-full px-3 py-1.5 text-left text-[13px] hover:bg-[#f5f5f5]"
          >
            {a.label}
          </button>
        ))}
      </div>
    </details>
  );
}
