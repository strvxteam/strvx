"use client";

import { useState, useRef, useEffect } from "react";
import {
  ChevronDown,
  ArrowUpDown,
  SlidersHorizontal,
} from "lucide-react";
import { type TaskPriority, ASSIGNEES } from "@/lib/mock-tasks";

type Assignee = (typeof ASSIGNEES)[number];

interface TaskFiltersProps {
  assigneeFilter: Assignee | "all";
  onAssigneeChange: (assignee: Assignee | "all") => void;
  priorityFilter: TaskPriority | "all";
  onPriorityChange: (priority: TaskPriority | "all") => void;
  sortBy: "priority" | "dueDate" | "createdAt";
  onSortChange: (sort: "priority" | "dueDate" | "createdAt") => void;
}

const PRIORITY_OPTIONS: { value: TaskPriority | "all"; label: string; dot?: string }[] = [
  { value: "all", label: "All Priorities" },
  { value: "urgent", label: "Urgent", dot: "#e74c3c" },
  { value: "high", label: "High", dot: "#f39c12" },
  { value: "normal", label: "Normal", dot: "#1a73e8" },
  { value: "low", label: "Low", dot: "#ccc" },
];

const SORT_OPTIONS: { value: "priority" | "dueDate" | "createdAt"; label: string }[] = [
  { value: "priority", label: "Priority" },
  { value: "dueDate", label: "Due Date" },
  { value: "createdAt", label: "Created" },
];

const TEAM_AVATARS: Record<string, string> = {
  Nick: "/avatars/nick.png",
  Alex: "/avatars/alex.png",
};

const ASSIGNEE_COLORS: Record<string, { bg: string; text: string }> = {
  Nick: { bg: "#e8f0fe", text: "#1a73e8" },
  Alex: { bg: "#f3e5f5", text: "#8e24aa" },
};

export function TaskFilters({
  assigneeFilter,
  onAssigneeChange,
  priorityFilter,
  onPriorityChange,
  sortBy,
  onSortChange,
}: TaskFiltersProps) {
  return (
    <div className="flex items-center gap-2">
      {/* Person tabs */}
      <div className="flex rounded-lg border border-[#e0e0e0] bg-white p-0.5">
        <button
          onClick={() => onAssigneeChange("all")}
          className={`rounded-md px-3 py-1.5 text-[12px] font-semibold transition-all ${
            assigneeFilter === "all"
              ? "bg-[#111] text-white shadow-sm"
              : "text-[#777] hover:bg-[#f5f5f5] hover:text-[#333]"
          }`}
        >
          All
        </button>
        {ASSIGNEES.map((name) => {
          const colors = ASSIGNEE_COLORS[name];
          const isActive = assigneeFilter === name;
          return (
            <button
              key={name}
              onClick={() => onAssigneeChange(name)}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-semibold transition-all ${
                isActive
                  ? "shadow-sm"
                  : "text-[#777] hover:bg-[#f5f5f5] hover:text-[#333]"
              }`}
              style={
                isActive
                  ? { backgroundColor: colors.bg, color: colors.text }
                  : undefined
              }
            >
              {TEAM_AVATARS[name] ? (
                <img
                  src={TEAM_AVATARS[name]}
                  alt={name}
                  className="h-4 w-4 rounded-full object-cover"
                />
              ) : (
                <span
                  className="flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold text-white"
                  style={{ backgroundColor: isActive ? colors.text : "#ccc" }}
                >
                  {name[0]}
                </span>
              )}
              {name}
            </button>
          );
        })}
      </div>

      {/* Priority dropdown */}
      <Dropdown
        icon={<SlidersHorizontal size={12} strokeWidth={2} />}
        label={
          priorityFilter === "all"
            ? "Priority"
            : PRIORITY_OPTIONS.find((o) => o.value === priorityFilter)?.label ?? "Priority"
        }
        options={PRIORITY_OPTIONS}
        value={priorityFilter}
        onChange={(v) => onPriorityChange(v as TaskPriority | "all")}
        renderOption={(opt) => (
          <div className="flex items-center gap-2">
            {opt.dot && (
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ backgroundColor: opt.dot }}
              />
            )}
            {opt.label}
          </div>
        )}
      />

      {/* Sort dropdown */}
      <Dropdown
        icon={<ArrowUpDown size={12} strokeWidth={2} />}
        label={SORT_OPTIONS.find((o) => o.value === sortBy)?.label ?? "Sort"}
        options={SORT_OPTIONS}
        value={sortBy}
        onChange={(v) => onSortChange(v as "priority" | "dueDate" | "createdAt")}
      />
    </div>
  );
}

// Reusable dropdown component
function Dropdown<T extends { value: string; label: string }>({
  icon,
  label,
  options,
  value,
  onChange,
  renderOption,
}: {
  icon: React.ReactNode;
  label: string;
  options: T[];
  value: string;
  onChange: (value: string) => void;
  renderOption?: (option: T) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12px] font-medium transition-all ${
          open
            ? "border-[#1a73e8] bg-white text-[#1a73e8] shadow-sm"
            : "border-[#e0e0e0] bg-white text-[#666] hover:border-[#ccc] hover:text-[#333]"
        }`}
      >
        {icon}
        {label}
        <ChevronDown
          size={11}
          strokeWidth={2}
          className={`transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-1.5 min-w-[160px] overflow-hidden rounded-xl border border-[#e0e0e0] bg-white py-1 shadow-lg">
          {options.map((opt) => (
            <button
              key={opt.value}
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
              className={`flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] font-medium transition-colors ${
                value === opt.value
                  ? "bg-[#f0f5ff] text-[#1a73e8]"
                  : "text-[#555] hover:bg-[#f8f8f8]"
              }`}
            >
              {renderOption ? renderOption(opt) : opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
