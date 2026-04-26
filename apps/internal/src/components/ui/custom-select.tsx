"use client";

import { useState, useRef, useEffect, useLayoutEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Check } from "lucide-react";

type MenuRect = { top: number; left: number; width: number; maxHeight: number };

const MENU_MARGIN = 8;
const MENU_MAX_HEIGHT = 360;
const MIN_BELOW_SPACE = 200;

function useMenuPosition(
  open: boolean,
  triggerRef: React.RefObject<HTMLElement | null>,
): MenuRect | null {
  const [rect, setRect] = useState<MenuRect | null>(null);

  const compute = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const vh = window.innerHeight;
    const spaceBelow = vh - r.bottom - MENU_MARGIN;
    const spaceAbove = r.top - MENU_MARGIN;

    // Open above if there's not enough room below AND above has more room.
    const openAbove = spaceBelow < MIN_BELOW_SPACE && spaceAbove > spaceBelow;
    const available = openAbove ? spaceAbove : spaceBelow;
    const maxHeight = Math.min(MENU_MAX_HEIGHT, Math.max(120, available));
    const top = openAbove
      ? r.top - maxHeight - 4
      : r.bottom + 4;

    setRect({ top, left: r.left, width: r.width, maxHeight });
  }, [triggerRef]);

  useLayoutEffect(() => {
    if (!open) return;
    compute();
  }, [open, compute]);

  useEffect(() => {
    if (!open) return;
    const handler = () => compute();
    window.addEventListener("scroll", handler, true);
    window.addEventListener("resize", handler);
    return () => {
      window.removeEventListener("scroll", handler, true);
      window.removeEventListener("resize", handler);
    };
  }, [open, compute]);

  return rect;
}

function useOutsideClose(
  open: boolean,
  onClose: () => void,
  refs: React.RefObject<HTMLElement | null>[],
) {
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      const target = e.target as Node;
      for (const r of refs) {
        if (r.current && r.current.contains(target)) return;
      }
      onClose();
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open, onClose, refs]);
}

// ── Single Select ──────────────────────────────────────

interface SelectOption {
  value: string;
  label: string;
}

interface CustomSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export function CustomSelect({
  value,
  onChange,
  options,
  placeholder = "Select...",
  className = "",
  disabled = false,
}: CustomSelectProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const rect = useMenuPosition(open, triggerRef);
  useOutsideClose(open, () => setOpen(false), [wrapperRef, menuRef]);

  const selected = options.find((o) => o.value === value);

  return (
    <div ref={wrapperRef} className={`relative ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={`flex w-full items-center justify-between rounded-lg border border-[#e0e0e0] bg-[#fafafa] px-3 py-2 text-left text-[13px] text-[#222] outline-none transition-colors hover:border-[#ccc] focus:border-[#1a73e8] focus:bg-white ${
          disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"
        }`}
      >
        <span className={selected ? "" : "text-[#aaa]"}>
          {selected?.label ?? placeholder}
        </span>
        <ChevronDown
          size={14}
          strokeWidth={2}
          className={`text-[#888] transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && rect &&
        createPortal(
          <div
            ref={menuRef}
            style={{
              position: "fixed",
              top: rect.top,
              left: rect.left,
              width: rect.width,
              maxHeight: rect.maxHeight,
              zIndex: 1000,
            }}
            className="overflow-auto overscroll-contain rounded-lg border border-[#e0e0e0] bg-white py-1 shadow-lg"
          >
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                className={`flex w-full items-center justify-between px-3 py-1.5 text-left text-[13px] transition-colors hover:bg-[#f5f5f5] ${
                  option.value === value
                    ? "font-medium text-[#1a73e8]"
                    : "text-[#333]"
                }`}
              >
                {option.label}
                {option.value === value && (
                  <Check size={14} strokeWidth={2} className="text-[#1a73e8]" />
                )}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}

// ── Multi Select ───────────────────────────────────────

interface MultiSelectProps {
  values: string[];
  onChange: (values: string[]) => void;
  options: SelectOption[];
  placeholder?: string;
  className?: string;
}

export function MultiSelect({
  values,
  onChange,
  options,
  placeholder = "Select...",
  className = "",
}: MultiSelectProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const rect = useMenuPosition(open, triggerRef);
  useOutsideClose(open, () => setOpen(false), [wrapperRef, menuRef]);

  function toggle(val: string) {
    if (values.includes(val)) {
      onChange(values.filter((v) => v !== val));
    } else {
      onChange([...values, val]);
    }
  }

  const selectedLabels = values
    .map((v) => options.find((o) => o.value === v)?.label)
    .filter(Boolean);

  return (
    <div ref={wrapperRef} className={`relative ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between rounded-lg border border-[#e0e0e0] bg-[#fafafa] px-3 py-2 text-left text-[13px] text-[#222] outline-none transition-colors hover:border-[#ccc] focus:border-[#1a73e8] focus:bg-white"
      >
        <span className={selectedLabels.length > 0 ? "" : "text-[#aaa]"}>
          {selectedLabels.length > 0
            ? selectedLabels.join(", ")
            : placeholder}
        </span>
        <ChevronDown
          size={14}
          strokeWidth={2}
          className={`shrink-0 text-[#888] transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && rect &&
        createPortal(
          <div
            ref={menuRef}
            style={{
              position: "fixed",
              top: rect.top,
              left: rect.left,
              width: rect.width,
              maxHeight: rect.maxHeight,
              zIndex: 1000,
            }}
            className="overflow-auto overscroll-contain rounded-lg border border-[#e0e0e0] bg-white py-1 shadow-lg"
          >
            {options.map((option) => {
              const checked = values.includes(option.value);
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => toggle(option.value)}
                  className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] transition-colors hover:bg-[#f5f5f5] ${
                    checked ? "font-medium text-[#1a73e8]" : "text-[#333]"
                  }`}
                >
                  <div
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                      checked
                        ? "border-[#1a73e8] bg-[#1a73e8]"
                        : "border-[#ccc] bg-white"
                    }`}
                  >
                    {checked && (
                      <Check size={10} strokeWidth={3} className="text-white" />
                    )}
                  </div>
                  {option.label}
                </button>
              );
            })}
          </div>,
          document.body,
        )}
    </div>
  );
}
