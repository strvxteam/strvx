"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown, Check } from "lucide-react";

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
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const selected = options.find((o) => o.value === value);

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(!open)}
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
      {open && (
        <div className="absolute left-0 right-0 z-50 mt-1 max-h-52 overflow-auto rounded-lg border border-[#e0e0e0] bg-white py-1 shadow-lg">
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
        </div>
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
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

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
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
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
      {open && (
        <div className="absolute left-0 right-0 z-50 mt-1 max-h-52 overflow-auto rounded-lg border border-[#e0e0e0] bg-white py-1 shadow-lg">
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
        </div>
      )}
    </div>
  );
}
