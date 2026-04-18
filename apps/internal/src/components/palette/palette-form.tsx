"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import type { ReactNode } from "react";

type Field =
  | { key: string; label: string; type: "text"; required?: boolean; placeholder?: string }
  | { key: string; label: string; type: "date"; required?: boolean }
  | { key: string; label: string; type: "select"; required?: boolean; options: { value: string; label: string }[] }
  | { key: string; label: string; type: "textarea"; required?: boolean; rows?: number };

export type PaletteFormProps = {
  title: string;
  fields: Field[];
  submitLabel?: string;
  onCancel: () => void;
  onSubmit: (values: Record<string, string>) => Promise<{ success: true } | { success: false; error: string }>;
  onSuccess?: (values: Record<string, string>) => void;
  footer?: ReactNode;
};

export function PaletteInlineForm({
  title, fields, submitLabel = "Create", onCancel, onSubmit, onSuccess, footer,
}: PaletteFormProps) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const firstFieldRef = useRef<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(null);
  useEffect(() => {
    firstFieldRef.current?.focus();
  }, []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await onSubmit(values);
      if (!res.success) {
        setError(res.error);
        return;
      }
      onSuccess?.(values);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="p-4">
      <div className="mb-3 text-[13px] font-semibold text-[#222]">{title}</div>
      <div className="flex flex-col gap-3">
        {fields.map((f, index) => (
          <label key={f.key} className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-wide text-[#888]">{f.label}</span>
            {f.type === "textarea" ? (
              <textarea
                ref={index === 0 ? (firstFieldRef as React.RefObject<HTMLTextAreaElement>) : undefined}
                rows={f.rows ?? 3}
                required={f.required}
                value={values[f.key] ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                className="rounded-md border border-[#e0e0e0] px-3 py-2 text-[13px] outline-none focus:border-[#222]"
              />
            ) : f.type === "select" ? (
              <select
                ref={index === 0 ? (firstFieldRef as React.RefObject<HTMLSelectElement>) : undefined}
                required={f.required}
                value={values[f.key] ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                className="rounded-md border border-[#e0e0e0] px-3 py-2 text-[13px] outline-none focus:border-[#222]"
              >
                <option value="">Select…</option>
                {f.options.map((o) => (<option key={o.value} value={o.value}>{o.label}</option>))}
              </select>
            ) : (
              <input
                ref={index === 0 ? (firstFieldRef as React.RefObject<HTMLInputElement>) : undefined}
                type={f.type === "date" ? "date" : "text"}
                required={f.required}
                placeholder={"placeholder" in f ? f.placeholder : undefined}
                value={values[f.key] ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                className="rounded-md border border-[#e0e0e0] px-3 py-2 text-[13px] outline-none focus:border-[#222]"
              />
            )}
          </label>
        ))}
      </div>
      {error && <p className="mt-3 text-[12px] text-[#c0392b]">{error}</p>}
      <div className="mt-4 flex items-center justify-between">
        {footer}
        <div className="ml-auto flex items-center gap-2">
          <button type="button" onClick={onCancel}
            className="rounded-md border border-[#e0e0e0] bg-white px-3 py-1.5 text-[13px] text-[#555]">
            Cancel
          </button>
          <button type="submit" disabled={isPending}
            className="rounded-md bg-[#111] px-3 py-1.5 text-[13px] font-medium text-white disabled:opacity-50">
            {isPending ? "Saving…" : submitLabel}
          </button>
        </div>
      </div>
    </form>
  );
}
